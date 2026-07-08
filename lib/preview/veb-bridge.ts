/**
 * Visual Edit Bridge for the WebContainer preview engine.
 */

import { PREVIEW_ERROR_BRIDGE_SCRIPT } from "./preview-error-bridge";
export const VEB_BRIDGE_SCRIPT = `(function() {
  if (window.parent === window) return;
  var enabled = false;
  var hovered = null;
  var style = document.createElement('style');
  style.id = 'lm-veb-style';
  style.textContent = '.lm-hover{outline:2px solid #7c3aed!important;outline-offset:2px;cursor:pointer!important}.lm-selected{outline:2px solid #0e90e8!important;outline-offset:2px}';

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
  function onClick(e) {
    if (!enabled) return;
    e.preventDefault(); e.stopPropagation();
    var el = e.target;
    if (!el || el === document.body) return;
    var rect = el.getBoundingClientRect();
    document.querySelectorAll('.lm-selected').forEach(function(n){ n.classList.remove('lm-selected'); });
    el.classList.remove('lm-hover');
    el.classList.add('lm-selected');
    window.parent.postMessage({
      source: 'lifemark-veb',
      tagName: el.tagName.toLowerCase(),
      textContent: (el.textContent || '').trim(),
      classList: Array.prototype.filter.call(el.classList, function(c){ return c.indexOf('lm-') !== 0; }),
      xpath: getXPath(el),
      rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
    }, '*');
  }

  document.addEventListener('mouseover', onOver, true);
  document.addEventListener('mouseout', onOut, true);
  document.addEventListener('click', onClick, true);

  window.addEventListener('message', function(e) {
    var d = e.data || {};
    if (d.type === 'lifemark-veb-mode') {
      enabled = !!d.enabled;
      if (enabled) { if (!style.parentNode) document.head.appendChild(style); }
      else { clearMarks(); }
    }
    if (d.type === 'lifemark-veb-apply' && d.xpath) {
      var el = findByXPath(d.xpath);
      if (!el) return;
      if (typeof d.text === 'string') el.textContent = d.text;
      if (typeof d.classes === 'string') {
        var keep = Array.prototype.filter.call(el.classList, function(c){ return c.indexOf('lm-') === 0; });
        el.className = (d.classes + ' ' + keep.join(' ')).trim();
      }
    }
    if (d.type === 'lifemark-veb-clear') clearMarks();
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
  var _err = console.error;
  console.error = function(){
    var parts = Array.prototype.map.call(arguments, function(a){
      if (a && a.stack) return a.stack;
      if (typeof a === 'string') return a;
      if (a && a.message) return a.message;
      return '';
    }).filter(Boolean);
    var text = parts.join(' ');
    if (text && !isNoise(text)) post('error', text);
    return _err.apply(console, arguments);
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

/** Inject both bridges into an index.html document (idempotent). */
export function injectVebBridgeIntoHtml(html: string): string {
  if (html.includes("lifemark-veb-ready")) return html;
  const tag = `<script>${VEB_BRIDGE_SCRIPT}</script>\n<script>${PREVIEW_RUNTIME_SCRIPT}</script>\n<script>${PREVIEW_ERROR_BRIDGE_SCRIPT}</script>`;
  if (html.includes("</body>")) return html.replace("</body>", `${tag}\n</body>`);
  return `${html}\n${tag}`;
}
