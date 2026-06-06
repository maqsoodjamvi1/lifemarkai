"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Package, Search, Plus, Trash2, Loader2, ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { ProjectFile } from "@/types/database";

interface NpmPackage {
  name: string;
  version: string;
  description: string;
  weekly: number;
  url: string;
}

interface PackagesPanelProps {
  projectId: string;
  files: ProjectFile[];
  onFileChange: (file: ProjectFile) => void;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M/wk`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k/wk`;
  return `${n}/wk`;
}

export function PackagesPanel({ projectId, files, onFileChange }: PackagesPanelProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NpmPackage[]>([]);
  const [searching, setSearching] = useState(false);
  const [installed, setInstalled] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast } = useToast();

  // Parse installed packages from package.json
  const loadInstalled = useCallback(() => {
    const pkgFile = files.find((f) => f.path === "package.json");
    if (!pkgFile?.content) { setInstalled({}); return; }
    try {
      const parsed = JSON.parse(pkgFile.content);
      const deps: Record<string, string> = {
        ...parsed.dependencies,
        ...parsed.devDependencies,
      };
      setInstalled(deps);
    } catch {
      setInstalled({});
    }
  }, [files]);

  useEffect(() => { loadInstalled(); }, [loadInstalled]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/npm/search?q=${encodeURIComponent(query.trim())}`);
        const data = await res.json();
        setResults(data.packages ?? []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  async function mutatePkgJson(
    mutate: (deps: Record<string, string>) => void,
  ) {
    const pkgFile = files.find((f) => f.path === "package.json");
    let parsed: Record<string, unknown> = { name: "project", version: "0.1.0", dependencies: {}, devDependencies: {} };
    if (pkgFile?.content) {
      try { parsed = JSON.parse(pkgFile.content); } catch { /* use default */ }
    }
    const deps = (parsed.dependencies as Record<string, string>) ?? {};
    mutate(deps);
    parsed.dependencies = deps;

    const newContent = JSON.stringify(parsed, null, 2);
    const updated: ProjectFile = pkgFile
      ? { ...pkgFile, content: newContent }
      : {
          id: `pkg-${projectId}`,
          project_id: projectId,
          path: "package.json",
          content: newContent,
          language: "json",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

    // Persist via API
    await fetch(`/api/projects/${projectId}/files`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: updated.path, content: updated.content, language: "json" }),
    });

    onFileChange(updated);
    return deps;
  }

  async function addPackage(pkg: NpmPackage) {
    setAdding(pkg.name);
    try {
      await mutatePkgJson((deps) => { deps[pkg.name] = `^${pkg.version}`; });
      toast({ title: "Package added", description: `${pkg.name}@^${pkg.version} added to package.json` });
    } catch {
      toast({ title: "Failed to add package", variant: "destructive" });
    } finally {
      setAdding(null);
    }
  }

  async function removePackage(name: string) {
    setRemoving(name);
    try {
      await mutatePkgJson((deps) => { delete deps[name]; });
      toast({ title: "Package removed", description: `${name} removed from package.json` });
    } catch {
      toast({ title: "Failed to remove package", variant: "destructive" });
    } finally {
      setRemoving(null);
    }
  }

  const installedList = Object.entries(installed);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <Package className="w-4 h-4" />
        <span className="text-sm font-semibold">Packages</span>
        <span className="ml-auto text-xs text-muted-foreground">{installedList.length} installed</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Search */}
        <div className="p-3 border-b border-border/50">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search npm packages…"
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-muted/40 border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
            />
            {searching && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 animate-spin text-muted-foreground" />}
          </div>
        </div>

        {/* Search results */}
        {results.length > 0 && (
          <div className="border-b border-border/50">
            <p className="px-3 pt-2 pb-1 text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Results</p>
            {results.map((pkg) => {
              const isInstalled = pkg.name in installed;
              return (
                <div key={pkg.name} className="flex items-start gap-2 px-3 py-2 hover:bg-muted/30 transition-colors group">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-foreground truncate">{pkg.name}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">{pkg.version}</span>
                      {pkg.weekly > 0 && (
                        <span className="text-[10px] text-muted-foreground/60 shrink-0">{fmt(pkg.weekly)}</span>
                      )}
                      <a
                        href={pkg.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="View on npm"
                      >
                        <ExternalLink className="w-2.5 h-2.5 text-muted-foreground" />
                      </a>
                    </div>
                    {pkg.description && (
                      <p className="text-[10px] text-muted-foreground/70 mt-0.5 line-clamp-2 leading-relaxed">
                        {pkg.description}
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant={isInstalled ? "outline" : "default"}
                    className="h-6 px-2 text-[10px] shrink-0"
                    onClick={() => isInstalled ? removePackage(pkg.name) : addPackage(pkg)}
                    disabled={adding === pkg.name || removing === pkg.name}
                  >
                    {(adding === pkg.name || removing === pkg.name)
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : isInstalled
                        ? <Trash2 className="w-3 h-3" />
                        : <Plus className="w-3 h-3" />
                    }
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        {/* Installed packages */}
        <div>
          <div className="flex items-center justify-between px-3 pt-3 pb-1">
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Installed</p>
            <button
              onClick={loadInstalled}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>
          {installedList.length === 0 ? (
            <p className="px-3 py-4 text-xs text-muted-foreground/60 text-center">No packages installed yet.</p>
          ) : (
            installedList.map(([name, version]) => (
              <div key={name} className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/30 transition-colors group">
                <Package className="w-3 h-3 text-muted-foreground/50 shrink-0" />
                <span className="text-xs text-foreground flex-1 truncate">{name}</span>
                <span className="text-[10px] text-muted-foreground/60 shrink-0">{version}</span>
                <button
                  onClick={() => removePackage(name)}
                  disabled={removing === name}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                  title="Remove package"
                >
                  {removing === name
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : <Trash2 className="w-3 h-3" />
                  }
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
