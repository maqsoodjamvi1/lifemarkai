"use client";

import { useMemo } from "react";

interface ProjectThumbnailProps {
  name: string;
  framework?: string | null;
  previewUrl?: string | null;
  deployedUrl?: string | null;
  fileCount?: number;
}

// Framework brand colours for gradient
const FW_COLORS: Record<string, [string, string]> = {
  "next.js":   ["#000000", "#1a1a2e"],
  "nextjs":    ["#000000", "#1a1a2e"],
  "react":     ["#0d1f3c", "#0c3547"],
  "vue":       ["#0d2b1e", "#0d3b28"],
  "svelte":    ["#2b0a00", "#3d1200"],
  "angular":   ["#1a0000", "#2e0000"],
  "vite":      ["#1e0a2a", "#2a0f40"],
  "remix":     ["#0a0a1a", "#141430"],
  "astro":     ["#0a0515", "#130d2a"],
  "nuxt":      ["#002200", "#003300"],
  "sveltekit": ["#1a0800", "#2e1400"],
};

// Framework display labels + icon chars
const FW_META: Record<string, { label: string; icon: string; color: string }> = {
  "next.js":   { label: "Next.js",   icon: "▲", color: "#ffffff" },
  "nextjs":    { label: "Next.js",   icon: "▲", color: "#ffffff" },
  "react":     { label: "React",     icon: "⚛", color: "#61dafb" },
  "vue":       { label: "Vue",       icon: "◈", color: "#42d392" },
  "svelte":    { label: "Svelte",    icon: "◐", color: "#ff3e00" },
  "angular":   { label: "Angular",   icon: "◇", color: "#dd0031" },
  "vite":      { label: "Vite",      icon: "⚡", color: "#a259ff" },
  "remix":     { label: "Remix",     icon: "◬", color: "#e8f2ff" },
  "astro":     { label: "Astro",     icon: "✦", color: "#ff5d01" },
  "nuxt":      { label: "Nuxt",      icon: "◆", color: "#00dc82" },
  "sveltekit": { label: "SvelteKit", icon: "◐", color: "#ff3e00" },
};

function hashCode(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Generate a deterministic gradient from project name
function nameGradient(name: string): [string, string] {
  const h = hashCode(name);
  const hue1 = h % 360;
  const hue2 = (hue1 + 40) % 360;
  return [`hsl(${hue1},60%,12%)`, `hsl(${hue2},50%,8%)`];
}

// Fake code lines for visual effect
const CODE_LINES = [
  "import { useState, useEffect } from 'react'",
  "import { Button } from '@/components/ui/button'",
  "import { cn } from '@/lib/utils'",
  "",
  "export default function App() {",
  "  const [data, setData] = useState([])",
  "  ",
  "  useEffect(() => {",
  "    fetchData().then(setData)",
  "  }, [])",
  "",
  "  return (",
  "    <main className=\"flex flex-col gap-4\">",
  "      <h1>Hello World</h1>",
  "    </main>",
  "  )",
  "}",
];

export function ProjectThumbnail({
  name,
  framework,
  previewUrl,
  deployedUrl,
}: ProjectThumbnailProps) {
  // If there's a deployed URL, try to show it in a mini iframe
  // Otherwise render a styled placeholder
  const fw = (framework ?? "react").toLowerCase();
  const fwColors = FW_COLORS[fw];
  const [g1, g2] = useMemo(
    () => fwColors ?? nameGradient(name),
    [fwColors, name]
  );
  const meta = FW_META[fw] ?? { label: framework ?? "App", icon: "◈", color: "#a0aec0" };

  if (previewUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={previewUrl} alt={name} className="w-full h-full object-cover" />
    );
  }

  return (
    <div
      className="w-full h-full relative overflow-hidden flex flex-col"
      style={{ background: `linear-gradient(135deg, ${g1} 0%, ${g2} 100%)` }}
    >
      {/* Faux code lines */}
      <div className="absolute inset-0 p-3 opacity-25 pointer-events-none select-none overflow-hidden">
        <pre className="text-[6px] leading-[1.6] font-mono text-white/80 whitespace-pre">
          {CODE_LINES.join("\n")}
        </pre>
      </div>

      {/* Gradient overlay to fade out code */}
      <div
        className="absolute inset-0"
        style={{ background: `linear-gradient(to bottom, transparent 40%, ${g2} 100%)` }}
      />

      {/* Framework badge */}
      <div className="absolute top-3 left-3 flex items-center gap-1.5 z-10">
        <span
          className="text-sm font-mono"
          style={{ color: meta.color, textShadow: "0 0 8px currentColor" }}
        >
          {meta.icon}
        </span>
        <span className="text-[10px] font-semibold tracking-wide text-white/60 uppercase">
          {meta.label}
        </span>
      </div>

      {/* Decorative dots pattern */}
      <div className="absolute inset-0 z-0" style={{
        backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)",
        backgroundSize: "16px 16px",
      }} />

      {/* Bottom label */}
      <div className="absolute bottom-0 left-0 right-0 p-3 z-10">
        <p className="text-xs font-semibold text-white/80 truncate">{name}</p>
      </div>

      {/* Live badge if deployed */}
      {deployedUrl && (
        <div className="absolute top-3 right-3 z-10">
          <div className="flex items-center gap-1 text-[9px] bg-green-500/15 border border-green-500/30 text-green-400 px-1.5 py-0.5 rounded-full">
            <span className="w-1 h-1 rounded-full bg-green-400 animate-pulse" />
            Live
          </div>
        </div>
      )}
    </div>
  );
}
