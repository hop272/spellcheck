// app/preload.js: exposes a minimal, typed API to the renderer.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  check: (text, language) => ipcRenderer.invoke("spellcheck:check", { text, language }),
});