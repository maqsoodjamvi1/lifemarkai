# Lovable Gap-Closure Plan — Ecosystem · Enterprise · Distribution · Cloud Ops

> The four areas where Lovable is clearly ahead, turned into concrete steps grounded in what
> LifemarkAI already has. Effort is T-shirt (S ≈ days, M ≈ 1–2 wks, L ≈ multi-week/quarter).
> Some items (SOC 2, app-store apps) are **time + process**, not a one-sprint build — sequenced last.

---

## 1. Ecosystem — ~15 → ~50 managed-OAuth connectors  (M, ongoing)

**Have:** connector gateway (`lib/integrations/connector-registry.ts`, ~15 connectors) that injects
auth server-side and forwards to each connector's host. Architecture is done — this is *breadth*, not
new plumbing.

**Do (batch the 10 users actually ask for first):**
1. Slack, Notion, HubSpot, Google Workspace, Microsoft 365, Airtable, Salesforce, one data warehouse
   (BigQuery/Snowflake), Twilio, Resend.
2. Per connector: registry entry (base URL, auth type) + a managed-OAuth flow (store token in the
   project's `.env.local`, refresh handled by the gateway).
3. Teach the build AI to route generated-app calls through the connector proxy (the system-prompt
   block already exists — extend the connector list).

**Metric:** +10 connectors near-term; measure by "requests that ask for a connector we support."

---

## 2. Enterprise — SSO/SCIM · audit log · Security Center · SOC 2 / ISO  (M → L)

**Have (beachhead):** SSO/SCIM pages, `audit_log` (migration 008) + audit-logs dashboard page,
`lib/security/scan.ts` (secret/PII/risky-code scanner) + `/security-scan` route.

**Do, in order:**
1. **Finish SSO (OIDC/SAML) end-to-end** — wire against a real IdP (Okta/Entra) in staging; this is
   environment-coupled, so it needs hands-on testing, not blind code.
2. **Immutable workspace audit log** — ensure append-only + surface member/project/auth/config events
   in the dashboard with filters (extend the existing page).
3. **Security Center UI** — surface `scanProject()` findings per project + workspace roll-up; add
   **scheduled scans** (cron) writing to a `security_findings` table; approval-gated auto-fix.
4. **Compliance (long tail, L):** SOC 2 Type I → Type II via an auditor + Vanta/Drata (6–12 mo
   process), then ISO 27001, GDPR DPA. Start collecting evidence now; don't gate product on it.

**Reality:** the certs are the moat *and* the slowest part — they're operational, not a feature.

---

## 3. Distribution — desktop · mobile · public API · MCP · analytics · SEO · email · registrar  (M each, parallel)

**Have:** Electron + Capacitor scaffolding (desktop/mobile), Resend email, a registrar abstraction
(WIP), build-time SEO meta.

**Do (rank by leverage):**
1. **Public API + MCP server** — expose the existing build/agent/project routes as a documented,
   token-authed API, and wrap it as an MCP server so agents/tools can build on LifemarkAI. Highest
   leverage: turns you from an *app* into a *platform* other tools integrate with.
2. **Finish + ship desktop app** (Electron build already scaffolded) — tabs, local-tool access.
3. **Mobile app** (Capacitor) — build/prompt/review from phone; app-store submission is the slow part.
4. **Project analytics** — pageviews/visitors for deployed apps (a lightweight events table + panel).
5. **SEO review + sitemap** generation for built apps (you already emit meta; add the review + sitemap).
6. **Custom branded email** (Resend domain + SPF/DKIM/DMARC helper) and **domain registrar** (finish the
   abstraction) for the "buy + connect a domain in-product" flow.

---

## 4. Cloud ops polish — regions · jobs UI · DB health · backups/restore  (M)

**Have:** Lifemark Cloud (managed Supabase per app via the Management API), daily backups cron.

**Do (mostly UI + Management-API calls over existing infra):**
1. **Region selection at provision** (Americas/EU/APAC) — pass region to `createManagedProject`; lock
   after creation (matches Lovable's model).
2. **Jobs/cron UI** — list/enable/disable `pg_cron` jobs with schedule + last-run + history.
3. **DB health check** — an on-demand command (connections, memory, disk, uptime) surfaced in the
   Cloud panel; plus slowest-query listing over `pg_stat_statements` with an "optimize" action.
4. **Backups/restore UI** — browse the daily backups you already take; restore with a dry-run schema
   diff first (the restore route exists — add the browse/restore panel + retention display).
5. **Instance-upgrade alerts** when disk/IO/CPU cross thresholds.

---

## Suggested sequence (after the current bundle ships)

1. **Ship the pending bundle** (blank-preview + cost + routing) — gates everything; see `SHIP-CHECKLIST.md`.
2. **Connectors** (fastest ROI, pure breadth) + **finish SSO/audit** (unblocks team buyers) — parallel.
3. **Public API + MCP server** (platform leverage) → **desktop app** → **Cloud ops UI** (regions/jobs/backups).
4. **Analytics + SEO + email/registrar** (growth surfaces).
5. **Compliance certs** (SOC 2 → ISO) — start evidence collection now, complete over 2–3 quarters.

**Guardrail:** none of this is the moat. The moat stays *multi-model orchestration + own-infra +
Titan*. These close the table-stakes gap so serious/enterprise users can say yes — fund them, but
never let breadth work starve the differentiators or reliability.
