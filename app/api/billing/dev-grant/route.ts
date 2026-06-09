import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { ensureDevCredits } from "@/lib/dev-credits";

/** Dev-only: force-grant demo credits (100) for local testing. */
export async function POST() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const credits = (await ensureDevCredits(user.id)) ?? 100;

  return NextResponse.json({ credits, ok: true });
}
