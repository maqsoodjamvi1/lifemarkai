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
 * absent, so it has no connection to the sandbox to listen on.
 *
 * The retry schedule lives in preview-boot-retry.ts as a pure function, and the
 * two numbers it needs (attempts so far, when the visitor first arrived) are
 * kept in sessionStorage — because a reload destroys every in-memory value this
 * component holds. An earlier version kept the delay in a ref and multiplied it
 * after scheduling, which read like backoff but wasn't: each reload started the
 * module over with the delay back at 3s, so the page hammered a dead hostname
 * every 3s until the tab was closed, telling the visitor nothing (see #10).
 * Now it backs off for real and, once the preview is clearly absent rather than
 * slow, it stops and says so.
 */
import { useEffect, useRef, useState } from "react";

import { GIVE_UP_AFTER_MS, nextBootRetry } from "@/lib/preview/preview-boot-retry";

/**
 * Scoped per hostname: two different dead previews in one tab session should
 * not share a countdown, or the second would appear to give up instantly.
 */
function storageKey(): string {
  const host = typeof window === "undefined" ? "" : window.location.host;
  return `lm.preview-boot.${host}`;
}

interface BootState {
  attempt: number;
  since: number;
}

/**
 * sessionStorage is wrapped because it is not always reachable: a sandboxed
 * iframe without allow-same-origin throws on access, and blocked third-party
 * storage does too. A boot page that crashed on a storage read would replace a
 * spinner with a blank white frame — strictly worse than the bug it fixes.
 */
function readState(): BootState {
  const fresh = { attempt: 0, since: Date.now() };
  try {
    const raw = window.sessionStorage.getItem(storageKey());
    if (!raw) return fresh;
    const parsed = JSON.parse(raw) as Partial<BootState>;
    if (!Number.isFinite(parsed?.since) || !Number.isFinite(parsed?.attempt)) return fresh;
    return { attempt: Number(parsed.attempt), since: Number(parsed.since) };
  } catch {
    return fresh;
  }
}

function writeState(state: BootState): void {
  try {
    window.sessionStorage.setItem(storageKey(), JSON.stringify(state));
  } catch {
    /* see readState — storage is an optimisation here, never a requirement */
  }
}

function clearState(): void {
  try {
    window.sessionStorage.removeItem(storageKey());
  } catch {
    /* ignore */
  }
}

export function PreviewBooting() {
  const [elapsed, setElapsed] = useState(0);
  const [gaveUp, setGaveUp] = useState(false);
  const stateRef = useRef<BootState | null>(null);

  useEffect(() => {
    const state = readState();
    stateRef.current = state;

    const sinceArrival = () => Date.now() - state.since;

    let reloadTimer = 0;

    // Deliberately deferred rather than run in the effect body. The server
    // renders this page too, and it cannot see sessionStorage — so the first
    // client paint has to match the server's ("starting", 0s) or React reports
    // a hydration mismatch. Settling the real state a tick later costs nothing
    // a visitor can perceive and keeps the two renders identical.
    const settle = () => {
      setElapsed(Math.floor(sinceArrival() / 1000));

      const decision = nextBootRetry(state.attempt, sinceArrival());
      if (decision.action === "give-up") {
        // Leave the counter in place: a manual retry should resume the honest
        // total rather than restart the clock and re-hide the outcome.
        setGaveUp(true);
        return;
      }

      reloadTimer = window.setTimeout(() => {
        writeState({ attempt: state.attempt + 1, since: state.since });
        window.location.reload();
      }, decision.delayMs);
    };

    const settleTimer = window.setTimeout(settle, 0);
    const tick = window.setInterval(() => {
      setElapsed(Math.floor(sinceArrival() / 1000));
    }, 1000);

    return () => {
      window.clearInterval(tick);
      window.clearTimeout(settleTimer);
      window.clearTimeout(reloadTimer);
    };
  }, []);

  const retryNow = () => {
    clearState();
    window.location.reload();
  };

  const waitingLongEnoughToMention = elapsed >= 45 && !gaveUp;

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
            ...(gaveUp
              ? {}
              : {
                  borderTopColor: "rgba(255,255,255,0.7)",
                  animation: "lm-spin 0.8s linear infinite",
                }),
          }}
        />

        <h1 style={{ fontSize: "1rem", fontWeight: 500, margin: "0 0 0.5rem" }}>
          {gaveUp ? "This preview isn't running" : "This preview is starting"}
        </h1>

        <p
          style={{
            fontSize: "0.8125rem",
            lineHeight: 1.6,
            margin: 0,
            color: "rgba(230,230,231,0.6)",
          }}
        >
          {gaveUp
            ? `Nothing came up after ${Math.round(
                GIVE_UP_AFTER_MS / 1000,
              )} seconds, so this preview is most likely stopped rather than slow. Previews shut down when a project has been idle for a while.`
            : "The app is being built and started. This page refreshes on its own — the first run takes longer than later ones."}
        </p>

        {gaveUp && (
          <p
            style={{
              fontSize: "0.75rem",
              lineHeight: 1.6,
              marginTop: "1rem",
              color: "rgba(230,230,231,0.45)",
            }}
          >
            Open the project in the editor to start it again. If someone shared
            this link with you, ask them to publish the app — a published app
            stays online on its own.
          </p>
        )}

        {waitingLongEnoughToMention && (
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

        {gaveUp && (
          <button
            type="button"
            onClick={retryNow}
            style={{
              marginTop: "1.5rem",
              padding: "0.5rem 1rem",
              fontSize: "0.8125rem",
              fontFamily: "inherit",
              color: "#e6e6e7",
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: "0.5rem",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        )}

        <style>{`@keyframes lm-spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    </div>
  );
}
