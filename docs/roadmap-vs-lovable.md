# LifemarkAI — Sequenced Roadmap to Close the Lovable Gap (June 2026)

> Turns the priorities in `docs/lovable-comparison.md` into a sequenced plan. Effort is T-shirt
> (S ≈ days, M ≈ 1–2 weeks, L ≈ multi-week). Impact is on winning/keeping real users. Sequencing
> respects dependencies, not just impact — reliability gates everything.

## Scoring

| # | Initiative | Effort | Impact | Why this order |
|---|-----------|--------|--------|----------------|
| 1 | **Preview/build reliability** (ship + test the esbuild engine, kill the whack-a-mole transpiler bugs) | M | **Critical** | Precondition for everything. A founder who can't get a first build won't see any other feature. |
| 2 | **Make multi-model visible + marketed** (Auto/Smart surfacing ✓, docs, landing copy) | S | High | The wedge is already built; cost is mostly exposure + messaging. Cheapest high-impact win. |
| 3 | **In-app AI connector** (no-keys chat/image/embeddings/STT/TTS through the project AI proxy) | M | High | Direct parity with Lovable's strongest "build AI apps" feature; the first multimodal proxy contract is live in `/api/projects/:id/ai-proxy`. See `docs/in-app-ai-connector-design.md`. |
| 4 | **Enterprise beachhead** (SSO + workspace audit log + basic security/PII scan) | M→L | High (B2B) | Unblocks team buyers you currently lose outright. Full SOC 2/ISO is later; start with the 20% that removes the hard "no". |
| 5 | **Connector breadth** (the 8–10 users actually ask for, managed auth) | M (ongoing) | Medium–High | Ecosystem is a moat for Lovable; close the most-requested subset rather than chasing all 50. |
| 6 | **Titan Company Console** (one polished, visible multi-agent demo) | M | High (story/funding) | The differentiated story competitors can't tell. Build one real slice, not the full roadmap. |

## Phasing

**Phase A — Earn the right to compete (now)**
- (1) Reliability: force-test the esbuild engine behind its flag, shadow-compare vs the fallback, then flip the default once green. Add a smoke suite over the 42 templates.
- (2) Multi-model visibility: ship the Auto/Smart row (done), add a short "model-flexible, no lock-in" section to marketing + docs, expose the selected model on each assistant message.
- *Exit criteria:* a non-technical user reliably gets a working first build; the multi-model story is discoverable.

**Phase B — Match the "build AI apps" promise (next)**
- (3) In-app AI connector: turnkey, no-keys, multi-modal, metered through the project AI proxy; auto-wired like the Supabase backend. Per-project AI usage view.
- (5, start) Connectors: Stripe ✓, then Slack, Notion, Google/Microsoft, HubSpot, one data warehouse — managed OAuth via the connector gateway.
- *Exit criteria:* "add a chatbot / image / search to my app" works without the user touching keys.

**Phase C — Open the enterprise + story doors (after B)**
- (4) Enterprise beachhead: SSO (OIDC/SAML), workspace audit logs, and a Security Center with project secret/risky-code/PII scans are the first slice; next make scans scheduled/persistent, add SIEM export, enforce policies, and sequence SOC 2 / ISO only once there's pull.
- (6) Titan Company Console: live agent statuses + plan tree + debate threads over the existing orchestrator — the flagship demo.
- *Exit criteria:* a team buyer can say yes; the AI-software-company narrative has a working artifact.

## Guardrails

- **Don't out-scope reliability.** Every phase ships behind a flag and is verified (smoke tests / shadow compare) before default-on — the preview bugs this session showed why.
- **Protect the moat while closing gaps.** Parity work (connectors, in-app AI, enterprise) is table-stakes; multi-model + own-stack + Titan are the reasons to choose LifemarkAI. Fund both, but never let parity work starve the differentiators.
- **Economics as a weapon.** Owning infra + routing to cheaper models where "good enough" is the margin story — instrument cost-per-build so it's provable, not just asserted.
