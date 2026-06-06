/** Remove LifemarkAI service workers and caches — required on /editor to avoid stale chunk 404s. */
export function clearLifemarkServiceWorker(): void {
  if (typeof window === "undefined") return;

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => {
        regs.forEach((reg) => reg.unregister().catch(() => {}));
      })
      .catch(() => {});
  }

  if ("caches" in window) {
    caches
      .keys()
      .then((keys) => {
        keys
          .filter((k) => k.startsWith("lifemarkai-"))
          .forEach((k) => caches.delete(k).catch(() => {}));
      })
      .catch(() => {});
  }
}

/** Inline script for beforeInteractive — runs before any editor chunk loads. */
export const EDITOR_BOOT_SCRIPT = `(function(){
  if("serviceWorker" in navigator){navigator.serviceWorker.getRegistrations().then(function(r){r.forEach(function(x){x.unregister();});});}
  if("caches" in window){caches.keys().then(function(k){k.filter(function(n){return n.indexOf("lifemarkai-")===0;}).forEach(function(n){caches.delete(n);});});}
  var KEY="lifemark-chunk-reload",MAX=2;
  function isChunk(m){return m&&(m.indexOf("Failed to load chunk")>=0||m.indexOf("Loading chunk")>=0||m.indexOf("ChunkLoadError")>=0||m.indexOf("Failed to fetch dynamically imported module")>=0);}
  function reload(){var n=Number(sessionStorage.getItem(KEY)||"0");if(n>=MAX){sessionStorage.removeItem(KEY);return false;}sessionStorage.setItem(KEY,String(n+1));var u=new URL(location.href);u.searchParams.set("_cb",String(Date.now()));location.replace(u.toString());return true;}
  function onErr(x){var m=x instanceof Error?x.message:String(x||"");if(isChunk(m))reload();}
  addEventListener("error",function(e){onErr(e.error||e.message);});
  addEventListener("unhandledrejection",function(e){onErr(e.reason);});
  addEventListener("load",function(){setTimeout(function(){sessionStorage.removeItem(KEY);},4000);});
})();`;
