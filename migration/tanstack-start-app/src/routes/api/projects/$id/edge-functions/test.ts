// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";

/**
 * Native /api/projects/:id/edge-functions/test — run an edge function against
 * the deployed Supabase functions host (if SUPABASE_PROJECT_REF set), else
 * return a simulated response.
 */
export const Route = createFileRoute("/api/projects/$id/edge-functions/test")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const { name, code, body: testBody } = (await request.json()) as {
          name: string;
          code: string;
          body: string;
        };

        const ref = process.env.SUPABASE_PROJECT_REF;
        if (ref) {
          try {
            const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
            const res = await fetch(`https://${ref}.functions.supabase.co/${name}`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${anonKey}` },
              body: testBody,
            });
            const text = await res.text();
            return Response.json({ result: text, headers: Object.fromEntries(res.headers) }, { status: res.status });
          } catch (err) {
            return Response.json({ error: String(err) }, { status: 500 });
          }
        }

        let parsedBody: unknown = {};
        try { parsedBody = JSON.parse(testBody); } catch { parsedBody = testBody; }

        const simulatedResponse = {
          message: `Simulated response from "${name}"`,
          echo: parsedBody,
          note: "Set SUPABASE_PROJECT_REF env var to test against the real deployed function.",
          timestamp: new Date().toISOString(),
        };

        return Response.json({ result: JSON.stringify(simulatedResponse, null, 2) });
      },
    },
  },
});
