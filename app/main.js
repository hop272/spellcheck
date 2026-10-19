// app/main.js: Electron main process.
// Responsibilities: window lifecycle, spawn/supervise the Rust orchestrator
// (and optionally the Python backend), and bridge renderer IPC <-> Rust stdio.
const { app, BrowserWindow, ipcMain } = require("electron");
const { spawn } = require("child_process");
const readline = require("readline");
const path = require("path");
const crypto = require("crypto");

const isWin = process.platform === "win32";
const REQUEST_TIMEOUT_MS = 185000;

let win = null;
let orchestrator = null;
let pythonProc = null;
const pending = new Map(); // request id -> { resolve, timer }

function orchestratorPath() {
  const exe = isWin ? "orchestrator.exe" : "orchestrator";
  return app.isPackaged
    ? path.join(process.resourcesPath, "bin", exe)
    : path.join(__dirname, "..", "orchestrator", "target", "release", exe);
}

function startPython() {
  // Set SPELLCHECK_SKIP_PYTHON=1 to run the backend yourself (handy for debugging).
  if (process.env.SPELLCHECK_SKIP_PYTHON) return;
  const cmd = process.env.PYTHON_CMD || (isWin ? "python" : "python3");
  const script = app.isPackaged
    ? path.join(process.resourcesPath, "python_backend", "main.py")
    : path.join(__dirname, "..", "python_backend", "main.py");
  pythonProc = spawn(cmd, [script], { stdio: ["ignore", "inherit", "inherit"] });
  pythonProc.on("exit", (code) => console.error(`[python] exited with ${code}`));
}

function startOrchestrator() {
  orchestrator = spawn(orchestratorPath(), [], {
    stdio: ["pipe", "pipe", "inherit"], // stderr -> our console for logs
  });

  // One JSON object per line on stdout = one response.
  readline.createInterface({ input: orchestrator.stdout }).on("line", (line) => {
    let msg;
    try { msg = JSON.parse(line); } catch { return console.error("[rust] bad line:", line); }
    const entry = pending.get(msg.id);
    if (!entry) return; // timed out or stale
    clearTimeout(entry.timer);
    pending.delete(msg.id);
    entry.resolve(msg);
  });

  orchestrator.on("exit", (code) => {
    console.error(`[rust] exited with ${code}`);
    // Fail everything in flight so the UI doesn't hang.
    for (const [id, { resolve, timer }] of pending) {
      clearTimeout(timer);
      resolve({ id, suggestions: [], source: "error", error: "orchestrator exited" });
    }
    pending.clear();
    // ARCH NOTE: add restart-with-backoff supervision here.
  });
}

function sendToRust(payload) {
  return new Promise((resolve) => {
    const id = crypto.randomUUID();
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve({ id, suggestions: [], source: "error", error: "timeout" });
    }, REQUEST_TIMEOUT_MS);
    pending.set(id, { resolve, timer });
    orchestrator.stdin.write(JSON.stringify({ id, ...payload }) + "\n");
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,   // keep renderer sandboxed from Node
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, "index.html"));
}

app.whenReady().then(() => {
  startPython();
  startOrchestrator();

  ipcMain.handle("spellcheck:check", (_event, { text, language }) => {
    if (typeof text !== "string") return { suggestions: [], source: "error", error: "invalid input" };
    return sendToRust({ text, language: language || "en" });
  });
  ipcMain.handle("text-enhance:models", () => sendToRust({ operation: "models" }));
  ipcMain.handle("text-enhance:enhance", (_event, { text, instruction, model }) => {
    if (typeof text !== "string" || typeof instruction !== "string" || typeof model !== "string") {
      return { source: "error", error: "invalid input" };
    }
    return sendToRust({ operation: "enhance", text, instruction, model });
  });

  createWindow();
  app.on("activate", () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});

function shutdown() {
  if (orchestrator) orchestrator.kill();
  if (pythonProc) pythonProc.kill();
}
app.on("before-quit", shutdown);
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });