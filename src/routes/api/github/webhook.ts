import { createFileRoute } from "@tanstack/react-router";
import { createAdminClient } from "@/lib/supabase/server";
import { pullAndStoreFiles } from "@/lib/server-fns/github";
import { findMatchingWebhookSecret } from "@/lib/github/webhook-signature";
import { logger } from "@/lib/logger";

/**
 * Native /api/github/webhook — the inbound half of GitHub sync.
 *
 * Before this route existed, GitHub never notified LifemarkAI of anything —
 * src/lib/server-fns/github.ts's "pull" action only ran when a user clicked
 * Pull in the editor, so a push made directly on GitHub (or by a teammate,
 * or by CI) sat unsynced until someone remembered to go pull it. This is
 * what makes sync actually bidirectional: src/lib/server-fns/github.ts's
 * ensureWebhookRegistered registers this URL against the repo (best-effort,
 * on repo create and on the first push after upgrading), and GitHub calls
 * it on every push.
 *
 * No user session exists here — this is called by GitHub, not a signed-in
 * browser — so it authenticates the OPPOSITE way every other route in this
 * app does: instead of trusting a session and looking up what it can touch,
 * it trusts nothing until the payload's HMAC signature verifies against the
 * specific project's own github_webhook_secret, then acts using that
 * project's owner's stored GitHub token via the admin (service-role)
 * client. A payload that doesn't verify against any matching project's
 * secret is not treated as an error — GitHub webhooks are not meant to
 * leak whether a repo/project match existed, and a real misconfiguration
 * shows up as this project's sync simply never running, which the user can
 * already see (no new commits reflected) and re-trigger with a manual Pull.
 */
export const Route = createFileRoute("/api/github/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();
        const signatureHeader = request.headers.get("x-hub-signature-256");
        const event = request.headers.get("x-github-event");
        const deliveryId = request.headers.get("x-github-delivery");

        // GitHub also sends a "ping" event when a webhook is first created —
        // acknowledge it so the hook doesn't show as failing in GitHub's UI,
        // but there's nothing to sync yet.
        if (event === "ping") return Response.json({ ok: true, ping: true });
        if (event !== "push") return Response.json({ ok: true, ignored: event ?? "unknown" });
        if (!signatureHeader?.startsWith("sha256=")) {
          return Response.json({ error: "Missing signature" }, { status: 400 });
        }

        let payload: {
          ref?: string;
          repository?: { full_name?: string };
          // A push that only deletes the ref (branch delete) has no
          // "after" commit worth pulling.
          deleted?: boolean;
        };
        try {
          payload = JSON.parse(rawBody);
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }

        const repoFullName = payload.repository?.full_name;
        const ref = payload.ref; // "refs/heads/<branch>"
        if (!repoFullName || !ref || payload.deleted) {
          return Response.json({ ok: true, ignored: "no-op payload" });
        }
        const pushedBranch = ref.replace(/^refs\/heads\//, "");

        const admin = createAdminClient();
        const { data: candidates } = await admin
          .from("projects")
          .select("id, user_id, github_repo, github_branch, github_webhook_secret")
          .eq("github_repo", repoFullName);

        const match = findMatchingWebhookSecret(
          (candidates ?? []) as unknown as { id: string; user_id: string; github_branch: string | null; github_webhook_secret?: string | null }[],
          rawBody,
          signatureHeader,
        );

        if (!match) {
          logger.info("github.webhook.no_match", { repo: repoFullName, deliveryId });
          return Response.json({ ok: true });
        }

        // Only sync the branch this project actually tracks — a push to some
        // other branch in the same repo (e.g. main, while this project syncs
        // a feature branch) isn't this project's concern.
        const trackedBranch = match.github_branch || "main";
        if (pushedBranch !== trackedBranch) {
          return Response.json({ ok: true, ignored: `branch ${pushedBranch} not tracked` });
        }

        const { data: profile } = await admin
          .from("profiles")
          .select("github_access_token")
          .eq("id", match.user_id)
          .single();
        const token = (profile as { github_access_token?: string | null } | null)?.github_access_token;
        if (!token) {
          logger.info("github.webhook.no_token", { projectId: match.id, deliveryId });
          return Response.json({ ok: true });
        }

        try {
          const { fileCount, failedPaths } = await pullAndStoreFiles(admin, match.id, token, repoFullName, trackedBranch);
          logger.info("github.webhook.pulled", { projectId: match.id, branch: trackedBranch, fileCount, failed: failedPaths.length, deliveryId });
        } catch (error) {
          logger.error("github.webhook.pull_failed", error instanceof Error ? error : new Error(String(error)), {
            projectId: match.id, branch: trackedBranch, deliveryId,
          });
          // Still 200 — GitHub retries failed deliveries (5xx) with backoff,
          // and this failure is already logged; a stuck webhook that GitHub
          // disables after repeated failures is worse than a rare missed
          // auto-sync the user can recover with a manual Pull.
        }

        return Response.json({ ok: true });
      },
    },
  },
});
