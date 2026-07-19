// @ts-nocheck
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { assertChatAccess } from "@/lib/project/chat-access";
import {
  appendPreviewConsole,
  appendPreviewNetwork,
  getPreviewTelemetry,
} from "@/lib/preview/preview-telemetry";

/** GET — agent / debug read of buffered preview console + network. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await assertChatAccess(supabase, id, user.id, "read");
  if ("error" in access) return access.error;

  return NextResponse.json(getPreviewTelemetry(id));
}

/** POST — preview panel pushes recent console/network lines. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await assertChatAccess(supabase, id, user.id, "write");
  if ("error" in access) return access.error;

  let body: {
    console?: Array<{ type?: string; text: string }>;
    network?: Array<{
      method?: string;
      url: string;
      status?: number;
      ok?: boolean;
      durationMs?: number;
      contentType?: string;
      error?: string;
    }>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (Array.isArray(body.console) && body.console.length > 0) {
    appendPreviewConsole(id, body.console.slice(-40));
  }
  if (Array.isArray(body.network) && body.network.length > 0) {
    appendPreviewNetwork(id, body.network.slice(-40));
  }

  return NextResponse.json({ ok: true });
}
