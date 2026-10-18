# Polyglot Spellchecker

Polyglot Spellchecker is a native Linux desktop application built with
Electron. It checks large documents in an editor and uses an AI backend to
suggest corrections, including for badly misspelled words. It is a desktop
app, not a website or command-line spellchecker.

The Electron interface sends text to a Rust orchestrator, which filters
obvious words, caches results, and calls a Python gRPC service for suggestions.

## Project layout

```text
app/             Electron main process, preload bridge, and editor UI
orchestrator/    Rust process for filtering, caching, and gRPC
python_backend/  Python gRPC service and AI engines
proto/           Shared Protocol Buffers service definition
```

## Requirements

- Linux
- Node.js 20+ and npm
- Rust stable (`rustup`)
- Python 3.10+ and pip
- `protoc` (Protocol Buffers compiler), for example `sudo apt install protobuf-compiler`
- Optional: a system word list such as `/usr/share/dict/words` (on Debian/Ubuntu, install `wamerican`)

## Install

Install the Electron and Python dependencies:

```bash
cd app
npm install
cd ../python_backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
cd ..
```

The Python backend needs generated gRPC modules. Generate them from the shared
proto definition:

```bash
cd python_backend
mkdir -p generated
python -m grpc_tools.protoc -I../proto \
  --python_out=generated --grpc_python_out=generated ../proto/spellcheck.proto
cd ..
```

## Run the desktop app

From `app/`, start the app with the Python virtual environment's interpreter:

```bash
cd app
PYTHON_CMD=../python_backend/.venv/bin/python npm start
```

`npm start` builds the Rust orchestrator in release mode before launching
Electron. The default backend is a lightweight mock based on dictionary
matches; select an AI model backend with environment variables:

```bash
SPELLCHECK_BACKEND=transformers \
MODEL_ID=Qwen/Qwen2.5-0.5B-Instruct \
PYTHON_CMD=../python_backend/.venv/bin/python npm start
```

Install the optional model dependencies with
`pip install -e ".[transformers]"` or `pip install -e ".[llama]"` from
`python_backend/`. For llama.cpp, set `GGUF_PATH` to a local GGUF model file.

## Build Linux packages

After completing the install and proto-generation steps, run from `app/`:

```bash
npm run dist
```

The build produces Linux AppImage and Debian packages. Python and its backend
dependencies must be available on the target system; set `PYTHON_CMD` if the
Python executable is not `python3`.

## Configuration

| Variable | Used by | Purpose |
|---|---|---|
| `PYTHON_CMD` | Electron | Python executable used to start the backend |
| `SPELLCHECK_SKIP_PYTHON=1` | Electron | Skip starting Python when running it separately |
| `DICT_PATH` | Rust, Python mock | Path to a word list |
| `PYTHON_BACKEND_ADDR` | Rust | gRPC destination (default `http://127.0.0.1:50051`) |
| `PYTHON_BACKEND_BIND` | Python | gRPC bind address (default `127.0.0.1:50051`) |
| `SPELLCHECK_BACKEND` | Python | `mock`, `transformers`, or `llama_cpp` |
| `MODEL_ID` | Python | Transformers model ID |
| `GGUF_PATH` | Python | Local GGUF model file for llama.cpp |

## Troubleshooting

- **`protoc` not found during the Rust build:** install `protobuf-compiler`.
- **`ModuleNotFoundError` for `spellcheck_pb2`:** run the proto-generation step
  and ensure `PYTHON_CMD` points to the Python environment with backend dependencies.
- **No useful mock suggestions:** install a word list or set `DICT_PATH` to one.
