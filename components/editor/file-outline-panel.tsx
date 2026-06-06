"use client";

import { useMemo, useState } from "react";
import { ChevronRight, ChevronDown, Box, FunctionSquare, Type, Hash, Component } from "lucide-react";
import type { ProjectFile } from "@/types/database";

// ── Symbol types ──────────────────────────────────────────────────────────────

type SymbolKind = "component" | "function" | "interface" | "type" | "class" | "const" | "hook";

interface OutlineSymbol {
  name: string;
  kind: SymbolKind;
  line: number; // 1-based
}

// ── Parser ────────────────────────────────────────────────────────────────────

const PATTERNS: Array<{ kind: SymbolKind; re: RegExp }> = [
  // React components: export default function Foo / export function Foo / const Foo = () =>
  {
    kind: "component",
    re: /^export\s+(?:default\s+)?function\s+([A-Z][A-Za-z0-9_]*)\s*[\(<]/gm,
  },
  {
    kind: "component",
    re: /^(?:export\s+)?const\s+([A-Z][A-Za-z0-9_]*)\s*(?::\s*React\.FC[^=]*)?\s*=\s*(?:React\.memo\(|React\.forwardRef\(|\(|async\s*\()/gm,
  },
  // Hooks
  {
    kind: "hook",
    re: /^(?:export\s+)?(?:function|const)\s+(use[A-Z][A-Za-z0-9_]*)\s*[=(]/gm,
  },
  // Regular functions
  {
    kind: "function",
    re: /^(?:export\s+)?(?:async\s+)?function\s+([a-z][A-Za-z0-9_]*)\s*\(/gm,
  },
  // Arrow function consts (lowercase = not component)
  {
    kind: "function",
    re: /^export\s+const\s+([a-z][A-Za-z0-9_]*)\s*=\s*(?:async\s*)?\(/gm,
  },
  // Interfaces
  {
    kind: "interface",
    re: /^(?:export\s+)?interface\s+([A-Za-z][A-Za-z0-9_]*)\s*[{<]/gm,
  },
  // Type aliases
  {
    kind: "type",
    re: /^(?:export\s+)?type\s+([A-Za-z][A-Za-z0-9_]*)\s*[=<]/gm,
  },
  // Classes
  {
    kind: "class",
    re: /^(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z][A-Za-z0-9_]*)\s*[{<(e]/gm,
  },
  // Top-level const exports (primitives/objects)
  {
    kind: "const",
    re: /^export\s+const\s+([A-Z_][A-Za-z0-9_]*)\s*[=:]/gm,
  },
];

function parseSymbols(content: string): OutlineSymbol[] {
  const lines = content.split("\n");
  const lineOffsets: number[] = [];
  let offset = 0;
  for (const line of lines) {
    lineOffsets.push(offset);
    offset += line.length + 1;
  }

  const getLine = (charIndex: number): number => {
    let lo = 0;
    let hi = lineOffsets.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineOffsets[mid] <= charIndex) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1; // 1-based
  };

  const seen = new Set<string>(); // dedup by name+line
  const symbols: OutlineSymbol[] = [];

  for (const { kind, re } of PATTERNS) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(content)) !== null) {
      const name = match[1];
      const line = getLine(match.index);
      const key = `${line}:${name}`;
      if (!seen.has(key)) {
        seen.add(key);
        symbols.push({ name, kind, line });
      }
    }
  }

  // Sort by line number
  symbols.sort((a, b) => a.line - b.line);

  return symbols;
}

// ── Icons + colours ──────────────────────────────────────────────────────────

const KIND_META: Record<SymbolKind, { label: string; color: string; Icon: React.ElementType }> = {
  component: { label: "C", color: "text-[#61dafb]", Icon: Component },
  hook:      { label: "H", color: "text-[#c792ea]", Icon: FunctionSquare },
  function:  { label: "f", color: "text-[#82aaff]", Icon: FunctionSquare },
  interface: { label: "I", color: "text-[#a3e635]", Icon: Type },
  type:      { label: "T", color: "text-[#fbbf24]", Icon: Type },
  class:     { label: "Cl", color: "text-[#f97316]", Icon: Box },
  const:     { label: "K", color: "text-[#94a3b8]", Icon: Hash },
};

// ── Component ────────────────────────────────────────────────────────────────

interface FileOutlinePanelProps {
  file: ProjectFile | null;
}

export function FileOutlinePanel({ file }: FileOutlinePanelProps) {
  const [open, setOpen] = useState(true);

  const symbols = useMemo(() => {
    if (!file?.content) return [];
    const ext = file.path.split(".").pop()?.toLowerCase() ?? "";
    if (!["ts", "tsx", "js", "jsx"].includes(ext)) return [];
    return parseSymbols(file.content);
  }, [file?.content, file?.path]);

  if (!file || symbols.length === 0) return null;

  const handleClick = (line: number) => {
    window.dispatchEvent(
      new CustomEvent("monaco-reveal-line", { detail: { line } })
    );
  };

  return (
    <div className="border-t border-[#1e1e2e] shrink-0">
      {/* Header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 w-full px-3 py-1.5 text-[10px] font-semibold text-[#585b70] uppercase tracking-wider hover:text-[#a6adc8] transition-colors"
      >
        <span className="text-[#585b70]">
          {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </span>
        Outline
        <span className="ml-auto text-[9px] normal-case font-normal text-[#45475a]">
          {symbols.length}
        </span>
      </button>

      {open && (
        <div className="overflow-y-auto max-h-48 pb-1">
          {symbols.map((sym, idx) => {
            const meta = KIND_META[sym.kind];
            return (
              <button
                key={idx}
                onClick={() => handleClick(sym.line)}
                title={`${sym.kind} — line ${sym.line}`}
                className="flex items-center gap-1.5 w-full px-3 py-0.5 text-left hover:bg-[#313244]/60 transition-colors group"
              >
                <span className={`text-[9px] font-bold w-4 shrink-0 text-center font-mono ${meta.color}`}>
                  {meta.label}
                </span>
                <span className="text-[11px] text-[#a6adc8] group-hover:text-[#cdd6f4] truncate font-mono">
                  {sym.name}
                </span>
                <span className="ml-auto text-[9px] text-[#45475a] shrink-0 tabular-nums">
                  {sym.line}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
