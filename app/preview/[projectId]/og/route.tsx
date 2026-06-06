import { ImageResponse } from "next/og";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const supabase = await createAdminClient();

  const { data: project } = await (supabase as any)
    .from("projects")
    .select("name, description, framework")
    .eq("id", projectId)
    .single();

  const name        = project?.name        ?? "Untitled Project";
  const description = project?.description ?? "Built with LifemarkAI";
  const framework   = project?.framework   ?? "React";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(135deg, #0d0d14 0%, #1a1030 50%, #0d0d14 100%)",
          padding: "60px 72px",
          fontFamily: "system-ui, -apple-system, sans-serif",
          position: "relative",
        }}
      >
        {/* Grid pattern overlay */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(rgba(124,58,237,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(124,58,237,0.05) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        {/* LifemarkAI badge */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: "auto",
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: "linear-gradient(135deg, #7c3aed, #2563eb)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
              fontWeight: 900,
              color: "white",
            }}
          >
            L
          </div>
          <span style={{ color: "#6c7086", fontSize: 18, fontWeight: 500 }}>
            LifemarkAI
          </span>
        </div>

        {/* Project info */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Framework badge */}
          <div
            style={{
              display: "inline-flex",
              padding: "4px 14px",
              background: "rgba(124,58,237,0.15)",
              border: "1px solid rgba(124,58,237,0.3)",
              borderRadius: 999,
              color: "#a78bfa",
              fontSize: 14,
              fontWeight: 600,
              width: "fit-content",
              textTransform: "capitalize",
            }}
          >
            {framework}
          </div>

          {/* Project name */}
          <div
            style={{
              fontSize: 52,
              fontWeight: 800,
              color: "#cdd6f4",
              lineHeight: 1.1,
              letterSpacing: "-1px",
              maxWidth: 900,
            }}
          >
            {name}
          </div>

          {/* Description */}
          {description && (
            <div
              style={{
                fontSize: 22,
                color: "#6c7086",
                lineHeight: 1.5,
                maxWidth: 800,
              }}
            >
              {description.length > 100
                ? description.slice(0, 97) + "…"
                : description}
            </div>
          )}
        </div>

        {/* Bottom bar */}
        <div
          style={{
            marginTop: 48,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span style={{ color: "#313244", fontSize: 14 }}>
            lifemarkai.app
          </span>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 20px",
              background: "linear-gradient(135deg, #7c3aed, #2563eb)",
              borderRadius: 8,
              color: "white",
              fontSize: 15,
              fontWeight: 600,
            }}
          >
            View Live App →
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
