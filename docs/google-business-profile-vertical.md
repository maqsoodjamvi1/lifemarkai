# Google Business Profile vertical

## Decision

Ship Google Business Profile as LifeMarkAI's first local-business vertical integration, but keep it behind the proven generate → verify → preview → publish loop. Do not broaden the connector proxy's host policy.

The Business Profile API is federated across separate Google hosts. LifeMarkAI therefore exposes four fixed, allowlisted connector IDs that share one project-scoped OAuth access token:

| Connector ID | Purpose |
| --- | --- |
| `google_business_profile` | Accounts and access discovery |
| `google_business_information` | Locations, hours, categories, and profile data |
| `google_business_engagement` | Reviews, replies, posts, and media |
| `google_business_performance` | Profile performance metrics |

## Guardrails

- Only manage profiles owned by the customer or profiles the customer has explicitly authorized the agency to manage.
- Never accept an arbitrary upstream host from generated apps.
- Store the OAuth token server-side in the project's encrypted environment file.
- Enforce `GET` as the only upstream method in both the generated-app proxy and
  the agent connector runtime. A UI convention is not a security boundary.
- Start with a manually supplied short-lived access token. Do not advertise one-click OAuth until Google approves the project for Business Profile API access and refresh-token handling is implemented.
- Treat HTTP 401/403 as an expired or insufficient-scope connection, not as an app-generation failure.
- Treat HTTP 429 as a bounded connector failure and surface a retry time; do not start an AI repair loop.
- Log operation type, project, location resource name, status, and latency, but never token or review contents.

## First sellable workflow

Build one reusable local-business dashboard template with:

1. Account and location selection.
2. Current profile details and opening hours.
3. Reviews inbox with draft-and-approve replies.
4. A basic performance view for calls, directions, website clicks, and search impressions.
5. An audit trail showing who approved each external write.

Write actions require an explicit approval step. Read-only dashboards may refresh automatically.

The initial connector release is read-only. Review replies, profile edits, and
other external writes remain unavailable until approval, execution, and audit
are enforced and tested as one transaction boundary.

## Packaging hypothesis

- **Pilot:** US$49 setup plus US$19/month per location.
- **Agency:** US$99/month including five locations, then US$10/month per additional location.
- The customer's Google account remains the source of truth; LifeMarkAI sells the dashboard, workflow, and maintenance layer.

These are validation prices, not hard-coded billing plans. Test with five local businesses or two agencies before changing production pricing.

## Release gate

Do not market the package until all of the following are evidenced:

- the core-loop release check passes;
- a generated dashboard reaches a verified public URL;
- all four connector hosts are covered by registry tests;
- read operations succeed against an authorized test profile;
- review replies and profile edits require approval and produce an audit event;
- expired tokens and quota errors produce actionable UI states;
- the disconnect path removes the stored token.

## Next implementation slice

After Google grants API access, add a managed OAuth flow using the `business.manage` scope, encrypted refresh-token storage, token refresh, and revocation. Keep that work separate from the connector-registry PR.
