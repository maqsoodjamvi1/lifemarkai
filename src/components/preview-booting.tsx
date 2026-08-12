/**
 * Shown for a preview hostname whose sandbox is not currently serving.
 *
 * Deliberately plain: no product branding, no navigation, nothing that could be
 * mistaken for the app the user is actually building. Someone looking at this
 * inside a preview pane — or following a shared link — should understand in one
 * glance that the thing they want is starting, not that it has been replaced.
 *
 * It reloads itself on an interval because there is nothing to push to: this
 * page is served by the main app precisely because the preview backend is
 * absent, so it has no connection to the sandbox to listen on. The interval
 * backs off, since a preview that has not come up in a minute is more likely to
 * be a cold npm install (or a project with no sandbox at all) than something a
 * fast poll will catch.
 */
import { useEffect,useRef,useState } from "react";

const FIRST_RETRY_MS = 3_000;
const MAX_RETRY_MS = 15_000;

export function PreviewBooting() {
  const [elapsed, setElapsed] = useState(0);
  const delayRef = useRef(FIRST_RETRY_MS);

  useEffect(() => {
    const started = Date.now();
    const tick = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - started) / 1000));
    }, 1000);

    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(() => {
        window.location.reload();
      }, delayRef.current);
      delayRef.current = Math.min(Math.round(delayRef.current * 1.5), MAX_RETRY_MS);
    };
    schedule();

    return () => {
      window.clearInterval(tick);
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        background: "#0b0b0c",
        color: "#e6e6e7",
      }}
    >
      <div style={{ maxWidth: 420, textAlign: "center" }}>
        <div
          aria-hidden
          style={{
            width: 28,
            height: 28,
            margin: "0 auto 1.25rem",
            borderRadius: "50%",
            border: "2px solid rgba(255,255,255,0.15)",
            borderTopColor: "rgba(255,255,255,0.7)",
            animation: "lm-spin 0.8s linear infinite",
          }}
        />
        <h1 style={{ fontSize: "1rem", fontWeight: 500, margin: "0 0 0.5rem" }}>
          This preview is starting
        </h1>
        <p
          style={{
            fontSize: "0.8125rem",
            lineHeight: 1.6,
            margin: 0,
            color: "rgba(230,230,231,0.6)",
          }}
        >
          The app is being built and started. This page refreshes on its own —
          the first run takes longer than later ones.
        </p>
        {elapsed >= 45 && (
          <p
            style={{
              fontSize: "0.75rem",
              lineHeight: 1.6,
              marginTop: "1.25rem",
              color: "rgba(230,230,231,0.45)",
            }}
          >
            Still waiting after {elapsed}s. If this does not clear, open the
            project in the editor — it can show what the build is doing and
            restart the preview.
          </p>
        )}
        <style>{`@keyframes lm-spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    </div>
  );
}
