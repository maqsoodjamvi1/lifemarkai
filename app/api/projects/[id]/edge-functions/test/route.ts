import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface Params { params: Promise<{ id: string }> }

/**
 * Simulated Edge Function test runner.
 * In production this would spin up a Deno subprocess or call the
 * Supabase Edge Runtime locally. For now it runs the function via
 * a fetch to the deployed Supabase URL if available, otherwise
 * returns a helpful simulation response.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, code, body: testBody } = await req.json() as {
    name: string;
    code: string;
    body: string;
  };

  // Attempt to fetch the deployed function if SUPABASE_PROJECT_REF is set
  const ref = process.env.SUPABASE_PROJECT_REF;
  if (ref) {
    try {
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
      const res = await fetch(`https://${ref}.functions.supabase.co/${name}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${anonKey}`,
        },
        body: testBody,
      });
      const text = await res.text();
      return NextResponse.json({ result: text, headers: Object.fromEntries(res.headers) }, { status: res.status });
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 500 });
    }
  }

  // Simulation mode — parse the body and echo a fake response
  let parsedBody: unknown = {};
  try { parsedBody = JSON.parse(testBody); } catch { parsedBody = testBody; }

  const simulatedResponse = {
    message: `Simulated response from "${name}"`,
    echo: parsedBody,
    note: "Set SUPABASE_PROJECT_REF env var to test against the real deployed function.",
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json({ result: JSON.stringify(simulatedResponse, null, 2) });
}
