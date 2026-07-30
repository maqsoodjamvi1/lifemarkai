# LifemarkAI vs Lovable — comparison, 30 July 2026

> **Revised later the same day.** Nine of the items this report listed as gaps have since been
> closed — connectors 52→83, models refreshed, and all five truthfulness defects fixed. Sections
> 4 and 7 carry the current status; §8 is the remaining list. **None of it is pushed yet**, which
> is now the largest single item outstanding.

**Question asked:** is LifemarkAI now equal to Lovable?

**Answer:** on the product's core loop — prompt → build → preview → fix → publish — yes, and in
several places ahead. On the surrounding platform, no: Lovable ships a real desktop app, a real
mobile app, a third-party-audited security posture and an industry certification. The connector and
model gaps that were here this morning are closed. What remains is mostly not the AI.

**Method.** Lovable's side comes from its official changelog covering **24 Apr – 29 Jul 2026**
(docs.lovable.dev/changelog, read in full) plus its agent and agent-integrations posts. LifemarkAI's
side comes from reading this repo — every claim below was checked against a file, not recalled.
Where a check came back ambiguous or contradictory it is marked as such rather than resolved in our
favour.

**Caveat stated up front.** This compares *shipped surface*, not *quality of output*. Nobody has run
the same twenty prompts through both products and graded the results. Feature parity is not the same
as output parity, and the second question is the one users actually feel.

---

## 1. Verdict by area

| Area | Verdict | One-line reason |
|---|---|---|
| Prompt system | **Ahead** | ~25 conditional context blocks per request; BM25 + model-picked file set |
| Agent loop | **Ahead** | 15 tools + MCP, intent gate, context seed, 30 iterations |
| Self-verification | **Ahead** | Live in chat *and* agent paths, real Chromium, cross-model fix chain |
| Multi-role intelligence | **Ahead (as of today)** | 11-role debate + wave scheduler now auto-routes; Lovable's subagents are read-only |
| Editor & chat UX | **Parity** | All four preview-toolbar tools, queueing, line refs, guest comments, settings search |
| Backend / Cloud | **Near parity** | Two real gaps: no "remove Cloud", health check is synthetic |
| Publishing / distribution | **Near parity** | App-as-MCP and platform MCP both real; audience control coarser |
| Connectors | **Parity** (was behind) | 83 vs ~80+ — 30 added, gap closed |
| Models offered | **Parity** (was behind) | GPT-5.6, Sonnet 5, Gemini 3.6 added; economy path deliberately unchanged |
| Security scanning | **Behind** | Still one static profile, no agentic deep scan. PII now blocks publish |
| Compliance posture | **Behind** | Lovable holds AIUC-1; we hold SOC 2 *pre-work* |
| Desktop app | **Behind** | Shell exists; Lovable's is a real multi-tab app with local MCP |
| Mobile app | **Behind** | Config only, not buildable |
| SSO depth | **Near parity** | Missing IdP-initiated sign-in (explicitly documented as unsupported) |

---

## 2. Where LifemarkAI is genuinely ahead

**Context assembly.** `lib/ai/http/chat.ts` appends roughly 25 conditional blocks per request:
project schema, design system, decision log, learned rules mined from `health_findings`, connector
gateway instructions, an asset-URL manifest that survives incremental edits, conversation summary,
preview console errors, frustration detection, a role-isolation guard. Lovable's changelog documents
nothing at this density.

**File selection is two-stage.** `lib/ai/context-selector.ts` is a real Okapi BM25 (k1=1.5, b=0.75)
used when the codebase exceeds the character budget; `lib/ai/file-selector.ts` additionally has a
cheap model pick relevant paths from a paths-only manifest. Lovable has had RAG since 2024; the
two-stage combination is ours.

**Self-verification is wired into the live paths.** `lib/ai/self-verify.ts` is called from
`lib/ai/http/chat.ts:2191` and `lib/ai/http/agent.ts:581` — not only from a side route. It renders in
real headless Chromium, collects page/console errors and blank-root diagnostics, then fixes and
re-verifies, escalating to a *different model* between rounds (`selectModelChain`) rather than asking
the model that just failed. 2 fix rounds, 55s budget.

**The agent loop.** 30 iterations, 15 built-in tools (`read_file`, `write_file`, `search_code`,
`edit_file`, `glob_search`, `analyze_code`, `find_definition`, `generate_image`,
`read_preview_console`, `read_preview_network`, `read_ai_activity`, `browse_preview`, `delete_file`,
`list_files`, `finish`) plus injected MCP connector tools, `connector_call`, `web_search`,
`fetch_url`, `db_query`. An intent gate returns 409 on an informational question instead of burning a
30-step run, and a BM25 context seed means it doesn't re-read files it was already shown.

**Multi-role intelligence.** `lib/ai/editor-lenses/orchestrator.ts` runs 11 roles with a debate
protocol (architect proposes, security/devops/database critique, CTO breaks ties above risk 60) and a
wave scheduler (3 parallel tasks, checkpointed). Write-capable roles execute through the real agent
loop. **As of today it auto-routes real builds** — a change made this session; before that it was
reachable only from a side panel, which is why previous versions of this report should not have
claimed it as a live advantage.

Lovable's comparable feature, subagents (27 May), is explicitly **read-only**: they "split research,
code exploration, and review into focused parallel work" and *cannot edit files*. Ours writes. That
is a genuine architectural lead — with the caveat in §6 about it being unproven on a live project.

**Immutable audit log.** `supabase/migrations/077_audit_log_immutable.sql` blocks UPDATE and DELETE
via trigger, enforced even against `service_role`, with purges only through a GUC-gated function.
Lovable improved audit *filters*; it does not document append-only enforcement.

---

## 3. Parity — matched, item by item

Everything here was verified present in the repo against a dated Lovable changelog entry.

**Editor and chat.** All four preview-toolbar tools (select element, inline text edit, draw
annotation, add comment) at `components/editor/lovable/preview-interaction-toolbar.tsx:284-352`;
message queueing with reorder/remove/pause; line references (`Button.tsx:42` pills) with
click-to-jump; guest comments on public preview links; paste-an-API-key → labeled secret; favicon
status badge; settings search with a synonym map; `@connector` references in chat; markdown preview
in the code editor; file-tree collapse/expand-all; media gallery at real proportions with quick
actions; draw-on-image before sending; chat history search with **semantic** mode backed by real
embeddings (`text-embedding-3-small`, cosine similarity).

**AI capabilities.** Three design directions before building (`design-previews.ts` requires "exactly
THREE distinct visual directions"); workspace skills as markdown playbooks with auto-attach; custom
MCP servers (10/user, HTTPS-only); Plan mode distinct from Build; voice TTS **and** STT through the
gateway; Build-with-URL referencing public pages (10 refs); sandboxed code execution in chat (E2B or
Modal, isolated from the project); browser testing against the live preview; embeddings for RAG.

**Backend / Cloud.** Per-project managed Supabase provisioning; manual pause + wake; compute resize
from chat; SQL-dump export; Jobs tab with schedule/history/enable-disable; slow-query finder that
ranks by `mean_exec_time` and proposes indexes; daily backups with self-service restore including a
schema-change dry run; SAML 2.0 for the *built app's own* end users; unified credit balance
(`074_unified_credit_balance.sql`).

**Publishing.** App-as-MCP with owner-approved action lists — two implementations, the newer one
(`mcp-generate.ts`) writing a real MCP server into the app with its own Supabase OAuth; a
platform-level MCP server (`routes/api/mcp.ts`, ~491 lines, scoped API-key auth); branded workspace
subdomain URLs; SEO/AI-search audit; Telegram bot; Capacitor native export for generated apps;
domain purchase and connect across three registrars.

**Governance.** SCIM v2 provisioning; SSO with enforcement, group→role mapping, JIT and session
expiry; new-device sign-in alert emails; IPTC/XMP provenance on AI images; immutable audit log.

---

## 4. Where LifemarkAI is behind — with the specifics

### 4.1 Connectors — CLOSED (52 → 83)
Thirty added, in the themes the gap was concentrated in: warehouse/BI (Redshift, Athena, Fabric,
ClickHouse, dbt), commerce (WooCommerce, PrestaShop, Wix, Lightspeed, Paddle, Chargebee), EU
accounting (Xero, Lexware, sevDesk, Wave, Zoho ×2), growth/data (GA4, Apollo, Apify, Tally,
Pipedrive, Logo.dev, KLIPY, Mapbox), plus SharePoint, HeyGen, Replicate, X, GatewayAPI.

Verifying that batch also exposed three pre-existing mismatches between the gateway registry and the
UI panel — two separate lists nothing cross-checked. `aws_s3` was in the UI with no registry entry
(configurable and inert), `openai` was the reverse, and `gemini_enterprise` collected a key the
gateway never read. All three fixed, and the registry↔panel agreement is now asserted in both
directions.

*Original finding, for the record:* `lib/integrations/connector-registry.ts` held **52**. Lovable named roughly **72 in three months of
changelog alone**, and had many before April. Missing from ours, clustered by theme:

- **BI / warehouse:** Amazon Redshift, Microsoft Fabric, ClickHouse, AWS Athena, dbt Semantic Layer
- **Commerce:** WooCommerce, PrestaShop, Wix, Shopify bulk catalog edit, Lightspeed, Paddle
- **EU accounting:** Xero, Lexware, Sevdesk, Wave, Zoho Books, Chargebee
- **Growth / data:** Google Analytics, Apollo.io, Apify, Tally, Pipedrive, Logo.dev, KLIPY, Mapbox
- **Other:** SharePoint, HeyGen, Replicate, X

We have ten they don't name: ElevenLabs, Firecrawl, Perplexity, Discord, Jira, Zendesk, Intercom,
SendGrid, Google Calendar, Google Sheets.

This is a volume gap, not an architectural one — the gateway (`connector-proxy.ts` +
`connector-exec.ts`) already injects credentials server-side and forwards only to the connector's own
host, so each addition is registry work.

### 4.2 Models — CLOSED, and the refresh was cheaper
Premium coding/reasoning moved from `gpt-5.2-codex`/`gpt-5.2` ($1.75/$14) to `gpt-5.6-terra`
($1.25/$7.50) — a generation newer and ~46% cheaper on output. Catalog frontier `gpt-5.5` ($5/$30,
no endpoint above 99% uptime) → the same Terra, ~4× cheaper. `claude-sonnet-4.6` → `claude-sonnet-5`
($3/$15 → $2/$10). Added `gpt-5.6-luna` ($0.50/$3) and `gemini-3.6-flash`. Free coding moved off
`qwen3-coder:free`, whose sole provider had 0% uptime at check time, so the "free" path was silently
paying the paid fallback on every request.

**The economy posture is unchanged on purpose** (per an explicit instruction): default coding
`qwen3-coder`, fast `deepseek-v4-flash`, balanced `deepseek-v4-pro`, `AI_COST_MODE=economy`. So every
tier is the same price or cheaper than before while being a generation newer. The
"reconsider economy as the default" recommendation below therefore stands as a *product* question,
not a technical one.

Every slug was verified live against the endpoints API. That mattered: a bulk `/models` capture
appeared to show `deepseek` and `qwen3-coder` deleted — which would have meant the whole default path
pointed at dead slugs — but the capture was truncated and both are alive and cheap. Also confirmed
`openai/gpt-5.6-codex` does not exist and `z-ai/glm-5.2` is listed with **zero providers**; neither
was adopted.

*Original finding, for the record:* `lib/ai/model-defaults.ts` defaulted to `deepseek/deepseek-v4-pro`, `qwen/qwen3-coder`,
`deepseek/deepseek-v4-flash`, with `openai/gpt-5.2-codex` / `gpt-5.2` as the premium tier. Lovable
now offers **GPT-5.6 (Sol/Terra/Luna)**, **Gemini 3.6 Flash** as the default for app AI, **Opus
4.7**, **GPT Image 2**, **Nano Banana 2 Lite**, and four Gemini TTS models. Our image models are
`gemini-3.1-flash-image` and `dall-e-3`.

Two distinct problems. First, currency: several of these did not exist when our catalog was written.
Second, and more consequential, `AI_COST_MODE` defaults to `"economy"`, so premium requests get
downgraded unless "justified" — a user on defaults is being served by cheaper models than a Lovable
user on defaults. That is a deliberate cost decision, but it shows up as output quality.

### 4.3 Security scanning depth
Lovable split scanning on 1 June into **Basic** (RLS, schema, dependency vulnerabilities, auto-runs at
publish) and **Deep** (agentic review of access control, endpoints, secrets, input handling), added
auto-fix for eligible Basic findings, and scheduled Deep scans on Enterprise. It also ships **Wiz**
and **Aikido** as first-class integrations, and on 29 July added dependency false-positive
suppression.

We have one static profile (`lib/security/scan.ts` regex scan + `lib/security/deps.ts` curated risky-
package list — not a live CVE feed). `routes/api/security/scan.ts` dispatches to Aikido and Wiz, so
the vendor path exists. Two specific weaknesses:

- **No agentic deep scan.** Searched `deep scan` / `scanMode` / `agentic scan` — nothing. **Still
  open** — this is the largest remaining security gap.
- **PII never blocks a publish** — **FIXED.** `lib/security/publish-gate.ts` now blocks on critical of
  any kind *and* on `high`-severity PII (SSN, card). A `low`-severity email in a fixture still only
  reports, because a gate that stops every fixture is a gate people route around. Two independent
  overrides, since accepting "this key is fake" is a different decision from "publish these card
  numbers".

### 4.4 Publish-from-chat bypasses the security gate — FIXED
Both paths now call one shared `evaluatePublishGate`, so they cannot drift apart again — which was the
real root cause, not the missing call. The chat path accepts **no** override: "publish it" is not
informed consent to ship a card number.

*Original finding, for the record:*
`lib/deploy/publish-from-chat.ts` never calls `scanProject` or `auditDependencies`, while
`routes/api/deploy.ts:284-298` blocks critical findings with a 412. Lovable's 9 June entry says
publishing from chat "runs the same security checks". **Ours does not.** And it is not a matter of a
missing call — the file talks to the Netlify API directly (`netlifyFetch`, `getOrCreateSite`,
`tryViteBuild`), so it is an entirely independent deploy path that never passes through the gated
route. Asking the agent to publish therefore skips a check the button enforces.

### 4.5 Desktop app: shell vs product
Contradiction worth recording: one audit reported Electron absent, a second found it. **It exists** —
`electron/main.js`, `electron-builder.yml`, mac/win/linux build scripts, `electron@^42.3.0`. The main
process uses `BrowserWindow`, `Menu`, `ipcMain` and `shell`, so there is real IPC and OS integration —
but no `findInPage`, no tab or `WebContentsView` management, no
`setPermissionRequestHandler`, no `autoUpdater`, no `Tray`.

Lovable Desktop is on macOS (24 Apr) and Windows (6 Jul), at 1.4.0, with local MCP servers,
multi-project tabs including background/focused open, Cmd+F find-in-page, and per-app clipboard and
location permission prompts. Ours is a wrapper; theirs is a product.

### 4.6 Mobile app: not buildable
`capacitor.config.ts` and the Capacitor deps exist, but there are no `ios/` or `android/` folders, and
`CAPACITOR_SETUP.md` says so directly — the `cap add` step has never been run. Lovable's mobile app
launched globally on iOS and Android on 18 May.

### 4.7 Compliance
Lovable is, by its own claim, the first AI coding agent platform to achieve **AIUC-1**, and ships
Aikido penetration testing with downloadable reports on all plans. Our
`docs/compliance/soc2-evidence-starter.md` states in its own header that it is "**not a
certification** — it's the pre-work". For anyone selling to enterprises this is the widest gap in
this document, and the only one that cannot be closed by writing code.

### 4.8 Smaller confirmed gaps
- **No in-place Vite → TanStack Start upgrade.** Lovable shipped it 28 July via `/` command, Settings
  or chat request, confirm-first and revertable. We set framework at creation only; the settings panel
  shows it read-only. The AI could attempt a migration if asked, but there is no feature.
- **Workspace identity reuse (16 July):** built apps recognising the signed-in platform user with no
  login page. Absent; our `workspace/identity.ts` is platform SSO/SCIM, a different thing.
- **Private npm registry (18 June):** absent — `routes/api/npm/search.ts` only proxies the public
  registry.
- **IdP-initiated SSO:** absent, and documented as such in our own UI:
  `sso-setup-page.tsx:225` — "No. Only SP-initiated sign-in is supported." Lovable shipped it 10 July.
- **Auto-revoke leaked API keys (25 July):** absent. Manual revocation only.
- **Restrict who can download project code (1 July):** absent.
- **Publish audience control (21 July):** ours is three tiers (public / workspace / private); Lovable
  has groups, individuals and external emails with EXT labelling.
- **Remove Lovable Cloud (3 July):** **FIXED.** `deleteManagedProject()` had zero call sites; now
  wired as `POST /api/cloud/remove` with guardrails proportional to deleting a customer's database —
  typed project name, a separate data-loss acknowledgement, refusal when no backup is on record, and
  the remote delete before the local flag clear so a failure can never strand a live billed instance
  invisible to us.
- **Default hosting region (29 June):** column exists and is read at provision time; no UI writes it.
- **Interface language selector (17 June, 11 languages):** ours covers 7 languages but only ~11 string
  keys — menus and settings, not the platform.
- **Cloud DB health check:** **FIXED.** Was pure fabrication — every metric was arithmetic on
  unrelated counts, so adding a file "used more RAM" and 40 deploys wrapped CPU back to 10%. Now read
  from the instance (`pg_postmaster_start_time`, `pg_database_size`, `pg_stat_database`,
  `information_schema`). RAM and CPU are **not reported at all**, because the Management API cannot see
  host metrics and there is no honest number to give; they are named in `unavailable` and the panel
  says so. An unreachable database returns `"unknown"`, not `"healthy"`.
- **Project monitoring:** ours scans code and *self-verify* errors on a cron; Lovable reviews "recent
  visitor errors" from the published site. We do not collect live visitor telemetry.
- **Subagents are not actually parallel** — **FRAMING FIXED, capability still absent.** `subagents.ts`
  contains no `await`, no `generateAI`, no `Promise.all`. The UI now says "Scanning codebase" /
  "3/3 areas" / badge "Scan" instead of implying concurrent agents, and the module documents the real
  mechanism. Behaviour is unchanged and asserted unchanged. Lovable's subagents remain real parallel
  read-only model workers, so **the capability gap is still open** — deliberately, because it costs N
  extra model calls per build and that should be a priced decision rather than something a label
  implies.

---

## 5. Corrections to earlier reports in this folder

- Previous versions credited the 11-role orchestrator as a live differentiator. Until this session it
  was unreachable from any normal build. It now auto-routes.
- One audit this session reported Electron absent. It is present at the repo root; the search was
  scoped to the migration app. Recorded because a false gap is as damaging as a missed one.
- `docs/lovable-gap-2026-07.md` remains accurate on workspace identity reuse.

---

## 6. What is not yet proven

- **Orchestrator auto-routing** is verified by 82 assertions but has not run end-to-end on a live
  project. The handoff crosses the browser (`initiative_routed` → chat-panel →
  `lifemark-intelligence-run` → panel `runBuild`), so only a real multi-part prompt on lifemarkai.com
  will confirm it.
- **None of this session's work is pushed.** Four ship scripts, all unrun — see §8.
- **The new Cloud health query has not run against a live managed instance.** The SQL is standard
  (`pg_stat_database`, `pg_database_size`) and the route degrades to `status: "unknown"` on failure
  rather than inventing values, but "degrades correctly" is itself only asserted, not observed.
- **`POST /api/cloud/remove` has never been executed.** It permanently deletes a database. The
  guardrails are asserted; the happy path is not, and deliberately should not be tested on a real
  project without a throwaway one first.
- **No head-to-head output comparison exists.** See the caveat at the top.

---

## 6b. Verification log for this document

Every LifemarkAI claim above was re-checked against the code after drafting. Confirmed by direct
inspection: 52 connectors (top-level registry keys); PII rules max out at `high`
(`scan.ts:137,140,144`) while the gate tests `severity === "critical"` (`deploy.ts:288`);
`publish-from-chat.ts` contains no scan call and deploys via Netlify itself;
`deleteManagedProject` has exactly one occurrence in the repo — its own definition;
`ramUsed = Math.min(ramTotal, 80 + (filesCount ?? 0) * 2)` quoted verbatim from `health.ts:35`;
self-verify called at `chat.ts:2191` and `agent.ts:581`; exactly 15 agent tool names, matching the
list given; `subagents.ts` has no `await`; `AI_COST_MODE` defaults to `"economy"`
(`cost-controls.ts:30`); `BM25_K1 = 1.5`, `BM25_B = 0.75` (`context-selector.ts:14-15`); intent gate
returns `{ status: 409 }`; no `ios/` or `android/` folder; audit trigger is
`BEFORE UPDATE OR DELETE … FOR EACH ROW` with `RAISE EXCEPTION`
(`077_audit_log_immutable.sql:21,28,40-41`).

Three drafting errors were caught and corrected in the process: a stale self-verify line number, an
understatement of the Electron main process (it also uses `ipcMain` and `shell`), and an
understatement of the publish-from-chat gap.

## 7. Closed on 30 July 2026

Nine items from the original list, all verified by assertion suites (47 + 82 + 148 + 60) and none of
them yet pushed.

| # | Item | Outcome |
|---|---|---|
| 1 | PII never blocked publishing | One shared gate; `high`-severity PII blocks, fixture emails do not |
| 2 | Publish-from-chat skipped the gate | Both paths call `evaluatePublishGate`; chat takes no override |
| 3 | Models stale | GPT-5.6 Terra/Luna, Sonnet 5, Gemini 3.6 — newer *and* cheaper |
| 4 | `deleteManagedProject` dead | Wired as `POST /api/cloud/remove` with four guardrails |
| 5 | Synthetic Cloud health | Measured from the instance; RAM/CPU now honestly absent |
| 6 | "3 subagents in parallel" | Relabelled to what it is; behaviour unchanged |
| 7 | Connectors 52 vs ~80 | 83, plus three registry↔panel mismatches fixed |
| — | `<file_update>` XML mismatch | Server understands the format it asked models for |
| — | Orchestrator unreachable | Risk-gated auto-route, 5-credit cap, kill switch |

Six *additional* pre-existing defects surfaced while verifying that work, and were fixed: a
`ReferenceError` in the auto-fix escalation path (`export { X } from` creates no local binding), three
connector registry/panel mismatches, and schemeless base URLs for Snowflake and Salesforce.

## 8. What remains

**Blocking everything else — nothing above is live.** Four ship scripts are written and unrun:
`ship-xmlfix.ps1` → `ship-gapclose.ps1` → `ship-connectors-models.ps1` → `ship-truthfulness.ps1`.
Until those run, this section and §7 describe the repo, not the product.

### Closed since this list was written

| # | Item | How |
|---|---|---|
| 2 | Agentic deep scan | `lib/security/deep-scan.ts` + `/api/security/deep-scan`. Five weakness classes, batched and reviewed concurrently, quoted before it spends, triaged not blocking |
| 3 | Real parallel subagents | `lib/ai/subagents-parallel.ts`. Three concurrent fast-tier read-only calls, ~a fraction of a cent, falls back to the keyword scan on failure |
| 8 | Auto-revoke leaked keys | `/api/security/leaked-key`. GitHub partner callback, signature verified over the raw body, fails closed |
| 10 | Code-download restriction | `lib/project/download-policy.ts`, enforced in the export route. Flag lives on the owner, not the caller |
| 13 | Hosting region | `/api/cloud/region`. The column existed and was read since migration 048; nothing wrote it |
| 16 | Live CVE feed | `lib/security/cve-feed.ts` via OSV.dev, per-advisory suppression with a required reason. Static audit kept alongside |
| 7 | Publish audience | `lib/project/publish-audience.ts` + settings route + `/api/embed/access` enforcement. Four modes, groups/users/external emails, fails closed |

Two schema bugs were caught during that work, both code written against an assumed schema rather
than the real one: `health_findings` rows with non-existent columns and a severity vocabulary that
would have failed its CHECK constraint, and a key "revocation" that set a timestamp but not the
`is_active` flag that actually gates validity — so `validateApiKey` would have kept accepting the
leaked key.

### Still open

1. **Prove the orchestrator auto-route on a live project.** Verified by 82 assertions, never run
   end-to-end. The handoff crosses the browser, so only a real multi-part prompt on lifemarkai.com
   settles it. Blocked on the push.
2. **Finish the desktop app** — tabs, find-in-page, local MCP servers, permission prompts. The
   Electron shell, builder config and mac/win/linux scripts already exist; it is a wrapper, not a
   product.
3. **Run `setup-mobile.ps1`** so the mobile shell is buildable. Prepared as one command; needs
   Xcode/Android SDK, so it cannot be run from here.
4. **In-place Vite → TanStack Start upgrade** for existing projects (Lovable, 28 July). We set
   framework at creation only.
*(#7 publish audience control is now done — see §7. It turned out the three existing tiers were
never enforced at all: the panel PATCHed a field no route handled, so every published app was
served publicly whatever the owner chose.)*
6. **IdP-initiated SSO.** Our own UI documents it as unsupported; Lovable shipped it 10 July.
7. **Workspace identity reuse** — built apps recognising the signed-in platform user with no login
   page.
8. **Private npm registry** for internal packages.
9. **Interface i18n breadth** — 7 languages but only ~11 string keys, so menus and settings only.
10. **Project monitoring over real visitor errors.** Ours scans code and self-verify output; Lovable
    reviews errors from the published site, which needs live telemetry we do not collect.

### Not engineering

17. **SOC 2 Type I, then AIUC-1.** Lovable holds AIUC-1 and ships third-party pen-test reports on all
    plans. Our `docs/compliance/soc2-evidence-starter.md` states in its own header that it is *not* a
    certification. For enterprise procurement this is the widest remaining gap and no amount of code
    closes it.

### Open product questions, not defects

- **`AI_COST_MODE=economy` as the default.** Kept deliberately. It is the single biggest lever on
  perceived output quality, and the trade is real: a user on defaults is served by cheaper models than
  a Lovable user on defaults. Worth deciding on purpose rather than by inertia.
- **No head-to-head output comparison exists.** Twenty identical prompts through both products,
  graded. Everything in this document measures shipped surface; that would measure the thing users
  actually feel, and it is the most useful next piece of work in the whole list.

---

## Sources

- [Lovable changelog](https://docs.lovable.dev/changelog) — read in full, 24 Apr – 29 Jul 2026
- [Your Lovable app now works inside ChatGPT and Claude](https://lovable.dev/blog/agent-integrations)
- [$100M ARR & Lovable Agent](https://lovable.dev/blog/agent)
- [Lovable MCP](https://lovable.dev/mcp)
- [Lovable MCP server docs](https://docs.lovable.dev/integrations/lovable-mcp-server)
- [Lovable 2.0](https://lovable.dev/blog/lovable-2-0)
