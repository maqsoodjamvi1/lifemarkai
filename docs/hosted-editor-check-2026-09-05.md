# Hosted editor check — 2026-09-05

Authenticated access to Coolify and LifemarkAI was verified through the browser.

- Coolify maps lifemarkai.com to application `xobhd11ru7awbf97c3z6r4oh`, labelled
  `lifemarkai:codex/security-hardening-ca6xbeo3mrtgejkjqhaetdk7`.
  It reports Running (no healthcheck). A second master-labelled application also
  reports Running. These labels do not establish the exact deployed commit.
- Opening the existing wholesale inventory ERP editor first reported
  “Container is not running.” A later observation reported “Starting your app.”
  A rendered preview and successful recovery were not confirmed.
- Runtime logs show repeated rejection of `openai/gpt-5.6-luna` followed by
  successful fallback calls to `deepseek/deepseek-v4-flash` across agent steps.
  This adds an unnecessary rejected request on each step.
- The logs report an OpenRouter balance of $0.38 and an application pause
  threshold of $0.25. This is a log observation, not a fresh balance query.

Local follow-up: added a bounded five-minute rejected-model cache so subsequent
calls use the existing fallback until the rejection expires. Partially streamed
responses now fail without replay through invalid-model or free-capacity fallback.
Two cache tests pass. No production configuration, deployment, balance, or saved
project source was changed during this check. Hosted recovery and deployment of
the accumulated local fixes remain outstanding.

## Existing-project preview smoke test

Follow-up tested the actual Preview pane, rather than relying on the chat status.
The ERP project rendered successfully in `static-preview-panel`; its dashboard,
KPI cards, navigation, and orders were present, and a screenshot confirmed styling.
This corrects the earlier unconfirmed ERP preview outcome above. It does not
establish that the server sandbox recovered, because the rendered frame was static.

| Existing project | Dashboard framework | Observed result |
| --- | --- | --- |
| Wholesale inventory ERP (`a150c161-49a2-4fa5-afb1-0878b577a9ab`) | static | Rendered dashboard; visually confirmed |
| Retail POS (`43a14e3e-861c-4dae-a3f1-b9f63487fac8`) | react | Installing dependencies, then Starting your app; normal Refresh tested |
| Rye and Salt bakery (`de3cbbb4-aa25-47ef-9ca9-086c163ca1ab`) | tanstack-start | Starting live preview, then Syncing changed files; no rendered app observed |
| Yoga studio booking (`a0f1c6b9-fa70-45c1-8cc2-a6c5f93c07bb`) | static | Starting live preview; no rendered app observed |

This is a four-project sample, not a test of all 44 projects or a timed performance
benchmark. Several previews were open concurrently. No prompts, AI generation,
code edits, restores, or publish actions were submitted. The three startup-only
results are unconfirmed renders during the observation window, not a claim that
the underlying projects can never render. Browser logs for POS and bakery showed
a Realtime REST-fallback warning, which does not by itself explain startup delay.

## Infrastructure follow-up

The bakery subsequently rendered without project source edits. Its iframe ID
was `static-preview-panel`, but its actual source was the hosted HTTPS URL
`https://de3cbbb4aa2547ef9ca9086c163ca1ab.preview.lifemarkai.com/`.
Therefore the iframe ID alone must not be used to identify a fallback engine.
Earlier engine-specific conclusions based only on that ID are unproven.

Read-only checks from the production app terminal found 27% disk usage (71 GB
available) and load averages 0.54/0.44/0.38. The configured backend is Docker
over DOCKER_HOST, not the absent local Docker socket. The backend responded.
Container labels mapped bakery to a running container (up about 14 minutes);
yoga, POS, and ERP containers were Exited (143), about three hours earlier.
This later snapshot does not establish their state during the original smoke
test. Exit 143 indicates termination consistent with SIGTERM; it does not identify
the caller or prove a crash. No container was manually restarted or changed.
The reason for termination and the earlier startup delay remains unverified.

## Recovery update

Local sync recovery now recognizes Docker's stopped/paused-container errors and
retries after reconnect even when Docker returns the same container ID. Previously
that ID equality suppressed the retry for an in-place resume. Recovery also stops
if the user has switched projects while the request was pending. Nine focused
recovery and serialized-sync tests passed. These changes do not establish why the
containers were stopped, and require deployment and a hosted stop/resume test
before claiming the production issue is resolved.

Coolify host cleanup update: the setup script now applies the 48-hour retention
window to time spent stopped, instead of creation age. Active previews are no
longer age-evicted and recently resumed dependency caches survive. Retention and
disk-guard removal use non-force Docker removal so concurrent resumes win.
The generated GC script passed a mocked-Docker behavioral test preserving active
and recently stopped containers while removing an old stopped container. Bash
syntax validation passed. This is a local installer change; the installed host
GC has not been updated or verified to match it.

Additional safeguards: running-container idle age is floored by StartedAt so a
resume cannot inherit an already-expired heartbeat. Failed or malformed heartbeat
reads skip cleanup instead of falling back to creation age. The mocked Docker
test covers active, recently stopped, resumed, unreadable-heartbeat, truly idle,
and stale-stopped cases; all 10 focused cleanup/recovery/sync tests pass.
Client heartbeats now allow only one request at a time, abort after 12 seconds,
cancel on cleanup, and ignore results for an older project or sandbox.
