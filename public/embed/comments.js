/**
 * LifemarkAI guest preview comments embed — Lovable parity.
 *
 * Usage:
 *   <script src="https://<platform-host>/embed/comments.js" data-project="PROJECT_ID"></script>
 *
 * Optional attributes:
 *   data-position="bottom-right" | "bottom-left"
 *   data-theme="dark" | "light"
 *
 * Backed by GET/POST /api/embed/comments (public projects only).
 */
(function () {
  var script = document.currentScript;
  if (!script) return;
  var projectId = script.getAttribute("data-project");
  if (!projectId) return;
  var apiBase = new URL(script.src).origin;
  var position = script.getAttribute("data-position") || "bottom-right";
  var theme = script.getAttribute("data-theme") || "dark";
  var LS_NAME = "lifemark_guest_name_" + projectId;
  var LS_OPEN = "lifemark_comments_open_" + projectId;

  var isDark = theme !== "light";
  var colors = isDark
    ? {
        bg: "#15151c",
        panel: "#1a1a24",
        border: "rgba(255,255,255,0.1)",
        text: "#fff",
        muted: "rgba(255,255,255,0.55)",
        accent: "#7c3aed",
        accentHover: "#6d28d9",
        inputBg: "rgba(255,255,255,0.05)",
      }
    : {
        bg: "#ffffff",
        panel: "#f8f9fb",
        border: "rgba(0,0,0,0.1)",
        text: "#111",
        muted: "rgba(0,0,0,0.5)",
        accent: "#4f46e5",
        accentHover: "#4338ca",
        inputBg: "rgba(0,0,0,0.03)",
      };

  var picking = false;
  var pendingTarget = null;
  var comments = [];

  function el(tag, styles, text) {
    var n = document.createElement(tag);
    if (styles) for (var k in styles) n.style[k] = styles[k];
    if (text != null) n.textContent = text;
    return n;
  }

  function getGuestName() {
    try { return localStorage.getItem(LS_NAME) || ""; } catch (e) { return ""; }
  }
  function setGuestName(v) {
    try { localStorage.setItem(LS_NAME, v); } catch (e) {}
  }

  function pagePath() {
    return window.location.pathname + window.location.search;
  }

  function shortXPath(el) {
    if (!el || el === document.body) return "/html/body";
    var parts = [];
    var node = el;
    while (node && node.nodeType === 1 && node !== document.body) {
      var tag = node.tagName.toLowerCase();
      var idx = 1;
      var sib = node.previousElementSibling;
      while (sib) {
        if (sib.tagName.toLowerCase() === tag) idx++;
        sib = sib.previousElementSibling;
      }
      parts.unshift(tag + "[" + idx + "]");
      node = node.parentElement;
    }
    return "/html/body/" + parts.join("/");
  }

  function elementPreview(el) {
    if (!el) return "";
    var t = (el.textContent || "").replace(/\s+/g, " ").trim();
    return t.slice(0, 80);
  }

  function fetchComments() {
    return fetch(
      apiBase + "/api/embed/comments?projectId=" + encodeURIComponent(projectId) +
      "&pagePath=" + encodeURIComponent(pagePath())
    )
      .then(function (r) { return r.json(); })
      .then(function (d) { comments = d.comments || []; renderList(); })
      .catch(function () { comments = []; renderList(); });
  }

  var panel, listEl, nameInput, textInput, errEl, submitBtn, pickBtn;

  function renderList() {
    if (!listEl) return;
    listEl.innerHTML = "";
    if (!comments.length) {
      listEl.appendChild(el("div", {
        fontSize: "12px", color: colors.muted, textAlign: "center", padding: "24px 12px",
      }, "No comments on this page yet. Be the first!"));
      return;
    }
    comments.forEach(function (c) {
      var row = el("div", {
        padding: "10px 0", borderBottom: "1px solid " + colors.border,
      });
      var head = el("div", { display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" });
      head.appendChild(el("span", { fontSize: "11px", fontWeight: "600", color: colors.text }, c.author || "Guest"));
      if (c.resolved) {
        head.appendChild(el("span", {
          fontSize: "9px", color: "#34d399", fontWeight: "600",
        }, "Resolved"));
      }
      head.appendChild(el("span", {
        fontSize: "10px", color: colors.muted, marginLeft: "auto",
      }, new Date(c.created_at).toLocaleDateString()));
      row.appendChild(head);
      if (c.element_preview) {
        row.appendChild(el("div", {
          fontSize: "10px", color: colors.muted, fontFamily: "monospace",
          marginBottom: "4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }, "📍 " + c.element_preview));
      }
      row.appendChild(el("div", {
        fontSize: "12px", color: colors.text, lineHeight: "1.45", whiteSpace: "pre-wrap",
      }, c.content));
      listEl.appendChild(row);
    });
  }

  function setPicking(on) {
    picking = on;
    if (pickBtn) {
      pickBtn.textContent = on ? "Click an element…" : "Pin to element";
      pickBtn.style.background = on ? colors.accent : "transparent";
      pickBtn.style.color = on ? "#fff" : colors.accent;
    }
    document.body.style.cursor = on ? "crosshair" : "";
  }

  function onElementClick(e) {
    if (!picking) return;
    e.preventDefault();
    e.stopPropagation();
    var target = e.target;
    if (target.closest && target.closest("#lifemark-comments-root")) return;
    pendingTarget = target;
    setPicking(false);
    if (textInput) {
      textInput.placeholder = "Comment on <" + (target.tagName || "element").toLowerCase() + ">…";
      textInput.focus();
    }
  }

  function openPanel() {
    panel.style.display = "flex";
    try { localStorage.setItem(LS_OPEN, "1"); } catch (e) {}
    fetchComments();
  }

  function closePanel() {
    panel.style.display = "none";
    setPicking(false);
    pendingTarget = null;
    try { localStorage.removeItem(LS_OPEN); } catch (e) {}
  }

  function submitComment() {
    var name = (nameInput.value || "").trim();
    var content = (textInput.value || "").trim();
    if (!name) { errEl.textContent = "Enter your name."; return; }
    if (!content) { errEl.textContent = "Write a comment."; return; }
    errEl.textContent = "";
    submitBtn.disabled = true;
    submitBtn.textContent = "Sending…";
    setGuestName(name);

    var body = {
      projectId: projectId,
      guestName: name,
      content: content,
      pagePath: pagePath(),
    };
    if (pendingTarget) {
      body.elementXpath = shortXPath(pendingTarget);
      body.elementTag = (pendingTarget.tagName || "").toLowerCase();
      body.elementPreview = elementPreview(pendingTarget);
    }

    fetch(apiBase + "/api/embed/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.d.error || "Failed");
        textInput.value = "";
        pendingTarget = null;
        textInput.placeholder = "Leave feedback on this page…";
        return fetchComments();
      })
      .catch(function (err) {
        errEl.textContent = err.message || "Could not post comment.";
      })
      .finally(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = "Post comment";
      });
  }

  /* ── Build UI ── */
  var root = el("div", { position: "fixed", zIndex: "999998", fontFamily: "system-ui,-apple-system,sans-serif" });
  root.id = "lifemark-comments-root";

  var side = position === "bottom-left" ? { left: "20px" } : { right: "20px" };
  var fab = el("button", Object.assign({
    position: "fixed", bottom: "20px", width: "48px", height: "48px",
    borderRadius: "50%", border: "none", cursor: "pointer",
    background: "linear-gradient(135deg," + colors.accent + ",#4f46e5)",
    color: "#fff", fontSize: "20px", boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
    zIndex: "999999",
  }, side), "💬");
  fab.title = "Leave a comment";
  fab.onclick = function () {
    if (panel.style.display === "flex") closePanel();
    else openPanel();
  };

  panel = el("div", Object.assign({
    position: "fixed", bottom: "80px", width: "320px", maxWidth: "calc(100vw - 32px)",
    maxHeight: "420px", display: "none", flexDirection: "column",
    background: colors.panel, border: "1px solid " + colors.border,
    borderRadius: "14px", boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
    overflow: "hidden", zIndex: "999999",
  }, side));

  var header = el("div", {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "12px 14px", borderBottom: "1px solid " + colors.border,
  });
  header.appendChild(el("span", { fontSize: "13px", fontWeight: "600", color: colors.text }, "Preview feedback"));
  var closeBtn = el("button", {
    background: "none", border: "none", color: colors.muted, cursor: "pointer", fontSize: "16px",
  }, "✕");
  closeBtn.onclick = closePanel;
  header.appendChild(closeBtn);
  panel.appendChild(header);

  listEl = el("div", {
    flex: "1", overflowY: "auto", padding: "0 14px",
  });
  panel.appendChild(listEl);

  var compose = el("div", {
    padding: "12px 14px", borderTop: "1px solid " + colors.border, background: colors.bg,
  });

  nameInput = el("input", {
    width: "100%", boxSizing: "border-box", padding: "8px 10px", marginBottom: "8px",
    borderRadius: "8px", border: "1px solid " + colors.border,
    background: colors.inputBg, color: colors.text, fontSize: "12px", outline: "none",
  });
  nameInput.type = "text";
  nameInput.placeholder = "Your name";
  nameInput.value = getGuestName();
  nameInput.maxLength = 60;

  var pickRow = el("div", { display: "flex", gap: "6px", marginBottom: "8px" });
  pickBtn = el("button", {
    flex: "1", padding: "6px 8px", borderRadius: "6px",
    border: "1px solid " + colors.accent, background: "transparent",
    color: colors.accent, fontSize: "11px", fontWeight: "600", cursor: "pointer",
  }, "Pin to element");
  pickBtn.onclick = function () { setPicking(!picking); };
  pickRow.appendChild(pickBtn);
  compose.appendChild(nameInput);
  compose.appendChild(pickRow);

  textInput = el("textarea", {
    width: "100%", boxSizing: "border-box", padding: "8px 10px", minHeight: "64px",
    borderRadius: "8px", border: "1px solid " + colors.border,
    background: colors.inputBg, color: colors.text, fontSize: "12px",
    resize: "none", outline: "none", fontFamily: "inherit",
  });
  textInput.placeholder = "Leave feedback on this page…";
  compose.appendChild(textInput);

  errEl = el("div", { fontSize: "11px", color: "#f87171", minHeight: "14px", marginTop: "6px" }, "");
  compose.appendChild(errEl);

  submitBtn = el("button", {
    width: "100%", marginTop: "8px", padding: "9px", borderRadius: "8px", border: "none",
    background: colors.accent, color: "#fff", fontSize: "12px", fontWeight: "600", cursor: "pointer",
  }, "Post comment");
  submitBtn.onmouseover = function () { submitBtn.style.background = colors.accentHover; };
  submitBtn.onmouseout = function () { submitBtn.style.background = colors.accent; };
  submitBtn.onclick = submitComment;
  compose.appendChild(submitBtn);
  panel.appendChild(compose);

  root.appendChild(fab);
  root.appendChild(panel);
  document.body.appendChild(root);

  document.addEventListener("click", onElementClick, true);

  try {
    if (localStorage.getItem(LS_OPEN) === "1") openPanel();
  } catch (e) {}
})();
