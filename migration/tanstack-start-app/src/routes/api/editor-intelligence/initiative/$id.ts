// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { canReadProjectFiles, getProjectAccess } from "@/lib/project/access";
import {
  loadEditorInitiativeEvents,
  loadEditorInitiativeRun,
} from "@/lib/ai/editor-lenses/persistence";

interface Params {
  params: Promise<{ id: string }>;
}

async function handleGET(_req: Request, params: any) {
  const { id } = params;
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const run = await loadEditorInitiativeRun(supabase, id);
  if (!run) return Response.json({ error: "Initiative run not found" }, { status: 404 });

  const access = await getProjectAccess(supabase, run.project_id, user.id);
  if (!canReadProjectFiles(access)) {
    return Response.json({ error: "Initiative run not found" }, { status: 404 });
  }

  const events = await loadEditorInitiativeEvents(supabase, id);
  return Response.json({ run, events });
}


export const Route = createFileRoute("/api/editor-intelligence/initiative/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => handleGET(request, params),
    },
  },
});
