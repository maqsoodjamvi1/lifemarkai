import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { denyUnlessProjectAccess } from "@/lib/project/access";
import { rateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { resolveStorageHttp, storageHeaders } from "@/lib/cloud/project-backend";
import { isSafeBucketName, isSafeObjectPath } from "@/lib/cloud/storage-path";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

async function loadProjectRow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
) {
  const { data: project } = await supabase
    .from("projects")
    .select("id, user_id, environment, cloud_enabled, cloud_project_ref")
    .eq("id", projectId)
    .single();
  if (!project) {
    return { project: null, error: Response.json({ error: "Project not found" }, { status: 404 }) };
  }
  return { project, error: null };
}

export const Route = createFileRoute("/api/projects/$id/storage")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const supabase = await createClient();
        const { user } = await getServerUser(supabase);
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const rl = await rateLimitAsync(`storage:${user.id}`, RATE_LIMITS.api);
        if (!rl.success) return Response.json({ error: "Rate limit exceeded" }, { status: 429 });

        const gate = await denyUnlessProjectAccess(supabase, params.id, user.id, "read");
        if ("error" in gate) return gate.error;
        const { project, error } = await loadProjectRow(supabase, params.id);
        if (error) return error;

        const target = await resolveStorageHttp(supabase, project);
        if (!target.ok) {
          return Response.json({ backend: "none", buckets: [], error: target.error });
        }

        const action = new URL(request.url).searchParams.get("action") ?? "buckets";
        const headers = storageHeaders(target.key);

        if (action === "buckets") {
          const res = await fetch(`${target.url}/storage/v1/bucket`, { headers });
          if (!res.ok) {
            const body = await res.text().catch(() => "");
            return Response.json({ error: `Storage ${res.status}: ${body.slice(0, 300)}` }, { status: 502 });
          }
          const buckets = await res.json();
          return Response.json({ backend: target.backend, buckets: Array.isArray(buckets) ? buckets : [] });
        }

        if (action === "list") {
          const bucket = new URL(request.url).searchParams.get("bucket") ?? "";
          const prefix = new URL(request.url).searchParams.get("prefix") ?? "";
          if (!isSafeBucketName(bucket)) {
            return Response.json({ error: "Invalid bucket" }, { status: 400 });
          }
          const prefixTrim = prefix.replace(/\/+$/, "");
          if (prefixTrim && !isSafeObjectPath(prefixTrim)) {
            return Response.json({ error: "Invalid prefix" }, { status: 400 });
          }
          const res = await fetch(`${target.url}/storage/v1/object/list/${bucket}`, {
            method: "POST",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify({ prefix, limit: 200, offset: 0 }),
          });
          if (!res.ok) {
            const body = await res.text().catch(() => "");
            return Response.json({ error: `Storage ${res.status}: ${body.slice(0, 300)}` }, { status: 502 });
          }
          const files = await res.json();
          return Response.json({ backend: target.backend, files: Array.isArray(files) ? files : [] });
        }

        return Response.json({ error: "Unknown action" }, { status: 400 });
      },

      POST: async ({ request, params }) => {
        const supabase = await createClient();
        const { user } = await getServerUser(supabase);
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const rl = await rateLimitAsync(`storage:${user.id}`, RATE_LIMITS.api);
        if (!rl.success) return Response.json({ error: "Rate limit exceeded" }, { status: 429 });

        const gate = await denyUnlessProjectAccess(supabase, params.id, user.id, "write");
        if ("error" in gate) return gate.error;
        const { project, error } = await loadProjectRow(supabase, params.id);
        if (error) return error;

        if (project.environment === "live") {
          return Response.json(
            { environment_locked: true, error: "Project is Live — switch to Test to change storage." },
            { status: 423 },
          );
        }

        const target = await resolveStorageHttp(supabase, project);
        if (!target.ok) {
          return Response.json({ error: target.error }, { status: 400 });
        }

        const body = await request.json().catch(() => ({})) as Record<string, unknown>;
        const action = String(body.action ?? "");
        const headers = storageHeaders(target.key);

        if (action === "create_bucket") {
          const name = String(body.name ?? "").trim();
          if (!isSafeBucketName(name)) {
            return Response.json({ error: "Invalid bucket name (lowercase letters, numbers, hyphens)." }, { status: 400 });
          }
          const res = await fetch(`${target.url}/storage/v1/bucket`, {
            method: "POST",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify({ id: name, name, public: Boolean(body.public) }),
          });
          if (!res.ok) {
            const text = await res.text().catch(() => "");
            return Response.json({ error: text.slice(0, 300) || "Could not create bucket" }, { status: 502 });
          }
          return Response.json({ ok: true });
        }

        const bucket = String(body.bucket ?? "");
        if (!isSafeBucketName(bucket)) {
          return Response.json({ error: "Invalid bucket" }, { status: 400 });
        }

        if (action === "upload") {
          const path = String(body.path ?? "");
          if (!isSafeObjectPath(path)) return Response.json({ error: "Invalid path" }, { status: 400 });
          const b64 = String(body.contentBase64 ?? "");
          const buf = Buffer.from(b64, "base64");
          if (buf.byteLength === 0 || buf.byteLength > MAX_UPLOAD_BYTES) {
            return Response.json({ error: "File empty or larger than 8 MB" }, { status: 400 });
          }
          const contentType = typeof body.contentType === "string" ? body.contentType : "application/octet-stream";
          const res = await fetch(`${target.url}/storage/v1/object/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`, {
            method: "POST",
            headers: {
              ...headers,
              "Content-Type": contentType,
              "x-upsert": "true",
            },
            body: buf,
          });
          if (!res.ok) {
            const text = await res.text().catch(() => "");
            return Response.json({ error: text.slice(0, 300) || "Upload failed" }, { status: 502 });
          }
          return Response.json({ ok: true });
        }

        if (action === "delete") {
          const path = String(body.path ?? "");
          if (!isSafeObjectPath(path)) return Response.json({ error: "Invalid path" }, { status: 400 });
          const res = await fetch(`${target.url}/storage/v1/object/${bucket}`, {
            method: "DELETE",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify({ prefixes: [path] }),
          });
          if (!res.ok) {
            const text = await res.text().catch(() => "");
            return Response.json({ error: text.slice(0, 300) || "Delete failed" }, { status: 502 });
          }
          return Response.json({ ok: true });
        }

        if (action === "mkdir") {
          const path = String(body.path ?? "");
          if (!isSafeObjectPath(path)) return Response.json({ error: "Invalid path" }, { status: 400 });
          const res = await fetch(
            `${target.url}/storage/v1/object/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`,
            {
              method: "POST",
              headers: { ...headers, "Content-Type": "text/plain", "x-upsert": "true" },
              body: "",
            },
          );
          if (!res.ok) {
            const text = await res.text().catch(() => "");
            return Response.json({ error: text.slice(0, 300) || "Could not create folder" }, { status: 502 });
          }
          return Response.json({ ok: true });
        }

        if (action === "url") {
          const path = String(body.path ?? "");
          if (!isSafeObjectPath(path)) return Response.json({ error: "Invalid path" }, { status: 400 });
          if (body.public) {
            return Response.json({
              url: `${target.url}/storage/v1/object/public/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`,
            });
          }
          const res = await fetch(
            `${target.url}/storage/v1/object/sign/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`,
            {
              method: "POST",
              headers: { ...headers, "Content-Type": "application/json" },
              body: JSON.stringify({ expiresIn: 3600 }),
            },
          );
          if (!res.ok) {
            const text = await res.text().catch(() => "");
            return Response.json({ error: text.slice(0, 300) || "Could not sign URL" }, { status: 502 });
          }
          const data = (await res.json()) as { signedURL?: string; signedUrl?: string };
          const signed = data.signedURL || data.signedUrl;
          if (!signed) return Response.json({ error: "No signed URL" }, { status: 502 });
          const url = signed.startsWith("http") ? signed : `${target.url}${signed.startsWith("/") ? "" : "/"}${signed}`;
          return Response.json({ url });
        }

        return Response.json({ error: "Unknown action" }, { status: 400 });
      },
    },
  },
});
