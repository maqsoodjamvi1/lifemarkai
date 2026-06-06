// @ts-nocheck
import type { MetadataRoute } from "next";
import { createAdminClient } from "@/lib/supabase/server";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://lifemarkai.app";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Static routes
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: APP_URL,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${APP_URL}/pricing`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${APP_URL}/templates`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${APP_URL}/explore`,
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 0.7,
    },
  ];

  // Public project pages
  let projectRoutes: MetadataRoute.Sitemap = [];
  try {
    const supabase = await createAdminClient();
    const { data: projects } = await (supabase as any)
      .from("projects")
      .select("id, updated_at")
      .eq("is_public", true)
      .order("updated_at", { ascending: false })
      .limit(500);

    if (projects) {
      projectRoutes = projects.map((p) => ({
        url: `${APP_URL}/preview/${p.id}`,
        lastModified: new Date(p.updated_at),
        changeFrequency: "daily" as const,
        priority: 0.5,
      }));
    }
  } catch {
    // Silently ignore — sitemap should not hard-fail
  }

  return [...staticRoutes, ...projectRoutes];
}
