"use client";

import { useState, useEffect, useCallback } from "react";
import { BarChart3, RefreshCw, Loader2, AlertTriangle, CheckCircle2, ExternalLink, Sparkles, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import type { ProjectFile } from "@/types/database";

interface BundleAnalyzerPanelProps {
  files: ProjectFile[];
  onFixWithAI: (prompt: string) => void;
}

interface PackageSize {
  name: string;
  version: string;
  gzip: number;        // bytes
  size: number;        // bytes
  isHeavy: boolean;
  alternative?: string;
  alternativeNote?: string;
}

interface BundleStats {
  packages: PackageSize[];
  totalGzip: number;
  totalSize: number;
  heavyCount: number;
  fetchedAt: string;
}

// ─── Known heavy packages and their lighter alternatives ─────────────────────

const HEAVY_ALTERNATIVES: Record<string, { alt: string; note: string }> = {
  "moment":           { alt: "dayjs or date-fns",     note: "dayjs is 2KB vs moment's 67KB" },
  "lodash":           { alt: "lodash-es + tree-shake", note: "Import only what you need: `import debounce from 'lodash/debounce'`" },
  "axios":            { alt: "native fetch",           note: "Modern browsers support fetch natively — no library needed" },
  "jquery":           { alt: "vanilla JS",             note: "jQuery adds 85KB — modern DOM APIs are equivalent" },
  "bootstrap":        { alt: "tailwindcss",            note: "Tailwind CSS is utility-first with much smaller output" },
  "material-ui":      { alt: "shadcn/ui + radix",      note: "shadcn/ui is zero-bundle (copy-paste components)" },
  "@mui/material":    { alt: "shadcn/ui + radix",      note: "shadcn/ui is zero-bundle (copy-paste components)" },
  "antd":             { alt: "shadcn/ui + radix",      note: "Ant Design adds 2MB+ — shadcn/ui has no runtime bundle" },
  "recharts":         { alt: "chart.js",               note: "chart.js is smaller if you need simple charts" },
  "three":            { alt: "lazy-load with dynamic()", note: "Use next/dynamic with ssr:false to defer loading" },
  "framer-motion":    { alt: "CSS transitions",        note: "Consider CSS animations for simple transitions" },
  "react-query":      { alt: "@tanstack/react-query",  note: "Switch to the scoped package for better tree-shaking" },
  "uuid":             { alt: "crypto.randomUUID()",    note: "Native crypto.randomUUID() is available in all modern browsers" },
  "classnames":       { alt: "clsx or cn()",           note: "clsx is identical but smaller; shadcn already ships cn()" },
};

// ─── Fetch size data from bundlephobia (cached) ───────────────────────────────

const SIZE_CACHE = new Map<string, PackageSize>();

async function fetchPackageSize(name: string, version: string): Promise<PackageSize> {
  const key = `${name}@${version}`;
  if (SIZE_CACHE.has(key)) return SIZE_CACHE.get(key)!;

  try {
    // bundlephobia API
    const res = await fetch(
      `https://bundlephobia.com/api/size?package=${encodeURIComponent(key)}&record=true`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) throw new Error();
    const data = await res.json() as { gzip: number; size: number };
    const heavy = HEAVY_ALTERNATIVES[name];
    const pkg: PackageSize = {
      name,
      version,
      gzip: data.gzip,
      size: data.size,
      isHeavy: data.gzip > 50_000, // > 50KB gzipped
      alternative: heavy?.alt,
      alternativeNote: heavy?.note,
    };
    SIZE_CACHE.set(key, pkg);
    return pkg;
  } catch {
    // Return a synthetic estimate for common packages
    const syntheticSizes: Record<string, [number, number]> = {
      "react":        [11_400, 43_000],
      "react-dom":    [42_000, 132_000],
      "next":         [88_000, 280_000],
      "typescript":   [0, 0],
      "tailwindcss":  [0, 0],
    };
    const [gzip, size] = syntheticSizes[name] ?? [0, 0];
    const pkg: PackageSize = { name, version, gzip, size, isHeavy: gzip > 50_000 };
    SIZE_CACHE.set(key, pkg);
    return pkg;
  }
}

function parseDependencies(files: ProjectFile[]): { name: string; version: string }[] {
  const pkgFile = files.find((f) => f.path === "package.json" || f.path.endsWith("/package.json"));
  if (!pkgFile?.content) return [];

  try {
    const pkg = JSON.parse(pkgFile.content) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const deps = { ...pkg.dependencies };
    return Object.entries(deps)
      .filter(([name]) => !name.startsWith("@types/"))
      .map(([name, version]) => ({ name, version: (version as string).replace(/^[\^~>=<]/, "").split(" ")[0] }))
      .slice(0, 40); // limit to top 40
  } catch {
    return [];
  }
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "—";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BundleAnalyzerPanel({ files, onFixWithAI }: BundleAnalyzerPanelProps) {
  const [stats, setStats] = useState<BundleStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedPkg, setExpandedPkg] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "heavy">("all");

  const deps = parseDependencies(files);

  const analyze = useCallback(async () => {
    if (deps.length === 0) {
      toast({ title: "No package.json found", description: "Add a package.json to your project to analyze bundle size." });
      return;
    }
    setLoading(true);
    try {
      const results = await Promise.all(
        deps.map((d) => fetchPackageSize(d.name, d.version))
      );

      const sorted = results
        .filter((p) => p.gzip > 0 || p.size > 0)
        .sort((a, b) => b.gzip - a.gzip);

      const allPkgs = [
        ...sorted,
        ...results.filter((p) => p.gzip === 0 && p.size === 0),
      ];

      setStats({
        packages: allPkgs,
        totalGzip: allPkgs.reduce((s, p) => s + p.gzip, 0),
        totalSize: allPkgs.reduce((s, p) => s + p.size, 0),
        heavyCount: allPkgs.filter((p) => p.isHeavy).length,
        fetchedAt: new Date().toLocaleTimeString(),
      });
    } finally {
      setLoading(false);
    }
  }, [deps]);

  useEffect(() => {
    if (deps.length > 0) analyze();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const displayed = stats?.packages.filter(
    (p) => filter === "all" || p.isHeavy
  ) ?? [];

  const maxGzip = Math.max(...(stats?.packages.map((p) => p.gzip) ?? [1]));

  function fixAllHeavy() {
    const heavy = stats?.packages.filter((p) => p.isHeavy && p.alternative) ?? [];
    if (heavy.length === 0) return;
    const prompt = heavy
      .map((p) => `- Replace \`${p.name}\` with ${p.alternative} (${p.alternativeNote})`)
      .join("\n");
    onFixWithAI(`Optimize my bundle by replacing heavy dependencies:\n${prompt}`);
  }

  return (
    <div className="flex flex-col h-full text-sm">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 mb-1">
          <BarChart3 className="w-4 h-4 text-violet-400" />
          <h2 className="font-semibold text-foreground">Bundle Analyzer</h2>
          {stats && (
            <Badge variant="outline" className={`text-[10px] h-4 px-1.5 ${stats.heavyCount > 0 ? "border-amber-500/40 text-amber-400" : "border-emerald-500/40 text-emerald-400"}`}>
              {stats.heavyCount > 0 ? `${stats.heavyCount} heavy` : "Lean"}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">Analyze dependency sizes via Bundlephobia</p>
      </div>

      {/* Summary */}
      {stats && (
        <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
          <div className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground mb-0.5">Total (gzip)</p>
            <p className={`text-base font-bold ${stats.totalGzip > 500_000 ? "text-red-400" : stats.totalGzip > 200_000 ? "text-amber-400" : "text-emerald-400"}`}>
              {formatSize(stats.totalGzip)}
            </p>
          </div>
          <div className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground mb-0.5">Packages</p>
            <p className="text-base font-bold text-foreground">{stats.packages.length}</p>
          </div>
          <div className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground mb-0.5">Heavy (&gt;50KB)</p>
            <p className={`text-base font-bold ${stats.heavyCount > 0 ? "text-amber-400" : "text-emerald-400"}`}>
              {stats.heavyCount}
            </p>
          </div>
        </div>
      )}

      {/* Filter + refresh */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <div className="flex gap-1 flex-1">
          {(["all", "heavy"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-medium capitalize transition-all ${
                filter === f ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f === "heavy" ? "⚠️ Heavy only" : "All packages"}
            </button>
          ))}
        </div>
        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={analyze} disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Package list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
        {loading ? (
          <div className="flex flex-col items-center gap-3 py-12">
            <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
            <p className="text-xs text-muted-foreground">Fetching bundle sizes…</p>
          </div>
        ) : deps.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <Package className="w-8 h-8 text-muted-foreground/40" />
            <p className="text-sm font-medium text-foreground">No package.json detected</p>
            <p className="text-xs text-muted-foreground">Add a package.json to analyze bundle sizes.</p>
          </div>
        ) : displayed.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <CheckCircle2 className="w-7 h-7 text-emerald-400" />
            <p className="text-sm font-medium text-foreground">No heavy packages</p>
            <p className="text-xs text-muted-foreground">All dependencies are under 50KB gzipped.</p>
          </div>
        ) : (
          displayed.map((pkg) => (
            <div key={pkg.name} className={`rounded-xl border overflow-hidden ${pkg.isHeavy ? "border-amber-500/20 bg-amber-500/5" : "border-border bg-muted/10"}`}>
              <button
                className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
                onClick={() => setExpandedPkg(expandedPkg === pkg.name ? null : pkg.name)}
              >
                {pkg.isHeavy
                  ? <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500/60 shrink-0" />
                }
                <span className="font-mono text-xs text-foreground flex-1 text-left truncate">{pkg.name}</span>
                <span className={`text-xs font-semibold tabular-nums shrink-0 ${pkg.isHeavy ? "text-amber-400" : "text-muted-foreground"}`}>
                  {formatSize(pkg.gzip)}
                </span>
              </button>

              {/* Size bar */}
              <div className="px-3 pb-2">
                <div className="h-1 rounded-full bg-muted/30 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${pkg.isHeavy ? "bg-amber-500/60" : "bg-violet-500/40"}`}
                    style={{ width: `${Math.max(2, (pkg.gzip / maxGzip) * 100)}%` }}
                  />
                </div>
              </div>

              {expandedPkg === pkg.name && (
                <div className="px-3 pb-3 border-t border-border/50 pt-2 space-y-2">
                  <div className="flex gap-4 text-[10px] text-muted-foreground">
                    <span>Gzip: <span className="text-foreground font-mono">{formatSize(pkg.gzip)}</span></span>
                    <span>Raw: <span className="text-foreground font-mono">{formatSize(pkg.size)}</span></span>
                    <span>v{pkg.version}</span>
                  </div>
                  {pkg.isHeavy && pkg.alternative && (
                    <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-2 text-[10px]">
                      <p className="font-medium text-amber-300 mb-0.5">💡 Alternative: {pkg.alternative}</p>
                      <p className="text-amber-300/70">{pkg.alternativeNote}</p>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <a
                      href={`https://bundlephobia.com/package/${pkg.name}@${pkg.version}`}
                      target="_blank" rel="noreferrer"
                      className="flex items-center gap-1 text-[10px] text-violet-400 hover:text-violet-300"
                    >
                      <ExternalLink className="w-3 h-3" /> Bundlephobia
                    </a>
                    {pkg.isHeavy && pkg.alternative && (
                      <button
                        className="flex items-center gap-1 text-[10px] text-emerald-400 hover:text-emerald-300 ml-auto"
                        onClick={() => onFixWithAI(`Replace \`${pkg.name}\` with ${pkg.alternative} in my project. ${pkg.alternativeNote}`)}
                      >
                        <Sparkles className="w-3 h-3" /> Fix with AI
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      {stats && stats.heavyCount > 0 && (
        <div className="p-3 border-t border-border">
          <Button size="sm" className="w-full gap-1.5" onClick={fixAllHeavy}>
            <Sparkles className="w-3.5 h-3.5" /> Fix all heavy packages with AI
          </Button>
          <p className="text-[10px] text-muted-foreground text-center mt-1.5">Data from Bundlephobia · {stats.fetchedAt}</p>
        </div>
      )}
    </div>
  );
}
