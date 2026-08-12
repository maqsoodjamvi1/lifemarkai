/**
 * Styled 500 error page (MuseCode-parity, improvement #4) — shown instead of
 * a blank screen or a raw JSON blob when SSR fails catastrophically.
 */
export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Something went wrong — LifemarkAI</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center;
         background: #0a0a0a; color: #e4e4e7;
         font-family: system-ui, -apple-system, sans-serif; }
  .card { text-align: center; max-width: 26rem; padding: 2.5rem 2rem; }
  .badge { width: 3rem; height: 3rem; margin: 0 auto 1rem; border-radius: 0.75rem;
           background: rgba(139, 92, 246, .15); border: 1px solid rgba(139, 92, 246, .25);
           display: grid; place-items: center; font-size: 1.25rem; }
  h1 { font-size: 1rem; margin: 0 0 .5rem; }
  p { font-size: .8rem; color: #a1a1aa; line-height: 1.6; margin: 0 0 1.5rem; }
  a { display: inline-block; padding: .5rem 1.25rem; border-radius: .5rem;
      background: #7c3aed; color: #fff; text-decoration: none; font-size: .8rem; }
</style>
</head>
<body>
  <div class="card">
    <div class="badge">⚠️</div>
    <h1>Something went wrong</h1>
    <p>The server hit an unexpected error. Your work is saved — reload the page to continue. If this keeps happening, the error has been logged and we're on it.</p>
    <a href="/">Reload LifemarkAI</a>
  </div>
</body>
</html>`;
}
