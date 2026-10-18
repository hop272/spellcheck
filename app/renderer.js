// app/renderer.js: UI logic: debounce typing, request checks, render suggestions.
const editor = document.getElementById("editor");
const list = document.getElementById("suggestions");
const status = document.getElementById("status");

const DEBOUNCE_MS = 600;
let timer = null;
let latestSeq = 0; // used to discard out-of-order responses

editor.addEventListener("input", () => {
  clearTimeout(timer);
  timer = setTimeout(runCheck, DEBOUNCE_MS);
});

async function runCheck() {
  const seq = ++latestSeq;
  const snapshot = editor.value;
  if (!snapshot.trim()) { list.replaceChildren(); status.textContent = "Idle"; return; }

  status.textContent = "Checking...";
  const res = await window.api.check(snapshot, "en");

  // Drop stale responses, and drop any whose offsets no longer match the text.
  if (seq !== latestSeq || snapshot !== editor.value) return;

  if (res.error) { status.textContent = `Error: ${res.error}`; return; }
  status.textContent = `${res.suggestions.length} issue(s) · source: ${res.source}`;
  render(res.suggestions, snapshot);
}

function render(suggestions, snapshot) {
  list.replaceChildren();
  for (const s of suggestions) {
    const item = document.createElement("div");
    item.className = "item";

    const orig = document.createElement("span");
    orig.className = "orig";
    orig.textContent = s.original; // textContent, never innerHTML (XSS-safe)
    item.appendChild(orig);

    if (s.explanation) {
      const why = document.createElement("div");
      why.textContent = s.explanation;
      why.style.fontSize = "12px";
      item.appendChild(why);
    }

    const row = document.createElement("div");
    for (const c of s.candidates) {
      const btn = document.createElement("button");
      btn.className = "cand";
      btn.textContent = c;
      btn.onclick = () => applySuggestion(s, c, snapshot);
      row.appendChild(btn);
    }
    item.appendChild(row);
    list.appendChild(item);
  }
}

function applySuggestion(s, replacement, snapshot) {
  if (editor.value !== snapshot) return runCheck(); // text changed; offsets are stale
  editor.value = snapshot.slice(0, s.start) + replacement + snapshot.slice(s.end);
  runCheck();
}

// ARCH NOTE: a <textarea> can't underline ranges inline. For squiggles, swap
// it for CodeMirror 6 or ProseMirror and map `suggestions` to decorations.