import { randomUUID } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { getProjectAccess, canWriteProjectFiles } from "@/lib/project/access";
import { validateExternalUrl } from "@/lib/security/validate-external-url";
import type { WebhookEndpoint, WebhookEvent } from "@/lib/webhooks/dispatch";

/**
 * Native /api/projects/:id/webhooks — outgoing webhook endpoints (Beta).
 * Stored at projects.metadata.webhooks, same pattern as metadata.monitoring.
 * Actually fired by src/lib/webhooks/dispatch.ts from the deploy route and
 * the AI chat/agent build-completion paths.
 *
 * webhook-panel.tsx previously round-tripped through /api/projects/:id/env
 * (LIFEMARK_WEBHOOK_<id>_JSON), a route that masks GET values as "***" and
 * has no bulk PATCH handler — so nothing the panel saved ever actually
 * persisted or fired. This route replaces that dead path.
 *
 * Every url a caller supplies here is fetched server-side on every matching
 * deploy/build/AI event (fireProjectWebhookEvent) — validated via
 * validateExternalUrl (SSRF guard: blocks private/internal/cloud-metadata
 * targets) before being saved, and re-validated again immediately before
 * each actual delivery in dispatch.ts itself (DNS-rebinding guard).
 */

const ALL_EVENTS: WebhookEvent[] = ["deploy_success", "deploy_failed", "build_complete", "ai_generation"];

async function loadWebhooks(supabase: Awaited<ReturnType<typeof createClient>>, projectId: string) {
  const { data: project } = await supabase.from("projects").select("metadata").eq("id", projectId).single();
  const meta = (project?.metadata ?? {}) as Record<string, unknown>;
  const webhooks = Array.isArray(meta.webhooks) ? (meta.webhooks as WebhookEndpoint[]) : [];
  return { meta, webhooks };
}

export const Route = createFileRoute("/api/projects/$id/webhooks")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const projectId = params.id;
        const supabase = await createClient();
        const { user } = await getServerUser(supabase);
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const access = await getProjectAccess(supabase, projectId, user.id);
        if (!canWriteProjectFiles(access)) return Response.json({ error: "Project not found" }, { status: 404 });

        const { webhooks } = await loadWebhooks(supabase, projectId);
        return Response.json({ webhooks });
      },

      POST: async ({ request, params }) => {
        const projectId = params.id;
        const supabase = await createClient();
        const { user } = await getServerUser(supabase);
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const access = await getProjectAccess(supabase, projectId, user.id);
        if (!canWriteProjectFiles(access)) return Response.json({ error: "Project not found" }, { status: 404 });

        const body = (await request.json().catch(() => ({}))) as { url?: string; events?: string[]; secret?: string };
        const rawUrl = (body.url ?? "").trim();
        if (!rawUrl) return Response.json({ error: "url is required" }, { status: 400 });
        // This URL is fetched server-side on every matching deploy/build/AI
        // event (fireProjectWebhookEvent), unauthenticated by the caller who
        // registered it — validate it can't target an internal/private
        // address (cloud metadata endpoints included) before saving it.
        const validated = await validateExternalUrl(rawUrl);
        if ("error" in validated) return Response.json({ error: validated.error }, { status: 400 });
        const url = validated.url;
        const events = (Array.isArray(body.events) ? body.events : []).filter((e): e is WebhookEvent =>
          (ALL_EVENTS as string[]).includes(e),
        );
        if (events.length === 0) return Response.json({ error: "at least one event is required" }, { status: 400 });

        const { meta, webhooks } = await loadWebhooks(supabase, projectId);
        const endpoint: WebhookEndpoint = {
          id: randomUUID(),
          url,
          secret: body.secret?.trim() || randomUUID().replace(/-/g, ""),
          events,
          enabled: true,
        };
        const next = [...webhooks, endpoint];
        await supabase.from("projects").update({ metadata: { ...meta, webhooks: next } as unknown as import("@/types/database").Json }).eq("id", projectId);
        return Response.json({ ok: true, webhook: endpoint });
      },

      PATCH: async ({ request, params }) => {
        const projectId = params.id;
        const supabase = await createClient();
        const { user } = await getServerUser(supabase);
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const access = await getProjectAccess(supabase, projectId, user.id);
        if (!canWriteProjectFiles(access)) return Response.json({ error: "Project not found" }, { status: 404 });

        const body = (await request.json().catch(() => ({}))) as { webhook?: Partial<WebhookEndpoint> & { id: string } };
        const update = body.webhook;
        if (!update?.id) return Response.json({ error: "webhook.id is required" }, { status: 400 });
        if (typeof update.url === "string") {
          const validated = await validateExternalUrl(update.url.trim());
          if ("error" in validated) return Response.json({ error: validated.error }, { status: 400 });
          update.url = validated.url;
        }

        const { meta, webhooks } = await loadWebhooks(supabase, projectId);
        if (!webhooks.some((w) => w.id === update.id)) {
          return Response.json({ error: "Webhook not found" }, { status: 404 });
        }
        const next = webhooks.map((w) => (w.id === update.id ? { ...w, ...update } : w));
        await supabase.from("projects").update({ metadata: { ...meta, webhooks: next } as unknown as import("@/types/database").Json }).eq("id", projectId);
        return Response.json({ ok: true });
      },

      DELETE: async ({ request, params }) => {
        const projectId = params.id;
        const supabase = await createClient();
        const { user } = await getServerUser(supabase);
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const access = await getProjectAccess(supabase, projectId, user.id);
        if (!canWriteProjectFiles(access)) return Response.json({ error: "Project not found" }, { status: 404 });

        let id: string | undefined;
        try {
          const body = (await request.json()) as { id?: string };
          id = body.id;
        } catch {
          id = new URL(request.url).searchParams.get("id") ?? undefined;
        }
        if (!id) return Response.json({ error: "id is required" }, { status: 400 });

        const { meta, webhooks } = await loadWebhooks(supabase, projectId);
        const next = webhooks.filter((w) => w.id !== id);
        await supabase.from("projects").update({ metadata: { ...meta, webhooks: next } as unknown as import("@/types/database").Json }).eq("id", projectId);
        return Response.json({ ok: true });
      },
    },
  },
});
