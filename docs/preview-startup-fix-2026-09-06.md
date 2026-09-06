# Docker preview startup and SSR revision confirmation

Production release `00b6ee0` deployed successfully, but the existing Rye & Salt
project remained on the starting/updating status. Its sandbox was running and
an in-container request to port 5173 returned HTTP 200. The bakery eventually
rendered while the editor still displayed an updating status.

Two defects were identified:

- Docker phase polls excluded the readiness promotion used by other providers.
  A boot that exhausted its initial readiness budget could stay at `starting`.
  Phase polls now recheck the app inside the existing Docker container and
  promote only an explicitly ready result. Concurrent polls share the probe;
  a transient failure does not prevent the next poll from trying again.
- The SSR root document contained the newly injected revision script on disk,
  but the existing browser document did not contain that script. React HMR
  does not execute newly inserted script elements. Sync now requests an iframe
  reload when an instrumented SSR document actually changes on disk. Ordinary
  Vite source updates retain HMR. JSX closing-tag capitalization is preserved.

No saved customer project files or database schema were changed. Instrumentation
is applied to the sandbox copy. Tests cover readiness, concurrent failures and
retries, SSR injection, stable document content, and message source/origin checks.
