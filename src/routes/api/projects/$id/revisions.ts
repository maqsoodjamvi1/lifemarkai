import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";

type RpcClient = {
  from: (table: string) => any;
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string; message: string } | null }>;
};

/** Generation history and concurrency-safe source rollback. */
export const Route = createFileRoute("/api/projects/$id/revisions")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const supabase = await createClient();
        const { user } = await getServerUser(supabase);
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const db = supabase as unknown as RpcClient;
        const { data, error } = await db.from("project_revisions")
          .select("id,revision,run_id,created_by,created_at")
          .eq("project_id", params.id)
          .order("revision", { ascending: false })
          .limit(50);
        if (error) return Response.json({ error: error.message }, { status: 500 });
        const { data: project } = await db.from("projects")
          .select("generation_revision")
          .eq("id", params.id)
          .single();
        return Response.json({ revisions: data ?? [], currentRevision: project?.generation_revision ?? 0 });
      },
      POST: async ({ request, params }) => {
        const supabase = await createClient();
        const { user } = await getServerUser(supabase);
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
        let body: { revision?: number; expectedRevision?: number };
        try { body = await request.json() as typeof body; }
        catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
        if (!Number.isSafeInteger(body.revision) || !Number.isSafeInteger(body.expectedRevision)) {
          return Response.json({ error: "revision and expectedRevision are required integers" }, { status: 400 });
        }
        const db = supabase as unknown as RpcClient;
        const { data, error } = await db.rpc("rollback_generation_revision", {
          target_project_id: params.id,
          target_revision: body.revision,
          expected_revision: body.expectedRevision,
        });
        if (error) {
          const conflict = error.code === "40001" || /conflict/i.test(error.message);
          return Response.json(
            { error: conflict ? "Project changed before rollback. Refresh version history and retry." : error.message },
            { status: conflict ? 409 : 500 },
          );
        }
        return Response.json({ ok: true, revision: data });
      },
    },
  },
});
