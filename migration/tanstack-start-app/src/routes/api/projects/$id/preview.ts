// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { canWriteProjectFiles, getProjectAccess } from "@/lib/project/access";

/**
 * Native /api/projects/:id/preview — accept a base64 screenshot from the build
 * capture, upload to the `previews` STORAGE bucket (migration 032 / 159 — not a
 * Postgres table), then update projects.preview_url.
 */
export const Route = createFileRoute("/api/projects/$id/preview")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const projectId = params.id;

        const supabase = await createClient();
        const { user } = await getServerUser(supabase);
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const { dataUrl } = await request.json();
        if (!dataUrl || typeof dataUrl !== "string") {
          return Response.json({ error: "dataUrl required" }, { status: 400 });
        }

        const access = await getProjectAccess(supabase, projectId, user.id);
        if (!canWriteProjectFiles(access)) return Response.json({ error: "Project not found" }, { status: 404 });

        let base64: string;
        let mimeType = "image/jpeg";
        if (dataUrl.startsWith("data:")) {
          const [header, data] = dataUrl.split(",");
          base64 = data;
          const mimeMatch = header.match(/data:([^;]+);/);
          if (mimeMatch) mimeType = mimeMatch[1];
        } else {
          base64 = dataUrl;
        }

        const buffer = Buffer.from(base64, "base64");
        const ext = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
        const storagePath = `projects/${user.id}/${projectId}.${ext}`;

        const admin = createAdminClient();
        const { error: uploadError } = await (admin as any)
          .storage
          .from("previews")
          .upload(storagePath, buffer, { contentType: mimeType, upsert: true });

        if (uploadError) {
          console.warn("Preview storage upload failed, falling back to data URL:", uploadError.message);
          await (supabase as any).from("projects").update({ preview_url: dataUrl }).eq("id", projectId);
          return Response.json({ preview_url: dataUrl, storage: false });
        }

        const { data: { publicUrl } } = (admin as any).storage.from("previews").getPublicUrl(storagePath);

        await (supabase as any).from("projects").update({ preview_url: publicUrl }).eq("id", projectId);

        return Response.json({ preview_url: publicUrl, storage: true });
      },
    },
  },
});
