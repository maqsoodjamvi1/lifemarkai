import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// GET /api/npm/search?q=<query>
// Proxies to npm registry search API. Auth required to prevent abuse.
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 1) return NextResponse.json({ packages: [] });

  try {
    const url = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(q)}&size=10`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 60 },
    });
    if (!res.ok) throw new Error("npm registry error");
    const data = await res.json();

    const packages = (data.objects ?? []).map((obj: {
      package: { name: string; version: string; description?: string; links?: { npm?: string } };
      downloads?: { weekly?: number };
    }) => ({
      name: obj.package.name,
      version: obj.package.version,
      description: obj.package.description ?? "",
      weekly: obj.downloads?.weekly ?? 0,
      url: obj.package.links?.npm ?? `https://www.npmjs.com/package/${obj.package.name}`,
    }));

    return NextResponse.json({ packages });
  } catch {
    return NextResponse.json({ error: "Search failed" }, { status: 502 });
  }
}
