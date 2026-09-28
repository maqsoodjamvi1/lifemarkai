# Optional structural risk hints

Run `cargo run --release` from this directory and set
`LIFEMARK_RUST_AST_URL=http://127.0.0.1:8765` in the application process.
The service listens on loopback only; keep it on the same host or private network
as the application. Leave the variable unset when the service is unavailable.

The initiative sends at most 100 files and 1 MB of source in a single request.
It raises a task's planner risk only when the task names an exact project path
and other files call a declaration in that path. This lightweight heuristic
is advisory and does not prove a dependency or replace preview verification.
Requests hold no state, so project files cannot mix between runs.
