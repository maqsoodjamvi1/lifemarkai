"use client";

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { Network, AlertTriangle, Search, ZoomIn, ZoomOut, Maximize2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

interface DependencyGraphPanelProps {
  projectId: string;
  files: { path: string; content: string }[];
  onFileOpen?: (path: string) => void;
}

interface GraphNode {
  id: string;      // file path
  label: string;   // short name
  x: number;
  y: number;
  vx: number;
  vy: number;
  isCircular: boolean;
}

interface GraphEdge {
  source: string;
  target: string;
  isCircular: boolean;
}

// Parse import statements from file content
function parseImports(path: string, content: string, allPaths: Set<string>): string[] {
  const dir = path.split("/").slice(0, -1).join("/");
  const resolved: string[] = [];

  const importRegex = /(?:import|from)\s+['"]([^'"]+)['"]/g;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const imp = match[1];
    if (!imp.startsWith(".")) continue; // skip node_modules

    // Resolve relative path
    const parts = (dir + "/" + imp).split("/");
    const clean: string[] = [];
    for (const p of parts) {
      if (p === "..") clean.pop();
      else if (p !== ".") clean.push(p);
    }
    const base = clean.join("/");

    // Try to match against known paths (with extensions)
    const candidates = [
      base,
      base + ".ts", base + ".tsx", base + ".js", base + ".jsx",
      base + "/index.ts", base + "/index.tsx", base + "/index.js",
    ];
    for (const c of candidates) {
      if (allPaths.has(c)) { resolved.push(c); break; }
    }
  }
  return resolved;
}

// Detect circular dependencies via DFS
function findCircular(adj: Map<string, string[]>): Set<string> {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const circular = new Set<string>();

  function dfs(node: string, path: string[]) {
    if (visited.has(node)) return;
    if (visiting.has(node)) {
      // found cycle — mark all in cycle
      const cycleStart = path.indexOf(node);
      path.slice(cycleStart).forEach((n) => circular.add(n));
      return;
    }
    visiting.add(node);
    path.push(node);
    for (const neighbor of adj.get(node) ?? []) {
      dfs(neighbor, [...path]);
    }
    visiting.delete(node);
    visited.add(node);
  }

  for (const node of adj.keys()) dfs(node, []);
  return circular;
}

// Simple force-directed layout (Fruchterman-Reingold, 50 iterations)
function forceLayout(nodes: GraphNode[], edges: GraphEdge[], width: number, height: number): GraphNode[] {
  const k = Math.sqrt((width * height) / Math.max(nodes.length, 1));
  const ITERATIONS = 60;
  const COOLING = 0.92;
  let temp = width / 4;

  const pos = nodes.map((n) => ({ ...n }));
  const idxMap = new Map(pos.map((n, i) => [n.id, i]));

  for (let iter = 0; iter < ITERATIONS; iter++) {
    // Repulsion between all pairs
    for (let i = 0; i < pos.length; i++) {
      pos[i].vx = 0; pos[i].vy = 0;
      for (let j = 0; j < pos.length; j++) {
        if (i === j) continue;
        const dx = pos[i].x - pos[j].x;
        const dy = pos[i].y - pos[j].y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 0.01);
        const force = (k * k) / dist;
        pos[i].vx += (dx / dist) * force;
        pos[i].vy += (dy / dist) * force;
      }
    }

    // Attraction along edges
    for (const edge of edges) {
      const si = idxMap.get(edge.source);
      const ti = idxMap.get(edge.target);
      if (si === undefined || ti === undefined) continue;
      const dx = pos[si].x - pos[ti].x;
      const dy = pos[si].y - pos[ti].y;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 0.01);
      const force = (dist * dist) / k;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      pos[si].vx -= fx; pos[si].vy -= fy;
      pos[ti].vx += fx; pos[ti].vy += fy;
    }

    // Apply velocity with cooling
    for (const n of pos) {
      const d = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
      const clamp = Math.min(d, temp);
      n.x += (n.vx / d || 0) * clamp;
      n.y += (n.vy / d || 0) * clamp;
      // Clamp to bounds with padding
      n.x = Math.max(48, Math.min(width - 48, n.x));
      n.y = Math.max(24, Math.min(height - 24, n.y));
    }

    temp *= COOLING;
  }

  return pos;
}

const SVG_W = 520;
const SVG_H = 380;

export function DependencyGraphPanel({ projectId, files, onFileOpen }: DependencyGraphPanelProps) {
  const [search, setSearch] = useState("");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState<{ nodeId?: string; panStart?: { x: number; y: number; px: number; py: number } } | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const { nodes, edges, circularCount } = useMemo(() => {
    const srcFiles = files.filter((f) => /\.(ts|tsx|js|jsx)$/.test(f.path) && !f.path.includes("node_modules"));
    const pathSet = new Set(srcFiles.map((f) => f.path));

    const adj = new Map<string, string[]>();
    for (const file of srcFiles) {
      const imports = parseImports(file.path, file.content, pathSet);
      adj.set(file.path, imports);
    }

    const circular = findCircular(adj);

    // Build graph nodes — seed with random positions
    const rawNodes: GraphNode[] = srcFiles.map((f, i) => ({
      id: f.path,
      label: f.path.split("/").pop() ?? f.path,
      x: SVG_W / 2 + Math.cos((2 * Math.PI * i) / srcFiles.length) * (SVG_W / 3),
      y: SVG_H / 2 + Math.sin((2 * Math.PI * i) / srcFiles.length) * (SVG_H / 3),
      vx: 0, vy: 0,
      isCircular: circular.has(f.path),
    }));

    const rawEdges: GraphEdge[] = [];
    for (const [src, targets] of adj.entries()) {
      for (const tgt of targets) {
        rawEdges.push({ source: src, target: tgt, isCircular: circular.has(src) && circular.has(tgt) });
      }
    }

    const laidOut = forceLayout(rawNodes, rawEdges, SVG_W, SVG_H);
    return { nodes: laidOut, edges: rawEdges, circularCount: circular.size };
  }, [files]);

  const filtered = useMemo(() => {
    if (!search) return new Set(nodes.map((n) => n.id));
    const q = search.toLowerCase();
    const matches = new Set(nodes.filter((n) => n.id.toLowerCase().includes(q)).map((n) => n.id));
    // also include their immediate neighbors
    for (const edge of edges) {
      if (matches.has(edge.source)) matches.add(edge.target);
      if (matches.has(edge.target)) matches.add(edge.source);
    }
    return matches;
  }, [nodes, edges, search]);

  function handleSvgMouseDown(e: React.MouseEvent<SVGSVGElement>) {
    if ((e.target as SVGElement).closest("[data-node]")) return;
    setPan((p) => ({ ...p }));
    setDragging({ panStart: { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y } });
  }

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!dragging) return;
    if (dragging.panStart) {
      setPan({
        x: dragging.panStart.px + (e.clientX - dragging.panStart.x),
        y: dragging.panStart.py + (e.clientY - dragging.panStart.y),
      });
    }
  }

  function handleMouseUp() { setDragging(null); }

  function resetView() { setZoom(1); setPan({ x: 0, y: 0 }); }

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  return (
    <div className="flex flex-col h-full text-sm">
      {/* Header */}
      <div className="p-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <Network className="w-4 h-4 text-indigo-400" />
          <h2 className="font-semibold text-foreground">Dependency Graph</h2>
          <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-border text-muted-foreground">
            {nodes.length} files
          </Badge>
          {circularCount > 0 && (
            <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-red-500/40 text-red-400 ml-auto gap-1">
              <AlertTriangle className="w-2.5 h-2.5" /> {circularCount} circular
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">Import relationships between project files</p>
      </div>

      {/* Search + controls */}
      <div className="flex items-center gap-2 p-2 border-b border-border shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter files…" className="h-7 text-xs pl-6 bg-muted/20 border-border" />
        </div>
        <button onClick={() => setZoom((z) => Math.min(z + 0.2, 3))} className="p-1.5 rounded border border-border text-muted-foreground hover:text-foreground">
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => setZoom((z) => Math.max(z - 0.2, 0.3))} className="p-1.5 rounded border border-border text-muted-foreground hover:text-foreground">
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <button onClick={resetView} className="p-1.5 rounded border border-border text-muted-foreground hover:text-foreground">
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Graph */}
      <div className="flex-1 overflow-hidden bg-[#0d1117] relative">
        {nodes.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center p-6">
            <Network className="w-8 h-8 text-muted-foreground/30" />
            <p className="text-sm font-medium text-foreground">No source files found</p>
            <p className="text-xs text-muted-foreground">Add TypeScript or JavaScript files with import statements to see the dependency graph.</p>
          </div>
        ) : (
          <svg
            ref={svgRef}
            width="100%"
            height="100%"
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            className="select-none"
            style={{ cursor: dragging?.panStart ? "grabbing" : "grab" }}
            onMouseDown={handleSvgMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`} style={{ transformOrigin: "center" }}>
              {/* Edges */}
              {edges.map((edge, i) => {
                const src = nodeMap.get(edge.source);
                const tgt = nodeMap.get(edge.target);
                if (!src || !tgt) return null;
                const dimmed = search ? (!filtered.has(edge.source) && !filtered.has(edge.target)) : false;
                return (
                  <line
                    key={i}
                    x1={src.x} y1={src.y}
                    x2={tgt.x} y2={tgt.y}
                    stroke={edge.isCircular ? "#ef4444" : "#334155"}
                    strokeWidth={edge.isCircular ? 1.5 : 0.8}
                    strokeDasharray={edge.isCircular ? "4 2" : undefined}
                    opacity={dimmed ? 0.1 : (hoveredId && hoveredId !== edge.source && hoveredId !== edge.target) ? 0.15 : 0.7}
                  />
                );
              })}

              {/* Arrow markers */}
              <defs>
                <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L6,3 z" fill="#475569" />
                </marker>
              </defs>

              {/* Nodes */}
              {nodes.map((node) => {
                const dimmed = search ? !filtered.has(node.id) : false;
                const isHovered = hoveredId === node.id;
                const color = node.isCircular ? "#ef4444" : "#6366f1";
                const labelShort = node.label.length > 18 ? node.label.slice(0, 16) + "…" : node.label;
                return (
                  <g
                    key={node.id}
                    data-node="true"
                    transform={`translate(${node.x},${node.y})`}
                    opacity={dimmed ? 0.15 : 1}
                    onMouseEnter={() => setHoveredId(node.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={() => onFileOpen?.(node.id)}
                    style={{ cursor: "pointer" }}
                  >
                    <circle
                      r={isHovered ? 9 : 7}
                      fill={color}
                      fillOpacity={isHovered ? 0.9 : 0.75}
                      stroke={isHovered ? "white" : color}
                      strokeWidth={isHovered ? 1.5 : 1}
                    />
                    <text
                      y={18}
                      textAnchor="middle"
                      fontSize={isHovered ? 9 : 8}
                      fill={isHovered ? "#e2e8f0" : "#94a3b8"}
                      fontFamily="ui-monospace, monospace"
                    >
                      {labelShort}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        )}

        {/* Hovered tooltip */}
        {hoveredId && (
          <div className="absolute bottom-10 left-3 right-3 bg-background/95 backdrop-blur border border-border rounded-lg px-3 py-2 pointer-events-none">
            <p className="text-[10px] font-mono text-foreground truncate">{hoveredId}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {edges.filter((e) => e.target === hoveredId).length} imports in ·{" "}
              {edges.filter((e) => e.source === hoveredId).length} imports out
              {nodeMap.get(hoveredId)?.isCircular && " · ⚠ circular dependency"}
            </p>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="shrink-0 px-3 py-2 border-t border-border flex items-center gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-indigo-500 inline-block" /> Normal import</span>
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-red-500 inline-block rounded" style={{ backgroundImage: "repeating-linear-gradient(to right, #ef4444 0, #ef4444 4px, transparent 4px, transparent 6px)" }} /> Circular</span>
        <span>· Click node to open file</span>
      </div>
    </div>
  );
}
