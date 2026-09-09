/** Runs inside the guest. Revision receipt alone is not render completion. */
export const PREVIEW_REVISION_BRIDGE = `(function () {
  var revision = null, challenge = null, ready = false, failed = false, updating = false;
  function paint() {
    if (!challenge || !ready || failed || updating || revision !== challenge) return;
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      if (!challenge || !ready || failed || updating || revision !== challenge) return;
      var root = document.getElementById('root') || document.getElementById('__next') || document.body;
      if (!root || document.querySelector('vite-error-overlay')) return;
      var nodes = root.querySelectorAll('*').length;
      var text = (root.innerText || '').trim();
      var height = root.getBoundingClientRect().height;
      if (!nodes || (!text && height <= 40)) return;
      window.parent.postMessage({ type: 'lifemark-preview-revision-painted', revision: revision }, '*');
    }); });
  }
  window.addEventListener('lifemark-preview-revision', function (e) { revision = e.detail; ready = false; });
  window.addEventListener('lifemark-preview-update-start', function (e) { updating = true; if (e.detail && e.detail.application) failed = false; ready = false; });
  window.addEventListener('lifemark-preview-update-end', function () { updating = false; ready = true; paint(); });
  window.addEventListener('lifemark-preview-update-error', function () { failed = true; ready = false; });
  window.addEventListener('error', function () { failed = true; ready = false; });
  window.addEventListener('unhandledrejection', function () { failed = true; ready = false; });
  window.addEventListener('load', function () { ready = true; paint(); });
  window.addEventListener('message', function (e) {
    if (e.source !== window.parent || !e.data || e.data.type !== 'lifemark-preview-verify-revision') return;
    if (typeof e.data.revision !== 'string') return;
    challenge = e.data.revision; paint();
  });
})();`;
