// @ts-nocheck
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Security scan dispatcher — routes to Aikido (pen test) or Wiz (CVE scan)
 * depending on the `vendor` body field.
 *
 * Requires the vendor's API key in env:
 *   AIKIDO_API_KEY    — https://app.aikido.dev/settings/integrations/api
 *   WIZ_CLIENT_ID + WIZ_CLIENT_SECRET   — https://app.wiz.io
 *
 * Without credentials this returns a 501 with a clear message so the UI can
 * show "set up vendor" rather than failing silently.
 */

interface ScanBody {
  projectId: string;
  vendor: "aikido" | "wiz";
  target?: { url?: string; repo?: string };
  config?: { policies?: string[]; severity_threshold?: "low" | "medium" | "high" | "critical" };
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, vendor, target, config } = await req.json() as ScanBody;
  if (!projectId || !vendor) {
    return NextResponse.json({ error: "projectId and vendor required" }, { status: 400 });
  }

  // Ownership check
  const { data: project } = await supabase
    .from("projects")
    .select("id, deployed_url, github_repo")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  if (vendor === "aikido") {
    const apiKey = process.env.AIKIDO_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        error: "Aikido not configured",
        guide: {
          step1: "Sign up at https://aikido.dev",
          step2: "Settings → Integrations → API → Create API key",
          step3: "Set AIKIDO_API_KEY in your .env.local",
          docs: "https://docs.lovable.dev/integrations/aikido",
        },
      }, { status: 501 });
    }

    const scanTarget = target?.url ?? project.deployed_url;
    if (!scanTarget) {
      return NextResponse.json({ error: "No deployed URL or target.url to scan" }, { status: 400 });
    }

    try {
      const res = await fetch("https://app.aikido.dev/api/public/v1/scans", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          target: scanTarget,
          type: "pentest",
          severity_threshold: config?.severity_threshold ?? "medium",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        return NextResponse.json({ error: `Aikido API ${res.status}: ${JSON.stringify(data)}` }, { status: 502 });
      }
      return NextResponse.json({
        ok: true,
        vendor: "aikido",
        scan_id: data.id ?? data.scan_id,
        status: data.status ?? "queued",
        target: scanTarget,
        webhook_hint: "Configure /api/security/scan/webhook for results",
      });
    } catch (err) {
      return NextResponse.json({ error: `Aikido request failed: ${(err as Error).message}` }, { status: 502 });
    }
  }

  if (vendor === "wiz") {
    const clientId = process.env.WIZ_CLIENT_ID;
    const clientSecret = process.env.WIZ_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return NextResponse.json({
        error: "Wiz not configured",
        guide: {
          step1: "Contact Wiz to enable API access (enterprise-only)",
          step2: "Generate a service account with Vulnerabilities.read + Scans.create",
          step3: "Set WIZ_CLIENT_ID and WIZ_CLIENT_SECRET",
          docs: "https://docs.lovable.dev/integrations/wiz",
        },
      }, { status: 501 });
    }

    const scanTarget = target?.repo ?? project.github_repo;
    if (!scanTarget) {
      return NextResponse.json({ error: "No github_repo or target.repo to scan" }, { status: 400 });
    }

    // Two-step: get bearer token, then submit scan. Skeleton; verify Wiz API shape.
    try {
      const tokenRes = await fetch("https://auth.app.wiz.io/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: clientId,
          client_secret: clientSecret,
          audience: "wiz-api",
        }),
      });
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) {
        return NextResponse.json({ error: `Wiz auth failed: ${JSON.stringify(tokenData)}` }, { status: 502 });
      }
      // The scan submission endpoint varies by Wiz tenant — placeholder URL
      const scanRes = await fetch("https://api.wiz.io/graphql", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${tokenData.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: `mutation CreateSAST($input: CreateSASTScanInput!) {
            createSASTScan(input: $input) { id status }
          }`,
          variables: { input: { repository: scanTarget } },
        }),
      });
      const scanData = await scanRes.json();
      return NextResponse.json({
        ok: true,
        vendor: "wiz",
        scan_id: scanData.data?.createSASTScan?.id,
        status: scanData.data?.createSASTScan?.status ?? "queued",
        target: scanTarget,
      });
    } catch (err) {
      return NextResponse.json({ error: `Wiz request failed: ${(err as Error).message}` }, { status: 502 });
    }
  }

  return NextResponse.json({ error: `Unknown vendor: ${vendor}` }, { status: 400 });
}
