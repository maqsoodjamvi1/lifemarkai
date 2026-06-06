import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LifemarkAI — Build Apps with AI",
    short_name: "LifemarkAI",
    description:
      "Build full-stack web applications from a single prompt. AI-powered app builder with Agent Mode, Visual Editing, real-time collaboration and one-click deployment.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#0d0d14",
    theme_color: "#7c3aed",
    orientation: "landscape",
    categories: ["productivity", "developer", "utilities"],
    icons: [
      {
        src: "/icons/icon-maskable.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "maskable",
      },
      {
        src: "/icons/icon.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
    shortcuts: [
      {
        name: "New Project",
        url: "/dashboard?new=1",
        description: "Start building a new app",
        icons: [{ src: "/icons/icon.svg", sizes: "512x512" }],
      },
      {
        name: "Dashboard",
        url: "/dashboard",
        description: "View all your projects",
        icons: [{ src: "/icons/icon.svg", sizes: "512x512" }],
      },
    ],
  };
}
