/**
 * Outgoing project webhooks — dispatcher.
 *
 * Endpoints are configured in webhook-panel.tsx and stored at
 * `projects.metadata.webhooks` (an array of WebhookEndpoint, mirroring the
 * existing `metadata.monitoring` pattern used by project monitoring). The
 * panel previously wrote/read `LIFEMARK_WEBHOOK_<ID>_JSON` project env vars
 * through `/api/projects/:id/env`, but that route only ever supported single
 * key GET (masked "***") / POST / DELETE — no bulk PATCH, no unmasked read —
 * so saved webhooks silently never persisted and nothing anywhere fired one.
 * This module plus `/api/projects/:id/webhooks` replace that dead path.
 *
 * `fireProjectWebhookEvent` is the only thing callers need: it loads the
 * endpoints for a project, filters to the ones subscribed to `event`, and
 * POSTs each with an HMAC-SHA256 signature over the JSON body (matching the
 * `X-Lifemark-Signature: sha256=...` header the panel's own "test fire"
 * button and payload-schema footer already document). It is best-effort by
 * design — a webhook delivery failure must never fail the deploy/build/AI
 * turn that triggered it — so every call site fires it un-awaited or wrapped
 * in try/catch.
 *
 * SSRF guard: each endpoint's URL is re-validated via validateExternalUrl
 * (src/lib/security/validate-external-url.ts) immediately before every
 * delivery, not just once when it was saved — a hostname's DNS answer can
 * change between save time and delivery time ("DNS rebinding"), and this is
 * the point where the SERVER itself makes an outbound request to a URL an
 * authenticated project owner supplied. A stored endpoint that now resolves
 * to a private/internal address is never actually fetched.
 */
import { createHmac } from "node:crypto";
import { validateExternalUrl } from "@/lib/security/validate-external-url";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

export type WebhookEvent = "deploy_success" | "deploy_failed" | "build_complete" | "ai_generation";

export interface WebhookEndpoint {
  id: string;
  url: string;
  secret: string;
  events: WebhookEvent[];
  enabled?: boolean;
  label?: string;
  lastStatus?: "success" | "failed" | null;
  lastFiredAt?: string | null;
}

const DELIVERY_TIMEOUT_MS = 8000;

function sign(secret: string, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

/**
 * Fire `event` for `projectId` to every enabled, subscribed endpoint.
 * Never throws — logs and records lastStatus/lastFiredAt per-endpoint
 * best-effort. Safe to call without awaiting.
 */
export async function fireProjectWebhookEvent(
  supabase: SupabaseClient,
  projectId: string,
  event: WebhookEvent,
  data: Record<string, unknown> = {},
): Promise<void> {
  try {
    const { data: project } = await supabase
      .from("projects")
      .select("metadata")
      .eq("id", projectId)
      .single();
    const meta = (project?.metadata ?? {}) as { webhooks?: WebhookEndpoint[] };
    const endpoints = Array.isArray(meta.webhooks) ? meta.webhooks : [];
    const targets = endpoints.filter((ep) => ep.enabled !== false && ep.events?.includes(event));
    if (targets.length === 0) return;

    const payload = {
      event,
      project_id: projectId,
      fired_at: new Date().toISOString(),
      data,
    };
    const body = JSON.stringify(payload);

    const results = await Promise.all(
      targets.map(async (ep) => {
        try {
          // /api/projects/:id/webhooks validates this URL at save time, but
          // a hostname's DNS answer can change between then and now (an
          // attacker-controlled domain "rebinding" to a private address
          // after passing validation) — re-check right before every actual
          // delivery, not just once at save time.
          const revalidated = await validateExternalUrl(ep.url);
          if ("error" in revalidated) return { id: ep.id, ok: false };

          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
          const res = await fetch(revalidated.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Lifemark-Event": event,
              "X-Lifemark-Signature": sign(ep.secret, body),
            },
            body,
            signal: controller.signal,
          }).catch(() => null);
          clearTimeout(timer);
          return { id: ep.id, ok: res?.ok ?? false };
        } catch {
          return { id: ep.id, ok: false };
        }
      }),
    );

    const nowIso = new Date().toISOString();
    const nextWebhooks = endpoints.map((ep) => {
      const result = results.find((r) => r.id === ep.id);
      if (!result) return ep;
      return { ...ep, lastStatus: result.ok ? ("success" as const) : ("failed" as const), lastFiredAt: nowIso };
    });
    await supabase
      .from("projects")
      .update({ metadata: { ...meta, webhooks: nextWebhooks } })
      .eq("id", projectId);
  } catch {
    /* webhook delivery is best-effort and must never fail the caller's turn */
  }
}
