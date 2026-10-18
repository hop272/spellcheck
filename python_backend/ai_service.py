# python_backend/ai_service.py: model loading, prompt engineering, output parsing.
# Select the backend with SPELLCHECK_BACKEND = mock | transformers | llama_cpp
import difflib
import json
import os
import re
import threading
from dataclasses import dataclass, field

SYSTEM_PROMPT = (
    "You are a precise spellchecker. For each misspelled word you are given, "
    "return the most likely intended words ranked best-first, using the sentence "
    "for context. Respond with ONLY a JSON object mapping each word to a list of "
    'up to 5 candidates, e.g. {"teh": ["the", "tea"]}. No prose, no markdown.'
)


@dataclass
class Result:
    start: int
    end: int
    original: str
    candidates: list[str] = field(default_factory=list)
    confidence: float = 0.0
    explanation: str = ""


def build_user_prompt(text: str, words: list[str], language: str) -> str:
    # ARCH NOTE: for long documents send only the sentence around each span
    # (the orchestrator could also pre-slice) to cut latency and cost.
    return f"Language: {language}\nText: {text}\nMisspelled words: {json.dumps(words)}"


def parse_candidates(raw: str) -> dict[str, list[str]]:
    """Tolerant JSON extraction: small models often wrap output in prose/fences."""
    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if not match:
        return {}
    try:
        data = json.loads(match.group(0))
    except json.JSONDecodeError:
        return {}
    return {
        str(k): [str(c) for c in v if isinstance(c, str)]
        for k, v in data.items() if isinstance(v, list)
    }


class AIEngine:
    name = "base"

    @staticmethod
    def from_env() -> "AIEngine":
        backend = os.environ.get("SPELLCHECK_BACKEND", "mock")
        return {"transformers": TransformersEngine, "llama_cpp": LlamaCppEngine}.get(backend, MockEngine)()

    def load(self) -> None: ...

    def generate(self, user_prompt: str) -> str:
        raise NotImplementedError

    def suggest(self, text: str, spans: list[tuple[int, int, str]], language: str) -> list[Result]:
        if not spans:
            return []
        words = list(dict.fromkeys(w for _, _, w in spans))  # unique, order-preserving
        mapping = parse_candidates(self.generate(build_user_prompt(text, words, language)))
        results = []
        for start, end, word in spans:
            cands = mapping.get(word, [])[:5]
            # ARCH NOTE: replace the flat 0.5 with a real score (token
            # log-probs, or edit-distance rerank blended with LM probability).
            results.append(Result(start, end, word, cands, 0.5 if cands else 0.0))
        return results


class MockEngine(AIEngine):
    """No model download needed; difflib against a word list. Good for wiring tests."""
    name = "mock-difflib"

    def load(self) -> None:
        path = os.environ.get("DICT_PATH", "/usr/share/dict/words")
        try:
            with open(path, encoding="utf-8") as f:
                self.vocab = [w.strip().lower() for w in f if w.strip()]
        except OSError:
            self.vocab = []

    def suggest(self, text, spans, language):
        out = []
        for start, end, word in spans:
            cands = difflib.get_close_matches(word.lower(), self.vocab, n=5, cutoff=0.7)
            out.append(Result(start, end, word, cands, 0.3 if cands else 0.0, "difflib match"))
        return out


class TransformersEngine(AIEngine):
    def __init__(self):
        self.model_id = os.environ.get("MODEL_ID", "Qwen/Qwen2.5-0.5B-Instruct")
        self.name = f"transformers:{self.model_id}"
        self._lock = threading.Lock()  # one generation at a time

    def load(self) -> None:
        from transformers import AutoModelForCausalLM, AutoTokenizer
        self.tok = AutoTokenizer.from_pretrained(self.model_id)
        self.model = AutoModelForCausalLM.from_pretrained(self.model_id, device_map="auto")

    def generate(self, user_prompt: str) -> str:
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ]
        prompt = self.tok.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        inputs = self.tok(prompt, return_tensors="pt").to(self.model.device)
        with self._lock:
            out = self.model.generate(**inputs, max_new_tokens=256, do_sample=False)
        return self.tok.decode(out[0][inputs.input_ids.shape[1]:], skip_special_tokens=True)


class LlamaCppEngine(AIEngine):
    def __init__(self):
        self.model_path = os.environ["GGUF_PATH"]  # path to a .gguf file
        self.name = f"llama.cpp:{os.path.basename(self.model_path)}"
        self._lock = threading.Lock()

    def load(self) -> None:
        from llama_cpp import Llama
        self.llm = Llama(model_path=self.model_path, n_ctx=2048, verbose=False)

    def generate(self, user_prompt: str) -> str:
        with self._lock:
            res = self.llm.create_chat_completion(
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                max_tokens=256,
                temperature=0.0,
            )
        return res["choices"][0]["message"]["content"]