/**
 * LifemarkAI paywall embed.
 *
 * Usage (injected by the Monetization panel):
 *   <script src="https://<platform-host>/embed/paywall.js" data-project="PROJECT_ID"></script>
 *
 * Checks subscription status for the visitor's email and shows a paywall
 * overlay with Stripe Checkout when the app is monetized and the visitor
 * isn't subscribed. Backed by /api/embed/status and /api/embed/checkout.
 */
(function () {
  var script = document.currentScript;
  if (!script) return;
  var projectId = script.getAttribute("data-project");
  if (!projectId) return;
  var apiBase = new URL(script.src).origin;
  var LS_KEY = "lifemark_paywall_email_" + projectId;

  function getEmail() {
    try { return localStorage.getItem(LS_KEY) || ""; } catch (e) { return ""; }
  }
  function setEmail(v) {
    try { localStorage.setItem(LS_KEY, v); } catch (e) {}
  }

  function el(tag, styles, text) {
    var n = document.createElement(tag);
    if (styles) for (var k in styles) n.style[k] = styles[k];
    if (text) n.textContent = text;
    return n;
  }

  function formatPrice(cents, currency) {
    var amount = (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2);
    var sym = currency === "eur" ? "€" : currency === "gbp" ? "£" : "$";
    return sym + amount + "/mo";
  }

  function showPaywall(cfg) {
    if (document.getElementById("lifemark-paywall")) return;
    var overlay = el("div", {
      position: "fixed", inset: "0", zIndex: "999999",
      background: "rgba(10,10,15,0.92)", backdropFilter: "blur(6px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "system-ui, -apple-system, sans-serif",
    });
    overlay.id = "lifemark-paywall";

    var card = el("div", {
      background: "#15151c", border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: "16px", padding: "32px", maxWidth: "360px", width: "90%",
      textAlign: "center", color: "#fff",
    });

    card.appendChild(el("div", { fontSize: "18px", fontWeight: "600", marginBottom: "8px" }, "Subscribe to continue"));
    var sub = "This app requires a subscription — " + formatPrice(cfg.price_cents, cfg.currency);
    if (cfg.trial_days > 0) sub += " after a " + cfg.trial_days + "-day free trial";
    card.appendChild(el("div", { fontSize: "13px", color: "rgba(255,255,255,0.6)", marginBottom: "20px", lineHeight: "1.5" }, sub + "."));

    var input = el("input", {
      width: "100%", boxSizing: "border-box", padding: "10px 12px",
      borderRadius: "8px", border: "1px solid rgba(255,255,255,0.15)",
      background: "rgba(255,255,255,0.05)", color: "#fff", fontSize: "14px",
      marginBottom: "12px", outline: "none",
    });
    input.type = "email";
    input.placeholder = "you@example.com";
    input.value = getEmail();
    card.appendChild(input);

    var btn = el("button", {
      width: "100%", padding: "10px 12px", borderRadius: "8px", border: "none",
      background: "linear-gradient(90deg,#7c3aed,#4f46e5)", color: "#fff",
      fontSize: "14px", fontWeight: "600", cursor: "pointer",
    }, cfg.trial_days > 0 ? "Start free trial" : "Subscribe");
    var err = el("div", { fontSize: "12px", color: "#f87171", marginTop: "10px", minHeight: "16px" }, "");

    btn.onclick = function () {
      var email = (input.value || "").trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { err.textContent = "Enter a valid email."; return; }
      setEmail(email);
      btn.disabled = true; btn.textContent = "Redirecting…";
      fetch(apiBase + "/api/embed/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: projectId, email: email, successUrl: location.href, cancelUrl: location.href }),
      })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, status: r.status, data: d }; }); })
        .then(function (res) {
          if (res.status === 409) { overlay.remove(); return; } // already subscribed
          if (!res.ok || !res.data.url) { throw new Error(res.data.error || "Checkout failed"); }
          location.href = res.data.url;
        })
        .catch(function (e) {
          err.textContent = e.message || "Something went wrong.";
          btn.disabled = false; btn.textContent = cfg.trial_days > 0 ? "Start free trial" : "Subscribe";
        });
    };

    card.appendChild(btn);
    card.appendChild(err);
    card.appendChild(el("div", { fontSize: "10px", color: "rgba(255,255,255,0.3)", marginTop: "14px" }, "Payments secured by Stripe · Powered by LifemarkAI"));
    overlay.appendChild(card);
    document.body.appendChild(overlay);
  }

  function check() {
    var email = getEmail();
    var url = apiBase + "/api/embed/status?projectId=" + encodeURIComponent(projectId) +
      (email ? "&email=" + encodeURIComponent(email) : "");
    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.enabled && !d.subscribed) showPaywall(d);
      })
      .catch(function () { /* never break the host app */ });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", check);
  } else {
    check();
  }
})();
