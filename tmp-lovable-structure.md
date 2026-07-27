# Lovable editor dump — structural map + Lifemark gap list

Source: `tmp-lovable-editor-dump.html`  
Extracted from transcript `06409dcd-9ceb-49ca-b264-c0f2bbce9902` line **1363** (user message starting with “read given code deeply…”).  
Scope: editor **chat column + preview column + shared top chrome** only. Analytics (Bing, LinkedIn, HubSpot, TikTok, GA, etc.) ignored.

**Constraint reminder:** Lifemark preview engine target = **Modal sandbox iframe** (not WebContainer). Lovable dump uses a remote preview iframe (`id-preview--…` / `#static-preview-panel`) — structurally an iframe sandbox, not WC. Recreate layout/classes with Tailwind/shadcn; do not copy Lovable CDN CSS assets.

---

## 1. Top-level layout

```
body.flex.min-h-dvh.flex-col
└─ main#main-content
   └─ div.pt-safe.pb-safe.flex.h-dvh.flex-col
      ├─ div.sticky.top-0.z-50 …          ← GLOBAL TOP CHROME (outside panels)
      ├─ (optional banners)
      └─ div.relative.flex.min-h-0.flex-1
         └─ div.hidden.md:flex.min-h-0.flex-1
            └─ [data-panel-group][data-panel-group-direction=horizontal]
               ├─ #sidebar-panel [data-panel] size≈22.3% collapsible
               │  └─ [data-chat-panel=true]
               ├─ [data-resize-handle] role=separator (w-0.5 col-resize)
               └─ #preview-panel [data-panel] size≈77.7% collapsible
                  └─ preview frame + floating toolbars
```

| Region | Observed |
|--------|----------|
| Split | `react-resizable-panels` markers: `data-panel-group`, `data-panel`, `data-panel-size`, `data-panel-resize-handle-*` |
| Chat width | `data-panel-size="22.3"` / `flex: 22.266 1 0px` |
| Preview width | `data-panel-size="77.7"` / `flex: 77.734 1 0px` |
| Sticky | One sticky band: `sticky top-0 z-50` wrapping editor nav + view switcher + URL bar |
| CSS tokens | `--fg-*`, `--bg-*`, `--border-*`, `--chat-top-safe-padding`, `--chat-nudge-overlay-px`, `--mobile-top-chrome-height`, `*-pulse` utility classes, `shadow-surface-xl`, `rounded-4` / `rounded-6` |

---

## 2. Shared top chrome (nav)

**Not inside `#preview-panel`.** Lives in sticky nav above the split.

### Left: `[data-editor-chat-nav-container]`
- `style.width` synced to sidebar % (`22.2656%` in dump)
- Switch project (square btn)
- `#main-menu` project title + subtitle (“Previewing last saved version”)
- View history
- Close sidebar

### Center-right: `[data-navbar]`
- **View switcher** `.view-switcher-track` `role=tablist`:
  - tabs: **Preview | Files | Code | More** (animated width pill `.view-switcher-pill-soft`)
- **`#preview-url-bar`**
  - `[data-url-bar-track]` pill (`h-7`, min 86 / max 256)
  - Refresh (`aria-label="Refresh"`)
  - Route label (breadcrumb-style, e.g. `/dashboard`) via `[data-url-bar-page-trigger]`
  - Desktop view (`aria-label="Desktop view"`)
  - Open in new tab (`aria-label="Open in new tab"`)

### Class / UI kit patterns
- `btn-primitive`, `data-button`, `data-square`, layered `data-fx-layer` (interaction / spotlights / rim…)
- IDs prefixed `base-ui-_r_*` → **Base UI**
- Tailwind-like utilities + design tokens (`text-*-pulse`, `bg-*-pulse`)

---

## 3. Chat panel (`[data-chat-panel=true]` inside `#sidebar-panel`)

```
[data-chat-panel]
├─ timeline column (flex-1 min-h-0)
│  └─ .chat-scroll-container.overflow-y-auto
│     ├─ spacer height: var(--chat-top-safe-padding)
│     └─ virtualizer host (position:relative; overflow-anchor:none)
│        └─ absolute rows (top: Npx) → [data-message-id] cards max-w-3xl
└─ composer dock (shrink-0, max-w-3xl, max-h-[calc(100%-37px)], px-2 pb-2)
   ├─ suggestion chips [data-horizontal-scroll] (above form)
   ├─ form#chat-input (rounded-6 shadow-surface-xl bg-secondary-pulse)
   │  ├─ #chatinput.grid → TipTap .tiptap.ProseMirror + “Ask Lovable...” overlay span
   │  └─ bottom row: file input · Chat actions · Build mode · voice · Send
   └─ drop overlay role=presentation (“Add files” / “Drop any files…”) opacity-0 when idle
```

### Timeline / messages
| Node | Evidence in dump |
|------|------------------|
| Scroll root | `.chat-scroll-container` |
| Virtualizer | Absolute-positioned rows (`top: 8205px…`), not `translateY` |
| Message card | `div[data-message-id][id=…]` `mx-auto max-w-3xl rounded-3 py-2` |
| Copy payload | `[data-message-copy-text="…"]` on action clusters |
| Collapsed prose | “Show more” buttons |
| Plan-like card | `[data-card-focusable]` card titled **“Questions answered”** (`shadow-surface-md bg-secondary-pulse rounded-4`) |
| Security chips in prose | “Security Memory” pill / `@security-memory` text |
| Message actions (aria) | Revert to this version · Undo latest edit · Edit message · Helpful · Not helpful · Copy message · Bookmark in history |
| Hover pattern | `md:opacity-0 md:group-hover/user-message:opacity-100` on user-message action row |

### Composer
| Control | DOM |
|---------|-----|
| Form | `form#chat-input` |
| Editor host | `#chatinput.relative.grid` |
| TipTap | `contenteditable` `.tiptap.ProseMirror` `role=textbox` `aria-label="Chat input"` `max-h-[max(35svh,5rem)]` |
| Placeholder | Sibling span “Ask Lovable...” (CSS grid stack), not only TipTap placeholder |
| Attach | Hidden `input[type=file][aria-label="Attach files"]` |
| Actions menu | `aria-label="Chat actions"` `data-testid="chat-input-action-menu-trigger"` |
| Mode | Pill labeled **Build** (`aria-expanded`) |
| Voice | `aria-label="Start voice recording"` |
| Send | `#chatinput-send-message-button` `type=submit` `aria-label="Send message"` |
| Chips above | `[data-horizontal-scroll]` — dump shows **“Re-run full security scan”** (+ gradient fade) |
| Drop overlay | Absolute `role=presentation` “Add files” |

### Present in Lifemark components but **not visible in this HTML snapshot**
- Prompt queue UI (no “Queued” / “Prompt queue” text)
- Security issues bar strip (“N security issues”)
- Mention autocomplete popover (module `mentionParsing` preloaded; no open popover in DOM)
- Live tasks dock / streaming build cards (may be empty state)

Do **not** invent these as “missing from Lovable” — they simply are not in this dump’s current UI state. Lifemark already has `prompt-queue.tsx`, `security-issues-bar.tsx`, `composer-mention-autocomplete.tsx`.

---

## 4. Preview panel (`#preview-panel`)

```
#preview-panel.rounded-4.shadow-surface-xl
└─ relative flex min-h-0 flex-1 overflow-hidden
   └─ bg-background flex-col
      ├─ iframe#static-preview-panel[data-preview-url="https://id-preview--…"]
      ├─ measure trays (pointer-events-none absolute -top-[99999px])  ← width measurement
      │  ├─ tool buttons: Select · Edit text · Annotate · Comment
      │  ├─ Annotation tray: Undo / Redo / Clear
      │  ├─ “0 selections” tray + Clear
      │  ├─ “Pending changes” tray + Clear / Send
      │  ├─ “You have 0 unread comments” + Close / View
      │  └─ “Reverting to earlier version...” + Close
      └─ floating glass toolbar z-40 top
         └─ role=toolbar aria-label="Preview interactions"
            ├─ Select elements · Edit text inline · Draw annotation · Add a comment
            └─ (collapsed) Toolbar options · Minimize toolbar
```

| Concern | Dump evidence |
|---------|----------------|
| Engine | Remote iframe `#static-preview-panel` + `data-preview-url`; asset `ScaledIframe`, `DeviceContainer`, `PreviewPanel`, `PreviewViewNavBar`, `useIframeComm`. **No WebContainer** strings. |
| Top URL/device chrome | Owned by **sticky nav**, not inside preview body |
| Device | `aria-label="Desktop view"` in URL bar (Mobile/Tablet labels not present as aria in this dump — may be in menu) |
| Console | Word “Console” appears in message copy (Google Search Console); **no dedicated preview console chrome aria** found in dump |
| Comment pins | Toolbar “Add a comment”; unread-comments tray; no pin markers visible in this snapshot |
| Visual edit | “Select elements” + “Edit text inline” + “Pending changes” Send/Clear |

---

## 5. CSS / class / component patterns

| Pattern | Role |
|---------|------|
| Tailwind utilities | Layout, spacing, responsive `md:` |
| Design tokens | `--fg-primary`, `--bg-secondary-pulse`, `text-tertiary-pulse`, etc. |
| `btn-primitive` + `data-fx-layer` | Button visual system (Base UI–flavored) |
| `data-panel-*` | `react-resizable-panels` |
| `data-chat-panel`, `data-message-id`, `data-message-copy-text` | Chat landmarks |
| `data-card-focusable` | Interactive plan/answer cards |
| `data-navbar`, `data-url-bar-*`, `data-preview-url` | Preview chrome |
| `view-switcher-track` | Preview/Files/Code/More |
| `.tiptap.ProseMirror` | Composer |
| `rounded-4` / `rounded-6` / `shadow-surface-xl` | Surfaces |
| Sonner CSS | Toasts (present in page CSS) |

---

## 6. Libraries (from modulepreload / DOM) — chat/preview only

| Library / module | Evidence | Lifemark |
|------------------|----------|----------|
| TipTap / ProseMirror | `ChatInputTiptap-*.js`, `.tiptap.ProseMirror` | **Have** `@tiptap/*`, `chat-tiptap-input.tsx` |
| react-resizable-panels | `data-panel-group`, `resizable-*.js` | **Have** |
| TanStack | `vendor-tanstack` | **Have** `@tanstack/react-virtual` (+ Query elsewhere) |
| Radix | `vendor-radix` | **Have** `@radix-ui/*` / shadcn |
| Base UI | `vendor-base-ui`, `base-ui-_r_*` ids | **Missing** as dependency (Radix/shadcn substitute OK) |
| Framer Motion | Not clearly in chat/preview preloads; Lifemark uses it for cards | **Have** (extra vs dump) |
| Virtua | Name not found; absolute-row virtualizer pattern | Lifemark uses **@tanstack/react-virtual** (`translateY`) — different impl, same job |
| mentionParsing | Preload module | Lifemark has mention autocomplete (own impl) |
| ScaledIframe / DeviceContainer | Preloads | Lifemark has device frames in `preview-panel` / toolbar — not same module names |
| Sonner | Toast CSS | **Have** `sonner` |
| Analytics pixels | Bing/LinkedIn/HubSpot/… | Ignore |

---

## 7. Lifemark mapping (current files)

| Lovable region | Lifemark |
|----------------|----------|
| Panel group split | `editor-layout.tsx` `PanelGroup` — chat `defaultSize={22}`, preview sibling |
| Sticky top chrome | `editor-top-bar.tsx` + `ViewSwitcherPill` + `UrlBarPill` |
| Chat shell | `lovable/chat-panel-shell.tsx` (`data-chat-panel`) |
| Timeline | `lovable/chat-timeline.tsx` (`useVirtualizer`, `.chat-scroll-container`) |
| Messages | `lovable/message-row.tsx`, `message-actions.tsx`, `change-card.tsx`, `plan-cards.tsx` |
| Composer | `lovable/chat-composer-shell.tsx` (`#chat-input`), `composer-*`, `chat-tiptap-input.tsx` |
| Preview | `preview-panel.tsx` + Modal `useSandboxPreview` |
| Floating toolbar | `lovable/preview-interaction-toolbar.tsx` |
| Comment pins | `preview-comment-pins.tsx` |
| Visual edit | `visual-edit-overlay.tsx` |

---

## 8. PRECISE GAP LIST

> **Status (2026-07-20):** All section-8 gaps below have been implemented in Lifemark.
> Keep this list as the dump checklist; re-verify against `tmp-lovable-editor-dump.html` if UI drifts.

Gaps = structure/DOM patterns **visible in Lovable HTML** that are missing or meaningfully different in Lifemark. Recreate with Tailwind/shadcn; Modal sandbox iframe remains the preview engine.

### Chat

1. **Composer landmark IDs / grid**  
   Lovable: `#chatinput` CSS-grid stack + `#chatinput-send-message-button`.  
   Lifemark: `form#chat-input` exists (`chat-composer-shell.tsx`) but dump’s `#chatinput` grid host + send button id / `type=submit` landmark not matched 1:1.

2. **Placeholder as grid overlay span**  
   Lovable: sibling span “Ask Lovable...” over ProseMirror (`col-start-1 row-start-1`).  
   Lifemark: TipTap Placeholder extension (“Ask LifemarkAI…”) — different DOM pattern.

3. **Idle drop overlay chrome**  
   Lovable: absolute `role=presentation` with **“Add files”** / **“Drop any files here to add them to your message”** (opacity-0 when idle, always mounted).  
   Lifemark: drag handlers exist; verify always-mounted presentation overlay matching that hierarchy.

4. **`[data-horizontal-scroll]` suggestion chips above composer**  
   Dump: horizontal chip row + right gradient fade; chip text “Re-run full security scan”.  
   Lifemark: follow-up chips exist in pieces (`composer-follow-up-chips`) — confirm same **above-form dock slot** + `data-horizontal-scroll` + fade mask.

5. **Composer dock geometry**  
   Lovable: dock `max-w-3xl` + `max-h-[calc(100%-37px)]` + `--chat-nudge-overlay-px` on `[data-chat-panel]`.  
   Lifemark shell lacks those CSS vars / max-height clamp on the dock wrapper.

6. **Virtualizer positioning model**  
   Lovable: absolute `top` rows + `overflow-anchor: none`.  
   Lifemark: TanStack `translateY` rows. Functional parity OK; scroll anchoring / jump behavior may differ — optional structural align.

7. **`data-message-copy-text` attribute**  
   Present on Lovable action clusters; not found on Lifemark message DOM.

8. **`data-card-focusable` plan/answer card shell**  
   Dump: “Questions answered” card with focus outline token.  
   Lifemark `plan-cards.tsx` / clarify cards — confirm `data-card-focusable` + same surface classes (`shadow-surface-md`, `rounded-4`, `max-w-sm`).

9. **In-message Security Memory pills**  
   Dump: `group/pill` “Security Memory” chips + `@security-memory` in copy.  
   Lifemark: security bar component exists; **inline mention pills in message HTML** may differ.

10. **Composer bottom-row control set (as dumped)**  
    Lovable order: Attach (hidden file) → **Chat actions** menu → **Build** mode dropdown → **Voice** → **Send**.  
    Lifemark: mode/attach/send exist; **voice recording button** and **“Chat actions”** menu trigger (`data-testid="chat-input-action-menu-trigger"`) are gaps if not wired in composer bottom row.

11. **Panel id naming**  
    Lovable `#sidebar-panel` / `data-panel-id="sidebar-panel"`.  
    Lifemark `id="leftpanel"`. Cosmetic but breaks dump-level selectors/tests.

12. **Top-nav width sync**  
    Lovable `[data-editor-chat-nav-container]` width = sidebar panel %.  
    Lifemark top bar is full-width flex; left cluster not percentage-locked to `Panel` size.

### Preview

13. **Iframe landmarks**  
    Lovable: `iframe#static-preview-panel[data-preview-url=…]`.  
    Lifemark Modal sandbox iframe: add equivalent `id` + `data-preview-url` (sandbox URL) for parity hooks.

14. **URL bar data attributes**  
    Lovable: `#preview-url-bar`, `[data-url-bar-track]`, `[data-url-bar-page-trigger]`.  
    Lifemark `UrlBarPill` — missing those data-* landmarks (behavior partly present).

15. **Preview panel chrome ownership**  
    Lovable: device/refresh/URL live in **sticky global nav**; preview body is mostly iframe + overlays.  
    Lifemark: `preview-panel` can still render internal chrome unless `hideChrome`/top-bar-owned path is always on — ensure single chrome owner like dump.

16. **Floating toolbar measure trays**  
    Lovable: offscreen `-top-[99999px]` trays for Annotation / Selections / Pending changes / Unread comments / Reverting — used for width animation into glass pill.  
    Lifemark `preview-interaction-toolbar.tsx` has trays conceptually; verify **offscreen measure + width collapse** pattern (dump uses `width: 0` collapsed slots).

17. **Tray copy exactness (visible in dump)**  
    - “0 selections”  
    - “Pending changes” + Clear/Send  
    - “You have N unread comments” + Close/View  
    - “Reverting to earlier version...”  
    Match labels/actions if not already identical.

18. **Glass toolbar styling**  
    Dump: frosted pill (`backdrop-blur-md`, multi-layer shadow, `border-radius: 9999px`, fixed height ~40).  
    Lifemark toolbar aims at this — audit class parity vs proprietary CDN (recreate with Tailwind).

19. **Scaled device iframe wrapper**  
    Assets `ScaledIframe` + `DeviceContainer` imply scale-to-fit device chrome around iframe.  
    Lifemark has `TabletFrame` / device modes — confirm scale-transform wrapper equivalent when device ≠ desktop.

20. **Panel id**  
    Lovable `#preview-panel` `data-panel-id="preview-panel"`.  
    Align Lifemark preview `Panel` id for selector parity.

### Not gaps (present / out of scope)

- TipTap composer, resizable split ~22/78, view switcher Preview/Files/Code, message revert/helpful/copy, change cards, plan cards, security bar + prompt queue **components**, Modal sandbox path, floating select/edit/annotate/comment toolbar — largely already in Lifemark.
- Prompt queue / security issues **strip** absent from this dump’s live state → cannot mark as Lovable-required from HTML alone.
- Tracking scripts → ignore.
- Lovable proprietary CSS CDN / `btn-primitive` fx layers → recreate, don’t copy assets.
- Base UI → optional; Radix/shadcn acceptable substitute.

---

## 9. Clone checklist (implementation order)

1. Align panel ids + `data-*` landmarks (`sidebar-panel`, `preview-panel`, `data-chat-panel`, url-bar, iframe).  
2. Composer DOM: `#chatinput` grid, overlay placeholder, send id, Chat actions + voice slot, drop overlay always mounted.  
3. Dock chips row `[data-horizontal-scroll]` above form.  
4. Message: `data-message-copy-text`, `data-card-focusable` surfaces, security mention pills.  
5. Top bar: sync left nav width to chat panel %; UrlBarPill data attributes.  
6. Preview: Modal iframe landmarks; toolbar measure trays + exact tray strings; device ScaledIframe behavior.  
7. Keep engine = Modal sandbox URL iframe (never promote WebContainer as the Lovable clone path).
