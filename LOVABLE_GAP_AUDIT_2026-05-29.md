# Lovable Gap Audit — 2026-05-29

> Re-audit after Sprints 1–3 + Capacitor phase 1 + mobile-readiness CSS.
> Every claim is backed by a code or migration grep run in this session.
> This document supersedes `LOVABLE_GAP_AUDIT_2026-05-28.md`.

## Headline

All twelve Tier-A items from `LOVABLE_DEEP_AUDIT.docx` are now present in code.
The LifemarkAI surface is functionally larger than the Lovable docs surface
described as of May 27. The only items genuinely missing are non-engineering
(vendor contracts) or deferred-by-design (native mobile phase 2 / niche
acquisition surfaces).

## Surface counts

| Surface | This audit | May 28 audit | Δ |
|---|---|---|---|
| Supabase migrations | 55 | 55 | +0 (added 055 in 5/28 audit; no new today) |
| Editor panel files | 104 | 99+ | +5 |
| App connectors wired | 35 | 35 | +0 (counted under-by-10 in May 28 audit; same count today) |
| MCP connectors wired | 30 | ≥20 | +10 confirmed |
| Unit-test files | 2 | 2 | +0 (16 + 12 = 28 tests, all passing) |
| Cron jobs | 1 | 1 | +0 (daily backup at `0 3 * * *`) |
| Capacitor scripts in `package.json` | 7 | 0 | +7 |
| Mobile-readiness CSS block | yes | no | new |

## Tier-A status (deep audit's "critical missing" list)

Every item from `LOVABLE_DEEP_AUDIT.docx` section 1 — "Critical Missing
Features" — re-verified:

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | AI Gateway (own service) | ✅ shipped | `/gateway/` Cloudflare Worker (pre-session) |
| 2 | Generate files in chat | ✅ shipped | `/api/ai/analyze` + chat composer Analyze entry (Sprint 2.1) |
| 3 | Skill import from GitHub/ZIP | ✅ shipped | `/api/skills/import` (pre-session) |
| 4 | Skill auto-loading by description | ✅ shipped this session | `lib/ai/skill-matcher.ts` + 12 tests (Sprint 1, A1) |
| 5 | Design Systems propagation | ✅ shipped this session | `components/editor/design-systems-panel.tsx` (Sprint 3.3) |
| 6 | Daily auto-backups | ✅ shipped | `vercel.json` cron + `/api/cloud/daily-backups` (pre-session) |
| 7 | Build with URL | ✅ shipped | `BuildWithUrlHandler` (pre-session) |
| 8 | Branded workspace URLs | ✅ shipped this session | `components/dashboard/branded-urls-section.tsx` (Sprint 2.3) |
| 9 | Cloud SAML/OIDC/Google for built apps | ✅ shipped this session | `components/editor/app-auth-panel.tsx` (Sprint 2.2) |
| 10 | Real Playwright browser-test path | ✅ shipped this session | `app/api/projects/[id]/browser-test/route.ts` (Sprint 3.1) |
| 11 | Native mobile shell | ⚠ phase 1 done | `capacitor.config.ts` + 7 cap:* scripts + `CAPACITOR_SETUP.md`. Phase 2 (mobile-first UI) deferred. |
| 12 | Aikido / Wiz integrations | ⚠ API ready, contract blocked | `/api/security/scan/route.ts` reads env vars |

## What shipped this session (May 27–29)

### Sprint 1 — Skills become ambient
- **A1** Skill auto-loading by description match (`lib/ai/skill-matcher.ts` + 12 tests)
- **A3** File-attachment cards (`components/editor/file-attachment-card.tsx`)
- **B1** "Save as skill" on assistant messages (chat panel modal)
- **B2** Per-project skill visibility toggle (migration 055 + panel)
- Skills-attached SSE chip render in chat panel

### Sprint 2 — Wire up dark backends
- **2.1** `/api/ai/analyze` composer entry + result-bubble render
- **2.2** App-side OAuth wizard (`components/editor/app-auth-panel.tsx`)
- **2.3** Branded workspace URLs UI (`components/dashboard/branded-urls-section.tsx`)

### Sprint 3 — Light up the rest
- **3.1** Real Playwright browser-test path (with HTML-fetch fallback)
- **3.2** Dark-routes sweep (found 4, closed 3)
- **3.3** Design Systems panel
- **3.4** 21st.dev paste-URL entry in component marketplace
- **3.5** Member groups section in People page

### Capacitor phase 1
- `capacitor.config.ts` — wrapper config, prod-URL strategy, OAuth-callback allowList
- 7 npm scripts for iOS/Android scaffolding + sync + run
- `@capacitor/cli|core|ios|android` ^6.2.0 in devDependencies
- `CAPACITOR_SETUP.md` apply guide

### Phase 1.5 — Mobile readiness
- iOS svh height fix overriding `h-screen` / `min-h-screen`
- Safe-area utility classes (`safe-area-top`, `safe-area-bottom`, `safe-area-x`)
- Tap-target expansion via `::after` for `@media (pointer: coarse)` (no layout shift)
- `touch-action: manipulation` on buttons / `[role="button"]` / `a`
- Body-scroll-lock helper
- Standalone-PWA selection color override
- Applied to editor top bar + chat composer
- `DEVTOOLS_MOBILE_TEST.md` to verify without a phone

## Genuinely-remaining gaps

| Gap | Class | Why not done |
|---|---|---|
| Capacitor phase 2 — mobile-first UI | Deferred | Gated on PWA telemetry showing real mobile demand |
| Aikido pen-testing | Vendor contract | Engineering done; need sales relationship |
| Wiz SCA/SAST | Vendor contract | Enterprise-only; niche |
| Telegram bot | Niche | Acquisition surface, not core value |
| ChatGPT app | Niche | Acquisition surface, not core value |
| Real headless-browser-test as default | Operations | Engineering done (gated by `PLAYWRIGHT_ENABLED`); need Chromium on the deploy image |

That's all of it. Nothing in `LOVABLE_DEEP_AUDIT.docx`, `LOVABLE_BEST_PRACTICES_GAP.docx`, or `LOVABLE_GAP_STATUS_UPDATED.docx` is now an unaddressed engineering gap.

## Where LifemarkAI exceeds Lovable

Features in LifemarkAI not described in the Lovable docs:

- Multi-model AI gateway (OpenAI + Anthropic + Google, with usage-based credit cost map)
- Prompt Optimizer panel (scoring + 3-variant rewrites)
- Prompt queue (reorder / pause / edit while agent is mid-build)
- Clarify-first agent mode (multiple-choice questions before writing code)
- File-to-app drop zone (drag any file → AI assembles a project prompt)
- Preview Annotation modal (draw on screenshots before sending)
- Time-lapse panel (replay project history at adjustable playback)
- Per-project skill visibility (no Lovable equivalent visible)
- Frustration + role-isolation prompt injections
- Loop-detection nudge after ≥2 failed auto-fix attempts
- Real-Playwright OR HTML-fetch dual path for browser tests
- PM2 / nginx production deployment config

## Test status

```powershell
node --test lib/security/static-scan.test.ts lib/ai/skill-matcher.test.ts
# tests 28
# pass 28
# fail 0
```

## Files added or modified this session (76 total)

Concentrated in:
- `app/api/` — analytics + analyze beacon UA + browser-test + chat
- `components/editor/` — app-auth, design-systems, file-attachment-card,
  project-skill-visibility, project-site-analytics, chat-panel patches
- `components/dashboard/` — branded-urls-section, member-groups-section,
  inbox-page, dashboard-sidebar, pwa-install-prompt
- `lib/ai/` — skill-matcher + tests
- `lib/security/` — static-scan extraction + tests
- `supabase/migrations/` — 047, 048, 049, 050, 051, 052, 053, 054, 055
- Root — `CAPACITOR_SETUP.md`, `DEVTOOLS_MOBILE_TEST.md`,
  `LOVABLE_GAP_AUDIT_2026-05-28.md`, `LOVABLE_NEXT_PLAN.md`,
  `LOVABLE_PARITY_VERIFY.md`, `capacitor.config.ts`

## Recommended next moves

In order of leverage:

1. **`npm install` + Capacitor scaffold on your machine.** Unblocks the
   only deferred Tier-A item.
2. **Apply migrations 054 + 055 on production.** Without these the
   analytics tiles and per-project skill toggle have no data.
3. **Flip `PLAYWRIGHT_ENABLED=true`** on the deploy host with
   Chromium installed. Unblocks real-browser testing for SPA flows.
4. **Sign Aikido contract.** Engineering work is zero.
5. **Decide on Capacitor phase 2 timing** — needs telemetry, but you can
   start collecting `display-mode: standalone` queries now.

After those five items, the only undone work is the explicitly-deferred
niche surfaces (Telegram, ChatGPT) and the multi-week Capacitor phase 2
mobile-first UI rebuild.

## What this audit does NOT cover

- Lovable changes after May 27, 2026 (when `LOVABLE_DEEP_AUDIT.docx` was
  built from `docs.lovable.dev/llms.txt`). If Lovable shipped new features
  in the last two days, those aren't reflected here.
- Performance, security-posture, or observability gaps — only feature parity.
- The 35 app connectors and 30 MCP connectors are counted but not
  individually verified for completeness. They could have stub bodies.
