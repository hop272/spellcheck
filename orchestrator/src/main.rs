// orchestrator/src/main.rs
// Role: (1) read JSON-line requests from Electron on stdin, (2) validate and
// pre-filter with a dictionary so clean text never costs an AI call,
// (3) serve repeats from an LRU cache, (4) call Python over gRPC for the rest,
// (5) write JSON-line responses to stdout. Logs go to stderr only.
use std::{collections::HashSet, env, num::NonZeroUsize, sync::Arc, time::Duration};

use anyhow::Result;
use lru::LruCache;
use serde::{Deserialize, Serialize};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    sync::{mpsc, Mutex},
    time::timeout,
};
use tonic::transport::{Channel, Endpoint};

mod pb {
    tonic::include_proto!("spellcheck.v1");
}
use pb::{
    spellchecker_client::SpellcheckerClient, EnhanceRequest, ListModelsRequest, Span,
    SpellcheckRequest,
};

const MAX_TEXT_BYTES: usize = 200_000;
const GRPC_TIMEOUT: Duration = Duration::from_secs(15);

// ---------- Electron-facing JSON types ----------
#[derive(Deserialize)]
struct UiRequest {
    id: String,
    #[serde(default = "default_operation")]
    operation: String,
    #[serde(default)]
    text: String,
    #[serde(default = "default_lang")]
    language: String,
    #[serde(default)]
    instruction: String,
    #[serde(default)]
    model: String,
}
fn default_operation() -> String {
    "check".into()
}
fn default_lang() -> String {
    "en".into()
}

#[derive(Serialize, Clone)]
struct UiSuggestion {
    start: i32,
    end: i32,
    original: String,
    candidates: Vec<String>,
    confidence: f32,
    explanation: String,
}

#[derive(Serialize)]
struct UiResponse {
    id: String,
    suggestions: Vec<UiSuggestion>,
    source: &'static str, // "prefilter" | "cache" | "ai" | "error"
    error: Option<String>,
    proposed_text: Option<String>,
    models: Option<Vec<String>>,
}

fn respond(
    id: String,
    suggestions: Vec<UiSuggestion>,
    source: &'static str,
    error: Option<String>,
) -> UiResponse {
    UiResponse {
        id,
        suggestions,
        source,
        error,
        proposed_text: None,
        models: None,
    }
}

// ---------- Shared state ----------
struct State {
    dict: HashSet<String>,
    // ARCH NOTE: keyed on the whole text, so any edit misses. For better hit
    // rates, key per sentence or per (word, left-context) pair.
    cache: Mutex<LruCache<String, Vec<UiSuggestion>>>,
    client: SpellcheckerClient<Channel>,
}

fn load_dictionary() -> HashSet<String> {
    let path = env::var("DICT_PATH").unwrap_or_else(|_| "/usr/share/dict/words".into());
    match std::fs::read_to_string(&path) {
        Ok(s) => s.lines().map(|l| l.trim().to_lowercase()).collect(),
        Err(_) => {
            eprintln!("[orchestrator] WARNING: no dictionary at {path}; using tiny fallback. Set DICT_PATH.");
            [
                "the", "a", "an", "and", "is", "are", "to", "of", "in", "it", "this", "that",
                "hello", "world",
            ]
            .iter()
            .map(|s| s.to_string())
            .collect()
        }
    }
}

/// Fast pre-filter: returns words not found in the dictionary.
/// Offsets are UTF-16 code units so they line up with JS string indices.
/// ARCH NOTE: dictionary lookup can't catch real-word errors ("their"/"there").
/// Add n-gram or heuristic checks here, or flag sentences for AI review.
fn find_suspects(text: &str, dict: &HashSet<String>) -> Vec<Span> {
    let mut out = Vec::new();
    let mut word = String::new();
    let (mut start, mut pos) = (0i32, 0i32);

    for ch in text.chars().chain(std::iter::once(' ')) {
        if ch.is_alphabetic() || (ch == '\'' && !word.is_empty()) {
            if word.is_empty() {
                start = pos;
            }
            word.push(ch);
        } else if !word.is_empty() {
            let w = word.trim_end_matches('\'');
            let is_acronym = w.chars().all(|c| c.is_uppercase());
            if w.chars().count() >= 2 && !is_acronym && !dict.contains(&w.to_lowercase()) {
                let len16 = w.encode_utf16().count() as i32;
                out.push(Span {
                    start,
                    end: start + len16,
                    word: w.to_string(),
                });
            }
            word.clear();
        }
        pos += ch.len_utf16() as i32;
    }
    out
}

async fn handle(state: Arc<State>, req: UiRequest) -> UiResponse {
    if req.operation == "models" {
        let grpc_req = ListModelsRequest {
            request_id: req.id.clone(),
        };
        let mut client = state.client.clone();
        return match timeout(GRPC_TIMEOUT, client.list_models(tonic::Request::new(grpc_req))).await {
            Ok(Ok(response)) => UiResponse {
                id: req.id,
                suggestions: vec![],
                source: "ai",
                error: None,
                proposed_text: None,
                models: Some(response.into_inner().models),
            },
            Ok(Err(status)) => respond(req.id, vec![], "error", Some(format!("backend: {}", status.message()))),
            Err(_) => respond(req.id, vec![], "error", Some("backend timeout".into())),
        };
    }

    if req.operation == "enhance" {
        if req.text.len() > MAX_TEXT_BYTES {
            return respond(req.id, vec![], "error", Some("text too large".into()));
        }
        let grpc_req = EnhanceRequest {
            request_id: req.id.clone(),
            text: req.text,
            instruction: req.instruction,
            model: req.model,
        };
        let mut client = state.client.clone();
        return match timeout(GRPC_TIMEOUT, client.enhance(tonic::Request::new(grpc_req))).await {
            Ok(Ok(response)) => UiResponse {
                id: req.id,
                suggestions: vec![],
                source: "ai",
                error: None,
                proposed_text: Some(response.into_inner().proposed_text),
                models: None,
            },
            Ok(Err(status)) => respond(req.id, vec![], "error", Some(format!("backend: {}", status.message()))),
            Err(_) => respond(req.id, vec![], "error", Some("backend timeout".into())),
        };
    }

    if req.text.len() > MAX_TEXT_BYTES {
        return respond(req.id, vec![], "error", Some("text too large".into()));
    }

    let suspects = find_suspects(&req.text, &state.dict);
    if suspects.is_empty() {
        return respond(req.id, vec![], "prefilter", None); // no AI cost
    }

    let key = format!("{}\u{0}{}", req.language, req.text);
    if let Some(hit) = state.cache.lock().await.get(&key) {
        return respond(req.id, hit.clone(), "cache", None);
    }

    let grpc_req = SpellcheckRequest {
        request_id: req.id.clone(),
        text: req.text.clone(),
        language: req.language.clone(),
        suspect_spans: suspects,
    };
    let mut client = state.client.clone();
    let result = timeout(GRPC_TIMEOUT, client.check(tonic::Request::new(grpc_req))).await;

    match result {
        Ok(Ok(resp)) => {
            let suggestions: Vec<UiSuggestion> = resp
                .into_inner()
                .suggestions
                .into_iter()
                .map(|s| UiSuggestion {
                    start: s.start,
                    end: s.end,
                    original: s.original,
                    candidates: s.candidates,
                    confidence: s.confidence,
                    explanation: s.explanation,
                })
                .collect();
            state.cache.lock().await.put(key, suggestions.clone());
            respond(req.id, suggestions, "ai", None)
        }
        Ok(Err(status)) => respond(
            req.id,
            vec![],
            "error",
            Some(format!("backend: {}", status.message())),
        ),
        Err(_) => respond(req.id, vec![], "error", Some("backend timeout".into())),
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    let addr = env::var("PYTHON_BACKEND_ADDR").unwrap_or_else(|_| "http://127.0.0.1:50051".into());
    // connect_lazy: the orchestrator can start before Python finishes loading its model.
    let channel = Endpoint::from_shared(addr)?.connect_lazy();

    let state = Arc::new(State {
        dict: load_dictionary(),
        cache: Mutex::new(LruCache::new(NonZeroUsize::new(1024).unwrap())),
        client: SpellcheckerClient::new(channel),
    });

    // Single writer task keeps stdout lines from interleaving.
    let (tx, mut rx) = mpsc::channel::<String>(256);
    tokio::spawn(async move {
        let mut out = tokio::io::stdout();
        while let Some(line) = rx.recv().await {
            let _ = out.write_all(line.as_bytes()).await;
            let _ = out.write_all(b"\n").await;
            let _ = out.flush().await;
        }
    });

    let mut lines = BufReader::new(tokio::io::stdin()).lines();
    eprintln!("[orchestrator] ready");

    // Loop ends on stdin EOF (Electron exited), so the process exits cleanly.
    while let Some(line) = lines.next_line().await? {
        let req: UiRequest = match serde_json::from_str(&line) {
            Ok(r) => r,
            Err(e) => {
                eprintln!("[orchestrator] bad request: {e}");
                continue;
            }
        };
        let (state, tx) = (state.clone(), tx.clone());
        tokio::spawn(async move {
            let resp = handle(state, req).await;
            if let Ok(json) = serde_json::to_string(&resp) {
                let _ = tx.send(json).await;
            }
        });
    }
    Ok(())
}
