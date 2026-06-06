import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface Params { params: Promise<{ id: string }> }

type Status = "ok" | "missing" | "invalid" | "warning" | "unknown";

interface EnvCheck {
  key: string;
  status: Status;
  value?: string;
  hint: string;
  docUrl?: string;
  category: string;
  required: boolean;
}

const ENV_SCHEMA: Omit<EnvCheck, "status" | "value">[] = [
  // Supabase
  { key: "NEXT_PUBLIC_SUPABASE_URL",       category: "Supabase",  required: true,  hint: "Should be https://<project-ref>.supabase.co", docUrl: "https://supabase.com/docs/guides/getting-started/quickstarts/nextjs" },
  { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY",  category: "Supabase",  required: true,  hint: "Starts with 'eyJ…' (JWT format)" },
  { key: "SUPABASE_SERVICE_ROLE_KEY",      category: "Supabase",  required: false, hint: "Service role key — keep secret, never expose to browser" },
  { key: "SUPABASE_JWT_SECRET",            category: "Supabase",  required: false, hint: "Used to verify JWTs server-side" },

  // OpenAI
  { key: "OPENAI_API_KEY",                 category: "AI",        required: true,  hint: "Starts with 'sk-'", docUrl: "https://platform.openai.com/account/api-keys" },
  { key: "ANTHROPIC_API_KEY",              category: "AI",        required: false, hint: "Starts with 'sk-ant-'", docUrl: "https://console.anthropic.com" },

  // Stripe
  { key: "STRIPE_SECRET_KEY",              category: "Stripe",    required: false, hint: "Starts with 'sk_live_' or 'sk_test_'", docUrl: "https://dashboard.stripe.com/apikeys" },
  { key: "STRIPE_WEBHOOK_SECRET",          category: "Stripe",    required: false, hint: "Starts with 'whsec_'" },
  { key: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", category: "Stripe", required: false, hint: "Starts with 'pk_live_' or 'pk_test_'" },

  // Email
  { key: "RESEND_API_KEY",                 category: "Email",     required: false, hint: "Starts with 're_'", docUrl: "https://resend.com/api-keys" },

  // GitHub
  { key: "GITHUB_CLIENT_ID",              category: "GitHub",    required: false, hint: "OAuth app client ID" },
  { key: "GITHUB_CLIENT_SECRET",          category: "GitHub",    required: false, hint: "OAuth app client secret" },
  { key: "GITHUB_APP_PRIVATE_KEY",        category: "GitHub",    required: false, hint: "RSA private key in PEM format" },

  // App
  { key: "NEXT_PUBLIC_APP_URL",           category: "App",       required: true,  hint: "e.g. https://yourapp.com or http://localhost:3000" },
  { key: "NEXTAUTH_SECRET",               category: "App",       required: false, hint: "Random 32+ char secret for session encryption" },

  // Upstash / Redis
  { key: "UPSTASH_REDIS_REST_URL",        category: "Redis",     required: false, hint: "Upstash REST API URL", docUrl: "https://upstash.com" },
  { key: "UPSTASH_REDIS_REST_TOKEN",      category: "Redis",     required: false, hint: "Upstash REST token" },

  // Netlify / Vercel
  { key: "NETLIFY_AUTH_TOKEN",            category: "Deployment", required: false, hint: "Netlify personal access token" },
  { key: "VERCEL_TOKEN",                  category: "Deployment", required: false, hint: "Vercel API token" },
  { key: "VERCEL_ORG_ID",                category: "Deployment", required: false, hint: "Vercel organization/team ID" },
];

function checkValue(key: string, val: string | undefined): Status {
  if (!val || val.trim() === "") return "missing";

  // Pattern checks
  if (key === "OPENAI_API_KEY" && !val.startsWith("sk-")) return "invalid";
  if (key === "ANTHROPIC_API_KEY" && !val.startsWith("sk-ant-")) return "invalid";
  if (key === "STRIPE_SECRET_KEY" && !val.match(/^sk_(live|test)_/)) return "invalid";
  if (key === "STRIPE_WEBHOOK_SECRET" && !val.startsWith("whsec_")) return "invalid";
  if (key === "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY" && !val.match(/^pk_(live|test)_/)) return "invalid";
  if (key === "RESEND_API_KEY" && !val.startsWith("re_")) return "invalid";
  if (key.includes("SUPABASE_URL") && !val.startsWith("https://")) return "invalid";
  if (key === "NEXT_PUBLIC_APP_URL" && !val.startsWith("http")) return "invalid";

  // Warn about test/placeholder values
  if (["your-key", "placeholder", "changeme", "todo", "xxx"].some((p) => val.toLowerCase().includes(p))) return "warning";
  if (key.includes("SECRET") && val.length < 16) return "warning";

  return "ok";
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify ownership
  const { data: project } = await (supabase as any)
    .from("projects")
    .select("id, user_id")
    .eq("id", id)
    .single();
  if (!project || (project as any).user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const checks: EnvCheck[] = ENV_SCHEMA.map((schema) => {
    const val = process.env[schema.key];
    const status = checkValue(schema.key, val);
    return {
      ...schema,
      status,
      value: val ? val.slice(0, 40) : undefined,  // Send raw for masking client-side
    };
  });

  // Score: required present & valid = big points, optional ok = small points
  const required = checks.filter((c) => c.required);
  const optional = checks.filter((c) => !c.required);
  const reqScore = required.length === 0 ? 50 : (required.filter((c) => c.status === "ok").length / required.length) * 60;
  const optScore = optional.length === 0 ? 40 : (optional.filter((c) => c.status === "ok").length / optional.length) * 40;
  const score = Math.round(reqScore + optScore);

  return NextResponse.json({
    checks,
    score,
    checkedAt: new Date().toISOString(),
  });
}
