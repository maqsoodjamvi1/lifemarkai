/**
 * LifemarkAI visitor error reporter.
 *
 * Injected into published apps. Catches uncaught errors and unhandled promise
 * rejections and reports them to /api/embed/error so the app's owner can see that
 * real visitors are hitting real bugs - which, before this, nobody ever learned.
 *
 * Usage (the publish step injects this):
 *   <script src="https://lifemarkai.com/embed/errors.js"
 *           data-project-id="..."></script>
 *
 * CONSTRAINTS THIS SCRIPT RESPECTS, because it runs inside somebody else's app:
 *
 * 1. NEVER BREAK THE HOST APP. Everything is wrapped. A reporting failure must not
 *    become a visible error in an app a customer is paying for.
 * 2. NEVER SWALLOW. Handlers are passive listeners and never preventDefault, so
 *    the app's own error handling and the browser console are untouched.
 * 3. NEVER SPAM. Identical errors are deduped in-page, and there is a hard cap per
 *    page load. A render loop firing thousands of errors sends a handful of beacons
 *    rather than thousands. The server aggregates too, but the cheapest request is
 *    the one never sent.
 * 4. NO PII. Sends message, stack and PATH only - never the query string, cookies,
 *    localStorage or form values. The server strips query strings again; this is
 *    belt and braces because a URL is the easiest place for a token to hide.
 */
(function () {
  "use strict";
  try {
    var script = document.currentScript;
    var projectId = script && script.getAttribute("data-project-id");
    if (!projectId) return; // Nothing to attribute reports to - do nothing at all.

    var endpoint =
      (script.getAttribute("data-endpoint") || "https://lifemarkai.com") +
      "/api/embed/error";

    var MAX_PER_PAGELOAD = 10;
    var sent = 0;
    var seen = Object.create(null);

    function report(message, stack) {
      try {
        if (sent >= MAX_PER_PAGELOAD) return; // Rule 3.
        if (!message) return;

        var key = String(message).slice(0, 200) + "|" + String(stack || "").slice(0, 200);
        if (seen[key]) return; // Same error twice in one page load is not news.
        seen[key] = true;
        sent++;

        var payload = JSON.stringify({
          projectId: projectId,
          message: String(message).slice(0, 500),
          stack: stack ? String(stack).slice(0, 2000) : null,
          // Path only. Rule 4.
          path: location.pathname,
        });

        // sendBeacon survives page unload, which is exactly when navigation-time
        // errors happen. Falls back to fetch with keepalive where unavailable.
        if (navigator.sendBeacon) {
          navigator.sendBeacon(endpoint, new Blob([payload], { type: "application/json" }));
        } else if (window.fetch) {
          fetch(endpoint, {
            method: "POST",
            body: payload,
            headers: { "Content-Type": "application/json" },
            keepalive: true,
            credentials: "omit", // Never send the app's cookies to us.
            mode: "cors",
          })["catch"](function () {});
        }
      } catch (e) {
        /* Rule 1 */
      }
    }

    window.addEventListener("error", function (ev) {
      try {
        var err = ev && ev.error;
        report(
          (err && err.message) || (ev && ev.message) || "Unknown error",
          err && err.stack,
        );
      } catch (e) {
        /* Rule 1 */
      }
      // Rule 2: no preventDefault.
    });

    window.addEventListener("unhandledrejection", function (ev) {
      try {
        var r = ev && ev.reason;
        report(
          (r && r.message) || String(r || "Unhandled promise rejection"),
          r && r.stack,
        );
      } catch (e) {
        /* Rule 1 */
      }
    });
  } catch (e) {
    /* Rule 1: if even setup fails, the host app carries on unaware. */
  }
})();
