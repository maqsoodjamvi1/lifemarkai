# SOC 2 Evidence Starter — LifemarkAI

> Purpose: give the team a running start on SOC 2 (Type I → Type II) by mapping the
> Trust Services Criteria to controls LifemarkAI **already has in code**, flagging what
> is missing, and listing the evidence an auditor (via Vanta/Drata) will ask for. This is
> not a certification — it's the pre-work so evidence collection can begin now while the
> product keeps shipping. SOC 2 is operational and time-bound (Type II needs 3–12 months
> of observed control operation), so the certificate is the slow part, not the code.

## How to use this

1. Pick a compliance automation platform (Vanta or Drata) and connect it to the cloud
   account, Supabase, GitHub, and the identity provider.
2. For each criterion below, attach the evidence noted in the "Evidence" column.
3. Close the "Gap" items in priority order — most are configuration or a short PR, not
   a rebuild.
4. Book a Type I audit once the gaps are closed; run Type II over the following months.

## Control mapping (Trust Services Criteria → LifemarkAI)

| TSC | Control area | In place today | Gap to close | Evidence to collect |
|-----|--------------|----------------|--------------|---------------------|
| CC6.1 | Logical access — auth | Supabase Auth (email, Google, GitHub OAuth); SSO/SCIM pages scaffolded | Finish SSO (OIDC/SAML) against a real IdP; enforce SCIM deprovisioning | IdP config export; screenshot of enforced SSO; deprovisioning test log |
| CC6.1 | Row-level security | RLS enabled on `projects`, `project_files`, `audit_logs`, `health_findings`, etc. | Periodic RLS policy review checklist | Migration files; RLS policy export from Supabase |
| CC6.2 | Secrets handling | Env vars encrypted at rest; secrets kept server-side; connector gateway injects auth server-side | Central secret rotation policy + schedule | Secret-manager config; rotation log |
| CC6.6 | Sensitive-data / PII scanning | `lib/security/scan.ts` (secret/risky/PII); Security Center UI; **nightly scheduled scan** (`/api/security/scheduled-scan` → `health_findings`) | Track finding remediation SLAs | Scan history in `health_findings`; remediation tickets |
| CC7.1 | Change detection / vuln mgmt | Vendor webhook (`/api/security/scan/webhook`) for Aikido/Wiz; `npm audit` guidance | Enforce dependency-audit gate in CI | CI run logs; dependency audit reports |
| CC7.2 | Monitoring / logging | **Immutable append-only audit log** (`audit_logs` + migration 077 trigger; 90-day retention purge); audit dashboard with category filters | Wire `logAuditEvent()` into every sensitive route; SIEM export | Audit-log samples; append-only trigger proof; SIEM feed config |
| CC7.3 | Incident response | — | Documented IR runbook + on-call + severity levels | IR policy doc; postmortem template; drill records |
| CC8.1 | Change management | GitHub PRs; deploy via Coolify | Require PR review + protected `master`; record approvals | Branch-protection settings; PR approval history |
| A1.2 | Availability / backups | Lifemark Cloud daily backups cron; restore route with dry-run diff | Documented RTO/RPO + periodic restore test | Backup cron logs; restore-test evidence |
| C1.1 | Confidentiality | Per-project isolation; managed Supabase per app | Data-classification policy | Policy doc; architecture diagram |
| P (GDPR) | Privacy / data subject rights | — | DPA template; data-deletion + export flow; sub-processor list | DPA; deletion request runbook; sub-processor register |

## Immediate, low-effort wins (do these first)

The immutable audit log (migration 077) and the nightly security scan are now in code; the
highest-leverage remaining work is mostly configuration and policy, not engineering:

- **Turn on branch protection** for `master` (require review + status checks) and capture the
  setting — this alone satisfies a chunk of CC8.1.
- **Enforce SSO** end-to-end against Okta or Entra in staging, then production. This is
  environment-coupled: it needs hands-on testing against a real IdP, not blind code, which is
  why it isn't shipped yet.
- **Wire `logAuditEvent()`** (`lib/audit/log.ts`) into the sensitive routes (auth, member
  invite/remove, billing changes, project delete, config/env changes) so the audit trail is
  complete — the store is immutable, but it only proves what actually gets written to it.
- **Write the short policy set** an auditor expects: information security policy, incident
  response, access control, change management, backup/DR, vendor management. Templates from
  Vanta/Drata are fine as a starting point.

## What is explicitly *not* done

Formal certification (SOC 2 Type II, ISO 27001, a signed GDPR DPA) is an operational process
measured over months by an external auditor. Start evidence collection now, but do not gate
product launches on the certificate — sequence it behind closing the gaps above.
