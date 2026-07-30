/**
 * Visual Edit Bridge for the WebContainer preview engine.
 */

import { PREVIEW_ERROR_BRIDGE_SCRIPT } from "./preview-error-bridge";
import { PREVIEW_PERF_SCRIPT } from "./preview-perf-bridge";
export const VEB_BRIDGE_SCRIPT = `(function() {
  if (window.parent === window) return;
  var enabled = false;
  var commentPinEnabled = false;
  var editTextMode = false;
  var hovered = null;
  var style = document.createElement('style');
  style.id = 'lm-veb-style';
  style.textContent = [
    '.lm-hover{outline:2px solid #7c3aed!important;outline-offset:2px;cursor:pointer!important}',
    '.lm-selected{outline:2px solid #0e90e8!important;outline-offset:2px}',
    '.lm-multi{outline:2px solid #38bdf8!important;outline-offset:2px}',
    '.lm-inline-editing{outline:2px dashed #22c55e!important;outline-offset:2px;cursor:text!important}',
    '.lm-pin-flash{outline:2px solid #f59e0b!important;outline-offset:3px;transition:outline 0.2s ease}',
    '#lm-comment-pins{position:fixed;inset:0;pointer-events:none;z-index:2147483646}',
    '.lm-comment-pin-marker{position:fixed;width:22px;height:22px;margin:0;padding:0;border:2px solid #fff;border-radius:9999px;background:#7c3aed;color:#fff;font:700 11px/18px system-ui,sans-serif;text-align:center;cursor:pointer;pointer-events:auto;box-shadow:0 2px 8px rgba(0,0,0,.35);z-index:2147483647}',
    '.lm-comment-pin-marker:hover{transform:scale(1.08);background:#6d28d9}'
  ].join('');
  if (!style.parentNode) document.head.appendChild(style);

  var pinLayer = null;
  var activePins = [];

  function ensurePinLayer() {
    if (pinLayer && pinLayer.parentNode) return pinLayer;
    pinLayer = document.createElement('div');
    pinLayer.id = 'lm-comment-pins';
    document.documentElement.appendChild(pinLayer);
    return pinLayer;
  }

  function clearCommentPins() {
    if (pinLayer) pinLayer.innerHTML = '';
  }

  function renderCommentPins(pins) {
    activePins = Array.isArray(pins) ? pins : [];
    var layer = ensurePinLayer();
    layer.innerHTML = '';
    for (var i = 0; i < activePins.length; i++) {
      (function(pin, idx) {
        if (!pin || !pin.xpath || !pin.id) return;
        var el = findByXPath(pin.xpath);
        if (!el) return;
        var r = el.getBoundingClientRect();
        var marker = document.createElement('button');
        marker.type = 'button';
        marker.className = 'lm-comment-pin-marker';
        marker.textContent = String(idx + 1);
        marker.title = pin.label || 'Comment';
        marker.setAttribute('data-comment-id', pin.id);
        marker.style.left = Math.max(4, r.left + r.width - 10) + 'px';
        marker.style.top = Math.max(4, r.top - 10) + 'px';
        marker.addEventListener('click', function(ev) {
          ev.preventDefault();
          ev.stopPropagation();
          window.parent.postMessage({
            source: 'lifemark-comment-pin-click',
            commentId: pin.id,
            xpath: pin.xpath
          }, '*');
        }, true);
        layer.appendChild(marker);
      })(activePins[i], i);
    }
  }

  function repositionCommentPins() {
    if (!activePins.length) return;
    renderCommentPins(activePins);
  }

  window.addEventListener('scroll', repositionCommentPins, true);
  window.addEventListener('resize', repositionCommentPins);

  function getXPath(el) {
    var parts = [], cur = el;
    while (cur && cur !== document.body && cur.parentElement) {
      var tag = cur.tagName.toLowerCase();
      var parent = cur.parentElement;
      var sibs = Array.prototype.filter.call(parent.children, function(c){ return c.tagName === cur.tagName; });
      parts.unshift(sibs.length > 1 ? tag + '[' + (Array.prototype.indexOf.call(sibs, cur) + 1) + ']' : tag);
      cur = parent;
    }
    return '//' + parts.join('/');
  }

  function findByXPath(xpath) {
    try {
      var r = document.evaluate('/html/body' + xpath.replace(/^\\/\\//, '/'), document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      if (r.singleNodeValue) return r.singleNodeValue;
    } catch (e) {}
    // Fallback: walk manually
    var parts = xpath.replace(/^\\/\\//, '').split('/');
    var cur = document.body;
    for (var i = 0; i < parts.length; i++) {
      var m = parts[i].match(/^([a-z0-9-]+)(?:\\[(\\d+)\\])?$/);
      if (!m || !cur) return null;
      var matches = Array.prototype.filter.call(cur.children, function(c){ return c.tagName.toLowerCase() === m[1]; });
      cur = matches[(m[2] ? parseInt(m[2], 10) : 1) - 1] || null;
    }
    return cur;
  }

  function clearMarks() {
    document.querySelectorAll('.lm-hover').forEach(function(n){ n.classList.remove('lm-hover'); });
    document.querySelectorAll('.lm-selected').forEach(function(n){ n.classList.remove('lm-selected'); });
  }

  function onOver(e) {
    if (!enabled) return;
    if (hovered && hovered !== e.target) hovered.classList.remove('lm-hover');
    hovered = e.target;
    if (hovered && hovered !== document.body) hovered.classList.add('lm-hover');
  }
  function onOut(e) { if (e.target && e.target.classList) e.target.classList.remove('lm-hover'); }
  function canInlineEdit(el) {
    if (!el || el === document.body || el.isContentEditable) return false;
    var text = (el.textContent || '').trim();
    return !!(text && el.children.length <= 2 && text.length <= 500);
  }

  function startInlineEdit(el) {
    var original = (el.textContent || '').trim();
    var snapshot = {
      tagName: el.tagName.toLowerCase(),
      textContent: original,
      classList: Array.prototype.filter.call(el.classList, function(c){ return c.indexOf('lm-') !== 0; }),
      xpath: getXPath(el)
    };
    el.setAttribute('contenteditable', 'plaintext-only');
    el.classList.add('lm-inline-editing');
    el.focus();
    try {
      var range = document.createRange();
      range.selectNodeContents(el);
      var sel = window.getSelection();
      if (sel) { sel.removeAllRanges(); sel.addRange(range); }
    } catch (err) {}
    function finish(commit) {
      el.removeAttribute('contenteditable');
      el.classList.remove('lm-inline-editing');
      el.removeEventListener('blur', onBlur);
      el.removeEventListener('keydown', onKey);
      if (!commit) { el.textContent = original; return; }
      var next = (el.textContent || '').trim();
      if (!next || next === original) return;
      window.parent.postMessage({
        source: 'lifemark-veb-inline',
        text: next,
        tagName: snapshot.tagName,
        textContent: original,
        classList: snapshot.classList,
        xpath: snapshot.xpath
      }, '*');
    }
    function onBlur() { finish(true); }
    function onKey(ev) {
      if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); el.blur(); }
      if (ev.key === 'Escape') { ev.preventDefault(); finish(false); }
    }
    el.addEventListener('blur', onBlur);
    el.addEventListener('keydown', onKey);
  }

  function onClick(e) {
    if (commentPinEnabled) {
      e.preventDefault(); e.stopPropagation();
      var el = e.target;
      if (!el || el === document.body) return;
      var rect = el.getBoundingClientRect();
      window.parent.postMessage({
        source: 'lifemark-comment-pin',
        tagName: el.tagName.toLowerCase(),
        textContent: (el.textContent || '').trim().slice(0, 80),
        classList: Array.prototype.filter.call(el.classList, function(c){ return c.indexOf('lm-') !== 0; }),
        xpath: getXPath(el),
        rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
      }, '*');
      return;
    }
    if (!enabled) return;
    e.preventDefault(); e.stopPropagation();
    var el = e.target;
    if (!el || el === document.body) return;
    // Edit-text mode: single-click leaf text starts inline edit (Lovable parity).
    if (editTextMode && canInlineEdit(el)) {
      startInlineEdit(el);
      return;
    }
    var rect = el.getBoundingClientRect();
    var additive = !!(e.metaKey || e.ctrlKey);
    if (!additive) {
      document.querySelectorAll('.lm-selected,.lm-multi').forEach(function(n){
        n.classList.remove('lm-selected'); n.classList.remove('lm-multi');
      });
      el.classList.remove('lm-hover');
      el.classList.add('lm-selected');
    } else {
      el.classList.add('lm-selected');
      el.classList.add('lm-multi');
    }
    window.parent.postMessage({
      source: 'lifemark-veb',
      additive: additive,
      tagName: el.tagName.toLowerCase(),
      textContent: (el.textContent || '').trim(),
      classList: Array.prototype.filter.call(el.classList, function(c){ return c.indexOf('lm-') !== 0; }),
      xpath: getXPath(el),
      rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
    }, '*');
  }

  // True in-place text editing (Lovable parity): double-click leaf text → edit in preview.
  function onDblClick(e) {
    if (!enabled || commentPinEnabled) return;
    var el = e.target;
    if (!canInlineEdit(el)) return;
    e.preventDefault();
    e.stopPropagation();
    startInlineEdit(el);
  }

  document.addEventListener('mouseover', onOver, true);
  document.addEventListener('mouseout', onOut, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('dblclick', onDblClick, true);

  window.addEventListener('message', function(e) {
    var d = e.data || {};
    if (d.type === 'lifemark-veb-mode') {
      enabled = !!d.enabled;
      if (enabled) { if (!style.parentNode) document.head.appendChild(style); }
      else { clearMarks(); }
    }
    if (d.type === 'lifemark-comment-pin-mode') {
      commentPinEnabled = !!d.enabled;
      if (!commentPinEnabled) clearMarks();
    }
    if (d.type === 'lifemark-veb-edit-text-mode') {
      editTextMode = !!d.enabled;
    }
    if (d.type === 'lifemark-capture') {
      var msgId = d.messageId;
      var src = e.source;
      function loadCanvas(cb) {
        if (typeof html2canvas !== 'undefined') return cb();
        var s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
        s.onload = cb;
        s.onerror = function() {
          src.postMessage({ type: 'lifemark-screenshot', messageId: msgId, dataUrl: null }, '*');
        };
        document.head.appendChild(s);
      }
      loadCanvas(function() {
        setTimeout(function() {
          html2canvas(document.documentElement, {
            scale: 0.4, useCORS: true, logging: false,
            width: 800, height: 600, windowWidth: 800, windowHeight: 600
          }).then(function(canvas) {
            src.postMessage({ type: 'lifemark-screenshot', messageId: msgId, dataUrl: canvas.toDataURL('image/jpeg', 0.72) }, '*');
          }).catch(function() {
            src.postMessage({ type: 'lifemark-screenshot', messageId: msgId, dataUrl: null }, '*');
          });
        }, 400);
      });
    }
    if (d.type === 'lifemark-veb-apply' && d.xpath) {
      var el = findByXPath(d.xpath);
      if (!el) return;
      if (typeof d.text === 'string') el.textContent = d.text;
      if (typeof d.classes === 'string') {
        var keep = Array.prototype.filter.call(el.classList, function(c){ return c.indexOf('lm-') === 0; });
        el.className = (d.classes + ' ' + keep.join(' ')).trim();
      }
      if (typeof d.imageSrc === 'string' && d.imageSrc) {
        if (el.tagName && el.tagName.toLowerCase() === 'img') {
          el.setAttribute('src', d.imageSrc);
        } else if (el.style) {
          el.style.backgroundImage = 'url(' + JSON.stringify(d.imageSrc).slice(1, -1) + ')';
        }
      }
    }
    if (d.type === 'lifemark-veb-clear') clearMarks();
    if (d.type === 'lifemark-comment-pins') {
      renderCommentPins(d.pins);
    }
    if (d.type === 'lifemark-comment-pin-focus' && d.xpath) {
      var focusEl = findByXPath(d.xpath);
      if (focusEl) {
        try { focusEl.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (err) {}
        focusEl.classList.add('lm-pin-flash');
        setTimeout(function() { focusEl.classList.remove('lm-pin-flash'); }, 1600);
      }
      if (d.commentId) {
        window.parent.postMessage({
          source: 'lifemark-comment-pin-click',
          commentId: d.commentId,
          xpath: d.xpath
        }, '*');
      }
    }
  });

  // Announce readiness so the parent can push the current mode after HMR/reload
  window.parent.postMessage({ type: 'lifemark-veb-ready' }, '*');
})();`;

// Runtime bridge for the WebContainer preview engine.
//
// The WC iframe is cross-origin, so the parent editor cannot read its console
// or window.onerror directly. This script forwards runtime errors,
// console.error output, and route changes to the parent using the SAME
// "lifemark-preview" message contract the srcdoc fallback already speaks, so
// the editor error overlay, "fix this error" chat hand-off, and address-bar
// sync work identically on both engines.
//
//   iframe -> parent: { source:'lifemark-preview', type:'error'|'success'|'log', text }
//   iframe -> parent: { type:'lifemark-preview-location', pathname }
export const PREVIEW_RUNTIME_SCRIPT = `(function(){
  if (window.parent === window) return;
  var hadRuntimeError = false;
  function isNoise(text) {
    var m = String(text || "").trim();
    if (!m || m === "{}" || m === "[]" || m === "[object Object]") return true;
    if (m.length < 4 && !/error|fail/i.test(m)) return true;
    if (/chrome-extension:\\/\\/|moz-extension:\\/\\/|safari-web-extension:\\/\\/|safari-extension:\\/\\/|webkit-masked-url:/i.test(m)) return true;
    if (/\\binpage\\.js\\b/i.test(m) && /emit|ethereum|wallet|metamask|solana|web3/i.test(m)) return true;
    return false;
  }
  function post(type, text){
    if (type === "error") {
      hadRuntimeError = true;
      if (isNoise(text)) return;
    }
    try { window.parent.postMessage({ source:'lifemark-preview', type:type, text:String(text) }, '*'); } catch(e){}
  }
  function loc(){
    try { window.parent.postMessage({ type:'lifemark-preview-location', pathname: location.pathname + location.search + location.hash }, '*'); } catch(e){}
  }
  window.addEventListener('error', function(e){
    var where = e.filename ? (' (' + String(e.filename).split('/').pop() + ':' + e.lineno + ':' + e.colno + ')') : '';
    post('error', (e.message || 'Runtime error') + where);
  });
  window.addEventListener('unhandledrejection', function(e){
    var r = e && e.reason;
    var msg = (r && (r.stack || r.message)) || r;
    if (msg && typeof msg === 'object') {
      try { msg = JSON.stringify(msg); } catch(err) { msg = String(r); }
    }
    post('error', 'Unhandled promise rejection: ' + msg);
  });
  function fmtArgs(args) {
    return Array.prototype.map.call(args, function(a){
      if (a && a.stack) return a.stack;
      if (typeof a === 'string') return a;
      if (a && a.message) return a.message;
      try { return JSON.stringify(a); } catch(e) { return String(a); }
    }).filter(Boolean).join(' ');
  }
  var _err = console.error;
  console.error = function(){
    var text = fmtArgs(arguments);
    if (text && !isNoise(text)) post('error', text);
    return _err.apply(console, arguments);
  };
  var _warn = console.warn;
  console.warn = function(){
    var text = fmtArgs(arguments);
    if (text && !isNoise(text)) post('log', '[warn] ' + text);
    return _warn.apply(console, arguments);
  };
  var _log = console.log;
  console.log = function(){
    var text = fmtArgs(arguments);
    if (text && !isNoise(text)) post('log', text);
    return _log.apply(console, arguments);
  };
  var _info = console.info;
  console.info = function(){
    var text = fmtArgs(arguments);
    if (text && !isNoise(text)) post('log', '[info] ' + text);
    return _info.apply(console, arguments);
  };
  function maybePostSuccess() {
    var root = document.getElementById('root');
    var mounted = root && root.innerHTML && root.innerHTML.trim().length > 0;
    if (!hadRuntimeError && mounted) post('success', 'ok');
    loc();
  }
  window.addEventListener('load', function(){
    setTimeout(maybePostSuccess, 1200);
  });
  // Keep the parent address bar in sync with client-side routing.
  var _push = history.pushState, _replace = history.replaceState;
  history.pushState = function(){ var r = _push.apply(this, arguments); loc(); return r; };
  history.replaceState = function(){ var r = _replace.apply(this, arguments); loc(); return r; };
  window.addEventListener('popstate', loc);
  window.addEventListener('hashchange', loc);
  // Network panel — intercept fetch + XHR for parent devtools (Lovable parity).
  var _fetch = window.fetch;
  window.fetch = function(input, init) {
    var method = ((init && init.method) || 'GET').toUpperCase();
    var url = typeof input === 'string' ? input : (input && input.url) || String(input);
    var start = Date.now();
    function postNet(extra) {
      try {
        window.parent.postMessage(Object.assign({
          source: 'lifemark-preview-network',
          method: method,
          url: url,
          durationMs: Date.now() - start
        }, extra || {}), '*');
      } catch(e) {}
    }
    return _fetch.apply(this, arguments).then(function(res) {
      var ct = '';
      try { ct = res.headers.get('content-type') || ''; } catch(e) {}
      postNet({ status: res.status, ok: res.ok, contentType: ct });
      return res;
    }).catch(function(err) {
      postNet({ status: 0, ok: false, error: String((err && err.message) || err) });
      throw err;
    });
  };
  if (window.XMLHttpRequest) {
    var _XHR = window.XMLHttpRequest;
    window.XMLHttpRequest = function() {
      var xhr = new _XHR();
      var method = 'GET';
      var url = '';
      var start = 0;
      var _open = xhr.open;
      xhr.open = function(m, u) {
        method = String(m || 'GET').toUpperCase();
        url = String(u || '');
        return _open.apply(xhr, arguments);
      };
      xhr.addEventListener('loadend', function() {
        try {
          window.parent.postMessage({
            source: 'lifemark-preview-network',
            method: method,
            url: url,
            status: xhr.status,
            ok: xhr.status >= 200 && xhr.status < 400,
            durationMs: start ? (Date.now() - start) : 0,
            contentType: xhr.getResponseHeader('content-type') || ''
          }, '*');
        } catch(e) {}
      });
      var _send = xhr.send;
      xhr.send = function() {
        start = Date.now();
        return _send.apply(xhr, arguments);
      };
      return xhr;
    };
  }
  // Inbound: parent address-bar navigation (lifemark-preview-navigate). The WC
  // engine runs a REAL router on real URLs, so push the path and fire popstate
  // so react-router re-renders. Mirrors the srcdoc engine's navigate handler.
  window.addEventListener('message', function(e){
    var d = e.data || {};
    if (d.type !== 'lifemark-preview-navigate' || typeof d.pathname !== 'string') return;
    var next = d.pathname || '/';
    if (next.charAt(0) !== '/') next = '/' + next;
    try {
      history.pushState({}, '', next);
      window.dispatchEvent(new PopStateEvent('popstate'));
    } catch(err) {}
  });
})();`;

/** Combined preview bridges (VEB + runtime + errors + perf). */
export function getPreviewBridgeScripts(): string {
  return `${VEB_BRIDGE_SCRIPT}\n${PREVIEW_RUNTIME_SCRIPT}\n${PREVIEW_ERROR_BRIDGE_SCRIPT}\n${PREVIEW_PERF_SCRIPT}`;
}

/** Inject both bridges into an index.html document (idempotent). */
export function injectVebBridgeIntoHtml(html: string): string {
  if (html.includes("lifemark-veb-ready")) return html;
  const tag = `<script>${getPreviewBridgeScripts()}</script>`;
  if (html.includes("</body>")) return html.replace("</body>", `${tag}\n</body>`);
  return `${html}\n${tag}`;
}

/**
 * Inject preview bridges into a Next.js App Router root layout (TSX/JSX).
 * Vite apps use index.html; Next has no HTML entry, so layout is the hook.
 */
/**
 * Inject the bridge into a JSX module that renders the document itself.
 *
 * Applies to any framework whose root is a React component containing
 * <html>/<body> rather than a static index.html:
 *   - Next.js App Router  -> app/layout.tsx
 *   - TanStack Start      -> src/routes/__root.tsx
 *
 * Kept generic because the TanStack Start scaffold renders
 * `<body>{children}<Scripts /></body>`, so the same `</body>` anchor works.
 */
export function injectVebBridgeIntoJsxDocument(source: string): string {
  return injectVebBridgeIntoNextLayout(source);
}

export function injectVebBridgeIntoNextLayout(source: string): string {
  if (source.includes("lifemark-veb-ready")) return source;
  const escaped = JSON.stringify(getPreviewBridgeScripts());
  const tag = `<script dangerouslySetInnerHTML={{ __html: ${escaped} }} />`;
  if (/<\/body>/i.test(source)) {
    return source.replace(/<\/body>/i, `${tag}\n</body>`);
  }
  // Common pattern: <body>{children}</body> already handled; otherwise append
  // before the final closing parenthesis of the default export return.
  const htmlClose = source.lastIndexOf("</html>");
  if (htmlClose >= 0) {
    return `${source.slice(0, htmlClose)}${tag}\n${source.slice(htmlClose)}`;
  }
  return `${source}\n${tag}\n`;
}
