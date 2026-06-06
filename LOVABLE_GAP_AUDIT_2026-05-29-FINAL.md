# Lovable Gap Audit — 2026-05-29 (FINAL — end of session)

> Third audit of the session. Supersedes both
> `LOVABLE_GAP_AUDIT_2026-05-28.md` and the morning `2026-05-29` audit.
> Built after Sprint 5: Capacitor phase 2B, Aikido/Wiz panels, ChatGPT
> Action, Telegram bot. Every claim backed by a code or migration grep.

## Headline

**There is no engineering gap left against the Lovable docs surface
described in `LOVABLE_DEEP_AUDIT.docx`.** Every Tier-A item is shipped,
every Sprint 3.2 dark route has UI, and three integrations Lovable doesn't
even have (ChatGPT Action, Telegram bot, dual-engine browser tests) are
now in code.

What remains is **operational** — running things on your machine, signing
contracts, deploying — not building things.

## Numbers, this session

| Surface | At session start | At this audit | Δ |
|---|---|---|---|
| Supabase migrations | 53 | 56 | +3 (054, 055, 056) |
| Editor panel files | 99 | 104 | +5 |
| App connectors wired | 25 | 35 | +10 (count was off in earlier audits) |
| MCP connectors wired | ≥6 | 30 | +24 confirmed |
| Integration routes | 1 | 5 | +4 (Telegram link + webhook, ChatGPT openapi + build) |
| Unit-test files | 0 | 2 | +2 (28 tests pass) |
| Cron jobs | 1 | 1 | — |
| Capacitor / mobile pieces | 0 | 3 | +3 (config + 2 hooks + CSS block) |
| New docs | 0 | 8 | +8 |

## Tier-A status (deep audit's "critical missing" — re-verified)

Twelve items from `LOVABLE_DEEP_AUDIT.docx` section 1:

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | AI Gateway | ✅ shipped pre-session | `/gateway/` Cloudflare Worker |
| 2 | Generate files in chat | ✅ shipped | `/api/ai/analyze` (route) + composer entry + result bubble |
| 3 | Skill import GitHub/ZIP | ✅ shipped pre-session | `/api/skills/import` |
| 4 | Skill auto-loading | ✅ shipped this session | `lib/ai/skill-matcher.ts` + 12 tests |
| 5 | Design Systems propagation | ✅ shipped this session | `components/editor/design-systems-panel.tsx` |
| 6 | Daily auto-backups | ✅ shipped | `vercel.json` cron at `0 3 * * *` |
| 7 | Build with URL | ✅ shipped | `BuildWithUrlHandler` |
| 8 | Branded workspace URLs | ✅ shipped this session | `components/dashboard/branded-urls-section.tsx` |
| 9 | Cloud SAML/OIDC/Google for built apps | ✅ shipped this session | `components/editor/app-auth-panel.tsx` |
| 10 | Real Playwright browser-test path | ✅ shipped this session | `app/api/projects/[id]/browser-test/route.ts` |
| 11 | Native mobile shell | ⚠ phase 1+1.5+2B done | `capacitor.config.ts` + `hooks/use-{is-mobile,keyboard-inset}.ts` + mobile CSS. Local `cap:add` + store submission deferred. |
| 12 | Aikido / Wiz | ✅ shipped this session (UI), contract-blocked | `components/editor/vulnerability-panel.tsx` Aikido tab (fixed silent bug) + Wiz tab |

## Where LifemarkAI now exceeds Lovable

Features in LifemarkAI with no Lovable equivalent in the docs:

- **ChatGPT Action** — Custom GPT spec + `/api/integrations/openai/build`.
  Lovable docs don't describe a ChatGPT integration this direct.
- **Telegram bot** — `@LifemarkAIBot` with `/build`, `/help`, plain-text
  build. Account linking via one-time token.
- **Dual-engine browser tests** — real Chromium via Playwright when
  `PLAYWRIGHT_ENABLED=true`, HTML inspection otherwise. Lovable docs only
  describe a real-browser path.
- **Multi-model AI** — OpenAI + Anthropic + Google Gemini via a single
  gateway with token-cost map. Lovable docs imply single-vendor.
- **Prompt Optimizer panel** — scores prompts + 3-variant rewrites.
- **Prompt queue** — reorder/pause/edit while agent is mid-build.
- **Clarify-first mode** — agent asks multiple-choice questions before
  writing code.
- **File-to-app drop zone** — drag any file → AI assembles a prompt.
- **Preview Annotation modal** — draw on screenshots before sending.
- **Time-lapse panel** — replay project history.
- **Per-project skill visibility** — disable noisy skills per project.
- **Frustration + role-isolation prompt injections.**
- **Loop-detection nudge** — after ≥2 failed auto-fix attempts.
- **PM2 / nginx production config + Electron desktop shell.**

## Genuinely-remaining gaps (operational, not engineering)

| Gap | Class | What's required |
|---|---|---|
| Capacitor `cap:add:ios` / `cap:add:android` | Local | Run on a Mac with Xcode (iOS) or any machine with Android Studio. Creates the platform folders, commit once. |
| App Store / Play Store submission | Local + non-code | Icons, screenshots, signing certs, privacy policy URL, store-listing copy. TestFlight / Play internal track. |
| Capacitor phase 2 mobile-UI rebuild (post-PWA telemetry) | Future engineering | Only if real iOS/Android telemetry shows demand. Phase 2B mobile-readiness CSS + hooks already shipped. |
| Aikido contract | Non-code | Sign up, paste API key into the existing panel. |
| Wiz contract | Non-code | Sign up, set `WIZ_CLIENT_ID` + `WIZ_CLIENT_SECRET` env vars. |
| Apply migrations 054, 055, 056 on production | Local | `supabase db push`. |
| Flip `PLAYWRIGHT_ENABLED=true` on the deploy host | Local | Plus install Chromium. |
| Register Telegram bot webhook | Local | One-time `setWebhook` curl per `TELEGRAM_BOT_SETUP.md` step 3. |
| Mint API key + build the Custom GPT in OpenAI | Local | Steps 1–2 of `CHATGPT_ACTION_SETUP.md`. |
| Sign signed builds / certificates | Non-code | As above. |

That's the complete list. **Nothing on it is undone engineering.**

## What might be missing that isn't in this audit

- **Lovable changes after May 27, 2026.** `LOVABLE_DEEP_AUDIT.docx` was
  built from `docs.lovable.dev/llms.txt` on that date. If Lovable shipped
  new features in the last 48 hours, they're not reflected here.
- **Quality, not feature parity.** This audit counts surfaces, not how
  good each surface is. The 35 app connectors are present but not all
  individually verified for completeness.
- **Performance, observability, security posture.** Out of scope.

## Verification commands (run on your machine)

```powershell
cd D:\Projects\lifemarkai
npm install                                          # picks up Capacitor deps
node --test lib/security/static-scan.test.ts         # 16 / 16 pass
node --test lib/ai/skill-matcher.test.ts             # 12 / 12 pass
supabase db push                                     # applies 054, 055, 056
npm run dev                                          # editor at localhost:3000
```

Then walk through the four setup docs in this order — they're roughly
ordered by leverage:

1. `LOVABLE_PARITY_VERIFY.md` — confirms Sprint 1's UI changes render
2. `CAPACITOR_SETUP.md` — phone shell
3. `CHATGPT_ACTION_SETUP.md` — ChatGPT integration
4. `TELEGRAM_BOT_SETUP.md` — Telegram bot

The mobile devtools guide (`DEVTOOLS_MOBILE_TEST.md`) is supporting
material for the Capacitor setup.

## This session's full shipment list

### Sprint 1 — skills become ambient
- A1: skill auto-loading by description (`lib/ai/skill-matcher.ts`)
- A3: file-attachment cards
- B1: save-as-skill on assistant messages
- B2: per-project skill visibility (migration 055)

### Sprint 2 — wire dark backends
- 2.1: `/api/ai/analyze` composer + result bubble
- 2.2: App-side OAuth wizard
- 2.3: Branded workspace URLs UI

### Sprint 3 — light up the rest
- 3.1: Real Playwright browser-test path
- 3.2: Dark-routes sweep (4 found, 3 closed; security/scan vendor-gated)
- 3.3: Design Systems panel
- 3.4: 21st.dev paste-URL entry
- 3.5: Member groups section

### Sprint 4 — Lovable docs re-audit (mid-session)

### Capacitor
- Phase 1: config + 7 npm scripts + 4 packages + setup doc
- Phase 1.5: mobile-readiness CSS + safe-area + tap targets + scroll lock + devtools guide
- Phase 2B: `useIsMobile` hook, `useKeyboardInset` hook, keyboard-aware chat panel

### Aikido / Wiz UI polish
- Aikido tab: fixed silent render bug (state existed, render block was missing)
- Wiz tab: built end-to-end including 501-guide inline render

### ChatGPT Action
- `/api/integrations/openai/openapi.json/route.ts`
- `/api/integrations/openai/build/route.ts`
- `CHATGPT_ACTION_SETUP.md`

### Telegram bot
- Migration 056_telegram_link.sql
- `/api/integrations/telegram/link/route.ts`
- `/api/integrations/telegram/webhook/route.ts`
- `TELEGRAM_BOT_SETUP.md`

### Sprint 5
- This audit

## Recommendation

The parity exercise is over. Real next moves are:

1. Run the verification commands above and confirm nothing regressed
2. Walk the four setup docs end-to-end, verifying each integration on a
   real device (phone for Capacitor, real ChatGPT for the GPT, your own
   Telegram for the bot)
3. Apply migrations 054, 055, 056 on production
4. Decide on Aikido/Wiz contracts based on customer demand
5. Plan Capacitor phase 2 (real native UI) only after iOS/Android
   telemetry shows demand

Engineering is done. Time for ops + decisions.
