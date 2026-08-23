# Codespace test & debug — polyglot editor

## Quick gate (no side services)

```bash
npm install
node scripts/verify-polyglot-codespace.mjs
# or:
npm run verify:preview-smoke
node --import tsx --test src/lib/intelligence/polyglot-bridge.test.ts
```

Expected: preview smoke **≥50** (currently 123/123), bridge offline tests green.

## Full polyglot stack

Terminal A — Python AI:

```bash
cd services/python-ai
pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8766
```

Terminal B — Rust AST:

```bash
cd services/rust-ast
cargo run --release
# listens on :8765
```

Terminal C — app + probes:

```bash
export LIFEMARK_RUST_AST_URL=http://127.0.0.1:8765
export LIFEMARK_PYTHON_AI_URL=http://127.0.0.1:8766
node scripts/verify-polyglot-codespace.mjs

# manual probes
curl -s $LIFEMARK_RUST_AST_URL/health
curl -s -X POST $LIFEMARK_RUST_AST_URL/index -H 'Content-Type: application/json' \
  -d '{"files":[{"path":"a.ts","content":"export function foo(){ bar() }\nfunction bar(){}"}]}'
curl -s -X POST $LIFEMARK_RUST_AST_URL/impact -H 'Content-Type: application/json' -d '{"symbol":"bar"}'
curl -s $LIFEMARK_PYTHON_AI_URL/health
curl -s -X POST $LIFEMARK_PYTHON_AI_URL/plan -H 'Content-Type: application/json' \
  -d '{"goal":"Build a todo app","context":{"files":["src/App.tsx"]}}'
```

## Issues fixed during this pass

1. **Schema unit tests** expected `{ ok: boolean }` but API returns `string[]` (empty = valid). Argument order for `validateRecordAgainstSchema` is `(data, schema)`. `lifemarkDataSdkScript` is a **function** — call it before matching.
2. **Initiative route** was briefly corrupted during push; restored with `onVerify` → `runQaVerification`.
3. **Orchestrator** uses `enrichTasksWithAstRisk` from `polyglot-hooks.ts` before debate; offline when URLs unset.

## Editor app (TanStack Start)

```bash
cp .env.local.example .env.local   # fill Supabase / OpenRouter as needed
npm run dev
# open editor → Intelligence panel → engines badge (polyglot-status)
```
