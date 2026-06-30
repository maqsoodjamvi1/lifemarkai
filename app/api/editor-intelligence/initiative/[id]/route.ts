import { NextRequest, NextResponse } from "next/server";
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

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const run = await loadEditorInitiativeRun(supabase, id);
  if (!run) return NextResponse.json({ error: "Initiative run not found" }, { status: 404 });

  const access = await getProjectAccess(supabase, run.project_id, user.id);
  if (!canReadProjectFiles(access)) {
    return NextResponse.json({ error: "Initiative run not found" }, { status: 404 });
  }

  const events = await loadEditorInitiativeEvents(supabase, id);
  return NextResponse.json({ run, events });
}
