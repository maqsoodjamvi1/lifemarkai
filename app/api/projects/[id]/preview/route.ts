// @ts-nocheck
/**
 * POST /api/projects/:id/preview
 *
 * Accepts a base64-encoded screenshot from the editor's build capture,
 * uploads it to Supabase Storage (previews bucket), and updates the
 * project's preview_url so dashboard cards and the explore page show
 * real app screenshots.
 *
 * Body: { dataUrl: string }  — data:image/jpeg;base64,... or plain base64
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { canWriteProjectFiles, getProjectAccess } from "@/lib/project/access";

interface Params { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { id: projectId } = await params;

  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { dataUrl } = await req.json();
  if (!dataUrl || typeof dataUrl !== "string") {
    return NextResponse.json({ error: "dataUrl required" }, { status: 400 });
  }

  const access = await getProjectAccess(supabase, projectId, user.id);
  if (!canWriteProjectFiles(access)) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Extract base64 bytes from data URL
  // dataUrl is either "data:image/jpeg;base64,<b64>" or plain base64
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

  // Use admin client for storage so RLS path check on storage.objects passes
  // (createAdminClient is async — the missing await made admin a Promise and
  // crashed on .storage with "Cannot read properties of undefined")
  const admin = await createAdminClient();
  const { error: uploadError } = await (admin as any)
    .storage
    .from("previews")
    .upload(storagePath, buffer, {
      contentType: mimeType,
      upsert: true,  // overwrite on each new build
    });

  if (uploadError) {
    // Storage bucket may not exist yet — fall back to storing data URL directly
    console.warn("Preview storage upload failed, falling back to data URL:", uploadError.message);
    await (supabase as any)
      .from("projects")
      .update({ preview_url: dataUrl })
      .eq("id", projectId);
    return NextResponse.json({ preview_url: dataUrl, storage: false });
  }

  // Get public URL
  const { data: { publicUrl } } = (admin as any)
    .storage
    .from("previews")
    .getPublicUrl(storagePath);

  // Update project preview_url
  await (supabase as any)
    .from("projects")
    .update({ preview_url: publicUrl })
    .eq("id", projectId);

  return NextResponse.json({ preview_url: publicUrl, storage: true });
}
