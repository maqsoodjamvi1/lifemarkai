import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCommitHistory } from "@/lib/github/client";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const owner = searchParams.get("owner");
    const repo = searchParams.get("repo");
    const perPage = parseInt(searchParams.get("perPage") || "20");

    if (!owner || !repo) {
      return NextResponse.json({ error: "Missing owner or repo" }, { status: 400 });
    }

    // Get GitHub token from profile
    const { data: profile } = await (supabase as any)
      .from("profiles")
      .select("github_access_token, github_username")
      .eq("id", user.id)
      .single();

    if (!profile?.github_access_token) {
      return NextResponse.json({ error: "GitHub not connected" }, { status: 401 });
    }

    const commits = await getCommitHistory(profile.github_access_token, owner, repo, perPage);

    return NextResponse.json({ commits });
  } catch (error: any) {
    console.error("Commits error:", error);
    return NextResponse.json({ error: error.message || "Failed to fetch commits" }, { status: 500 });
  }
}
