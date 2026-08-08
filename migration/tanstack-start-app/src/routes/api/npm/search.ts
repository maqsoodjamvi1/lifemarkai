import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";

/** Native /api/npm/search — authenticated proxy to the npm registry search API. */
export const Route = createFileRoute("/api/npm/search")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const q = new URL(request.url).searchParams.get("q")?.trim();
        if (!q || q.length < 1) return Response.json({ packages: [] });

        try {
          const url = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(q)}&size=10`;
          const res = await fetch(url, { headers: { Accept: "application/json" } });
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

          return Response.json({ packages });
        } catch {
          return Response.json({ error: "Search failed" }, { status: 502 });
        }
      },
    },
  },
});
