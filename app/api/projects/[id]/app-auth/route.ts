// @ts-nocheck
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

interface Params { params: Promise<{ id: string }> }

/**
 * Auth providers for end-users of a built app.
 *
 *  GET    → list configured providers
 *  POST   → enable a provider (google | saml | oidc) with optional BYOK config
 *  PATCH  → update provider config
 *  DELETE ?provider=... → disable
 */

const VALID_PROVIDERS = ["google", "saml", "oidc"];

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("app_auth_providers")
    .select("*")
    .eq("project_id", id)
    .eq("user_id", user.id);

  // Sanitize secrets in response — return whether they're set, not the value
  const sanitised = (data ?? []).map((row: any) => {
    const cfg = { ...(row.config ?? {}) };
    for (const k of Object.keys(cfg)) {
      if (/secret|password|key|token/i.test(k)) {
        cfg[k] = cfg[k] ? "•••••••• (set)" : null;
      }
    }
    return { ...row, config: cfg };
  });
  return NextResponse.json({ providers: sanitised });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { provider, mode, config } = await req.json() as {
    provider: string; mode?: "managed" | "byok"; config?: Record<string, unknown>;
  };
  if (!provider || !VALID_PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  }

  // Verify ownership
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  // Provider-specific config validation
  const safeMode = mode ?? "managed";
  let validatedConfig = config ?? {};

  if (provider === "google" && safeMode === "byok") {
    const required = ["client_id", "client_secret"];
    for (const k of required) {
      if (!(k in validatedConfig)) {
        return NextResponse.json({
          error: `Google BYOK requires ${k}`,
          required,
          docs: "https://console.cloud.google.com/apis/credentials",
        }, { status: 400 });
      }
    }
  }
  if (provider === "saml") {
    const required = ["idp_entity_id", "idp_sso_url", "idp_x509_cert"];
    for (const k of required) {
      if (!(k in validatedConfig)) {
        return NextResponse.json({
          error: `SAML requires ${k}`,
          required,
          callback_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/saml/${id}/callback`,
        }, { status: 400 });
      }
    }
  }
  if (provider === "oidc") {
    const required = ["issuer", "client_id", "client_secret"];
    for (const k of required) {
      if (!(k in validatedConfig)) {
        return NextResponse.json({
          error: `OIDC requires ${k}`,
          required,
          callback_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/oidc/${id}/callback`,
        }, { status: 400 });
      }
    }
  }

  const { data, error } = await supabase
    .from("app_auth_providers")
    .upsert({
      project_id: id,
      user_id: user.id,
      provider,
      mode: safeMode,
      enabled: true,
      config: validatedConfig,
      updated_at: new Date().toISOString(),
    }, { onConflict: "project_id,provider" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    provider: data,
    next_steps: provider === "saml" ? {
      acs_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/saml/${id}/callback`,
      entity_id: `${process.env.NEXT_PUBLIC_APP_URL}/saml/${id}`,
      note: "Provide these to your IdP (Okta / Entra ID / OneLogin / etc.) when creating the SAML application.",
    } : undefined,
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { provider, enabled, configPatch } = await req.json();
  if (!provider) return NextResponse.json({ error: "provider required" }, { status: 400 });

  const updates: any = { updated_at: new Date().toISOString() };
  if (typeof enabled === "boolean") updates.enabled = enabled;

  if (configPatch) {
    const { data: existing } = await supabase
      .from("app_auth_providers")
      .select("config")
      .eq("project_id", id)
      .eq("user_id", user.id)
      .eq("provider", provider)
      .maybeSingle();
    updates.config = { ...(existing?.config ?? {}), ...configPatch };
  }

  const { error } = await supabase
    .from("app_auth_providers")
    .update(updates)
    .eq("project_id", id)
    .eq("user_id", user.id)
    .eq("provider", provider);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const provider = req.nextUrl.searchParams.get("provider");
  if (!provider) return NextResponse.json({ error: "provider required" }, { status: 400 });

  await supabase
    .from("app_auth_providers")
    .delete()
    .eq("project_id", id)
    .eq("user_id", user.id)
    .eq("provider", provider);
  return NextResponse.json({ ok: true });
}
