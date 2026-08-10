# Zod validation sweep — checklist

Improvement #5 follow-up. Every API route that reads a JSON body should
validate it with a zod schema (use `parseBody` from `@/lib/api/parse-body`
— returns typed data or a ready 400 Response with an issues list).

Pattern:
```ts
import { z } from "zod";
import { parseBody } from "@/lib/api/parse-body";

const parsed = await parseBody(request, z.object({ ... }));
if (parsed instanceof Response) return parsed;
```

## Done (4)

- [x] routes/api/public/app-data.$slug.ts (built validated)
- [x] routes/api/ai/enhance.ts
- [x] routes/api/ai/commit-message.ts
- [x] routes/api/v1/projects.ts (public API)

## Remaining (102)

When touching any of these routes for other reasons, convert them in the
same change. Prioritize public/unauthenticated endpoints first.

- [ ] routes/api/account/privacy.ts
- [ ] routes/api/ai/fix.ts
- [ ] routes/api/analytics/beacon.ts
- [ ] routes/api/billing/auto-topup.ts
- [ ] routes/api/billing/checkout.ts
- [ ] routes/api/billing/credits.ts
- [ ] routes/api/billing/redeem-promo.ts
- [ ] routes/api/billing/student-discount.ts
- [ ] routes/api/cloud/export.ts
- [ ] routes/api/cloud/jobs.ts
- [ ] routes/api/cloud/pause.ts
- [ ] routes/api/cloud/permissions.ts
- [ ] routes/api/cloud/provision.ts
- [ ] routes/api/cloud/region.ts
- [ ] routes/api/cloud/remove.ts
- [ ] routes/api/cloud/write.ts
- [ ] routes/api/components/21st.ts
- [ ] routes/api/debug-log.ts
- [ ] routes/api/deploy/rollback.ts
- [ ] routes/api/domains.ts
- [ ] routes/api/domains/checkout.ts
- [ ] routes/api/domains/entri.ts
- [ ] routes/api/domains/purchase.ts
- [ ] routes/api/domains/search.ts
- [ ] routes/api/domains/verify.ts
- [ ] routes/api/email-domain.ts
- [ ] routes/api/embed/checkout.ts
- [ ] routes/api/embed/comments.ts
- [ ] routes/api/embed/error.ts
- [ ] routes/api/figma.ts
- [ ] routes/api/github/import.ts
- [ ] routes/api/github/sync.ts
- [ ] routes/api/gitlab/commits.ts
- [ ] routes/api/gitlab/sync.ts
- [ ] routes/api/integrations/openai/build.ts
- [ ] routes/api/integrations/supabase.ts
- [ ] routes/api/keys.ts
- [ ] routes/api/mcp/servers.ts
- [ ] routes/api/member-groups.ts
- [ ] routes/api/notifications.ts
- [ ] routes/api/preview/token.ts
- [ ] routes/api/projects.ts
- [ ] routes/api/projects/$id.ts
- [ ] routes/api/projects/$id/activity.ts
- [ ] routes/api/projects/$id/app-auth.ts
- [ ] routes/api/projects/$id/app-errors.ts
- [ ] routes/api/projects/$id/chat-state.ts
- [ ] routes/api/projects/$id/comments.ts
- [ ] routes/api/projects/$id/comments/$commentId.ts
- [ ] routes/api/projects/$id/db-query.ts
- [ ] routes/api/projects/$id/design-system.ts
- [ ] routes/api/projects/$id/edge-functions.ts
- [ ] routes/api/projects/$id/env.ts
- [ ] routes/api/projects/$id/feature-flags.ts
- [ ] routes/api/projects/$id/feature-flags/$flagId.ts
- [ ] routes/api/projects/$id/feedback.ts
- [ ] routes/api/projects/$id/files.ts
- [ ] routes/api/projects/$id/group.ts
- [ ] routes/api/projects/$id/import-database.ts
- [ ] routes/api/projects/$id/import-files.ts
- [ ] routes/api/projects/$id/mcp.ts
- [ ] routes/api/projects/$id/messages.ts
- [ ] routes/api/projects/$id/messages/$messageId.ts
- [ ] routes/api/projects/$id/monetization.ts
- [ ] routes/api/projects/$id/monitoring.ts
- [ ] routes/api/projects/$id/persona.ts
- [ ] routes/api/projects/$id/preview-telemetry.ts
- [ ] routes/api/projects/$id/preview.ts
- [ ] routes/api/projects/$id/publish-audience.ts
- [ ] routes/api/projects/$id/publish-template.ts
- [ ] routes/api/projects/$id/remix.ts
- [ ] routes/api/projects/$id/revisions.ts
- [ ] routes/api/projects/$id/secrets.ts
- [ ] routes/api/projects/$id/secrets/$secretId.ts
- [ ] routes/api/projects/$id/slug.ts
- [ ] routes/api/projects/$id/views.ts
- [ ] routes/api/projects/db-backup.ts
- [ ] routes/api/projects/groups.ts
- [ ] routes/api/projects/groups/$groupId.ts
- [ ] routes/api/projects/invite.ts
- [ ] routes/api/projects/invite/link.ts
- [ ] routes/api/projects/snapshots.ts
- [ ] routes/api/projects/snapshots/restore.ts
- [ ] routes/api/referral/redeem.ts
- [ ] routes/api/scim/v2/Users.ts
- [ ] routes/api/scim/v2/Users/$id.ts
- [ ] routes/api/scrape.ts
- [ ] routes/api/security/deep-scan.ts
- [ ] routes/api/security/scan.ts
- [ ] routes/api/skills.ts
- [ ] routes/api/snippets.ts
- [ ] routes/api/snippets/$id.ts
- [ ] routes/api/teams.ts
- [ ] routes/api/teams/$id.ts
- [ ] routes/api/teams/$id/branding.ts
- [ ] routes/api/teams/$id/credit-pool.ts
- [ ] routes/api/teams/$id/credits.ts
- [ ] routes/api/teams/$id/member-caps.ts
- [ ] routes/api/teams/$id/members.ts
- [ ] routes/api/teams/transfer.ts
- [ ] routes/api/workspace/branded-urls.ts
- [ ] routes/api/workspace/identity.ts
