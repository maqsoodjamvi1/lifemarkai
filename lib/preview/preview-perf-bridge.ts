/** Injected into preview iframes — posts Navigation Timing + FCP/LCP/CLS to the parent. */
export const PREVIEW_PERF_SCRIPT = `(function() {
  if (window.parent === window) return;
  var lcp = null;
  var cls = 0;
  try {
    if (PerformanceObserver) {
      try {
        var lcpObs = new PerformanceObserver(function(list) {
          var entries = list.getEntries();
          if (entries && entries.length) {
            lcp = entries[entries.length - 1].startTime;
          }
        });
        lcpObs.observe({ type: 'largest-contentful-paint', buffered: true });
      } catch (e1) {}
      try {
        var clsObs = new PerformanceObserver(function(list) {
          var entries = list.getEntries();
          for (var i = 0; i < entries.length; i++) {
            if (!entries[i].hadRecentInput) cls += entries[i].value || 0;
          }
        });
        clsObs.observe({ type: 'layout-shift', buffered: true });
      } catch (e2) {}
    }
  } catch (e) {}
  function postPerf() {
    try {
      var nav = performance.getEntriesByType('navigation')[0];
      var paints = performance.getEntriesByType('paint');
      var fcp = null;
      for (var i = 0; i < paints.length; i++) {
        if (paints[i].name === 'first-contentful-paint') { fcp = paints[i].startTime; break; }
      }
      if (!nav && fcp == null && lcp == null) return;
      window.parent.postMessage({
        source: 'lifemark-preview-perf',
        ttfb: nav ? Math.round(nav.responseStart - nav.requestStart) : null,
        domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd - nav.startTime) : null,
        load: nav ? Math.round(nav.loadEventEnd - nav.startTime) : null,
        fcp: fcp != null ? Math.round(fcp) : null,
        lcp: lcp != null ? Math.round(lcp) : null,
        cls: Math.round(cls * 1000) / 1000,
      }, '*');
    } catch (e) {}
  }
  window.addEventListener('load', function() { setTimeout(postPerf, 150); setTimeout(postPerf, 2000); });
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'lifemark-preview-perf-request') postPerf();
  });
})();`;

export type PreviewPerfSnapshot = {
  ttfb?: number | null;
  domContentLoaded?: number | null;
  load?: number | null;
  fcp?: number | null;
  lcp?: number | null;
  cls?: number | null;
  capturedAt?: number;
};

export function ratePreviewMetric(
  name: "ttfb" | "fcp" | "lcp" | "load" | "domContentLoaded" | "cls",
  ms: number | null | undefined,
): "good" | "needs" | "poor" | "na" {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "na";
  if (name === "cls") {
    if (ms <= 0.1) return "good";
    if (ms <= 0.25) return "needs";
    return "poor";
  }
  const bands: Record<string, [number, number]> = {
    ttfb: [800, 1800],
    fcp: [1800, 3000],
    lcp: [2500, 4000],
    load: [2500, 4000],
    domContentLoaded: [2000, 3500],
  };
  const [good, poor] = bands[name];
  if (ms <= good) return "good";
  if (ms <= poor) return "needs";
  return "poor";
}
