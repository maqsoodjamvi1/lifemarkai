/**
 * LifemarkAI boot script (public fallback). Prefer inline AppBootScript.
 * Handles: SW cleanup (dev/editor), chunk retry while dev compiles, auto-reload.
 */
(function () {
  if (window.__lmBoot) return;
  window.__lmBoot = true;
  var DEV =
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1" ||
    location.hostname === "[::1]";
  var KEY = "lifemark-chunk-reload";
  var MAX_RELOAD = 3;
  var RETRY_MS = 2000;
  var RETRY_MAX = 90;

  function isChunkMsg(m) {
    return (
      m &&
      (m.indexOf("Loading chunk") >= 0 ||
        m.indexOf("ChunkLoadError") >= 0 ||
        m.indexOf("Failed to load chunk") >= 0 ||
        m.indexOf("Failed to fetch dynamically imported module") >= 0)
    );
  }

  function isChunkUrl(src) {
    return src && src.indexOf("/_next/static/chunks/") >= 0;
  }

  function clearSw() {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then(function (regs) {
        regs.forEach(function (reg) {
          reg.unregister().catch(function () {});
        });
      });
    }
    if ("caches" in window) {
      caches.keys().then(function (keys) {
        keys
          .filter(function (k) {
            return k.indexOf("lifemarkai-") === 0;
          })
          .forEach(function (k) {
            caches.delete(k).catch(function () {});
          });
      });
    }
  }

  if (DEV || location.pathname.indexOf("/editor") === 0) {
    clearSw();
  }

  if (
    !DEV &&
    location.pathname.indexOf("/editor") !== 0 &&
    "serviceWorker" in navigator
  ) {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(function () {});
  }

  function delayedReload() {
    var n = Number(sessionStorage.getItem(KEY) || "0");
    if (n >= MAX_RELOAD) {
      sessionStorage.removeItem(KEY);
      return;
    }
    sessionStorage.setItem(KEY, String(n + 1));
    setTimeout(function () {
      var u = new URL(location.href);
      u.searchParams.set("_cb", String(Date.now()));
      location.replace(u.toString());
    }, RETRY_MS);
  }

  function retryScriptTag(script) {
    var n = Number(script.dataset.lmRetry || "0");
    if (n >= RETRY_MAX) {
      delayedReload();
      return;
    }
    script.dataset.lmRetry = String(n + 1);
    setTimeout(function () {
      var s = document.createElement("script");
      var base = script.src.split("?")[0];
      s.src = base + "?lm_retry=" + Date.now();
      s.async = true;
      if (script.id) s.id = script.id;
      document.head.appendChild(s);
    }, RETRY_MS);
  }

  addEventListener(
    "error",
    function (e) {
      var t = e.target;
      if (t && t.tagName === "SCRIPT" && t.src && isChunkUrl(t.src)) {
        if (DEV) {
          e.preventDefault();
          e.stopImmediatePropagation();
          retryScriptTag(t);
        }
        return;
      }
      if (t && t.tagName === "SCRIPT") return;
      var m =
        e.error instanceof Error
          ? e.error.message
          : String(e.message || e.error || "");
      if (isChunkMsg(m)) delayedReload();
    },
    true
  );

  addEventListener("unhandledrejection", function (e) {
    var m =
      e.reason instanceof Error
        ? e.reason.message
        : String(e.reason || "");
    if (isChunkMsg(m)) delayedReload();
  });

  function patchWebpack() {
    var req = typeof __webpack_require__ !== "undefined" ? __webpack_require__ : null;
    if (!req || !req.e || req.e.__lmPatched) return !!req;
    var orig = req.e;
    req.e = function (chunkId) {
      var attempts = 0;
      function load() {
        return orig.call(req, chunkId).catch(function (err) {
          var m = String((err && err.message) || err);
          if (!isChunkMsg(m) || attempts >= RETRY_MAX) throw err;
          attempts++;
          return new Promise(function (r) {
            setTimeout(r, RETRY_MS);
          }).then(load);
        });
      }
      return load();
    };
    req.e.__lmPatched = true;
    return true;
  }

  var patchTimer = setInterval(function () {
    if (patchWebpack()) clearInterval(patchTimer);
  }, 20);
  setTimeout(function () {
    clearInterval(patchTimer);
  }, 180000);

  addEventListener("load", function () {
    setTimeout(function () {
      sessionStorage.removeItem(KEY);
    }, 5000);
  });
})();
