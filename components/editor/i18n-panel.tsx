"use client";

/**
 * I18nPanel
 * Scans .tsx / .jsx files for hardcoded user-facing strings,
 * shows them in a list, and generates translation JSON files via AI.
 */

import { useState, useMemo } from "react";
import {
  Globe, Search, Wand2, Copy, Check, ChevronDown, ChevronRight,
  Languages, FileJson, AlertCircle, RefreshCw, Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ProjectFile } from "@/types/database";

// ─── Locale catalogue ────────────────────────────────────────────────────────

interface Locale {
  code: string;
  label: string;
  flag: string;
}

const LOCALES: Locale[] = [
  { code: "en", label: "English",    flag: "🇬🇧" },
  { code: "es", label: "Spanish",    flag: "🇪🇸" },
  { code: "fr", label: "French",     flag: "🇫🇷" },
  { code: "de", label: "German",     flag: "🇩🇪" },
  { code: "pt", label: "Portuguese", flag: "🇵🇹" },
  { code: "ja", label: "Japanese",   flag: "🇯🇵" },
  { code: "zh", label: "Chinese",    flag: "🇨🇳" },
  { code: "ar", label: "Arabic",     flag: "🇸🇦" },
  { code: "hi", label: "Hindi",      flag: "🇮🇳" },
  { code: "ko", label: "Korean",     flag: "🇰🇷" },
];

// ─── String extraction ───────────────────────────────────────────────────────

interface DetectedString {
  text: string;
  file: string;
  line: number;
  context: string; // surrounding code snippet
  key: string;    // suggested translation key
}

const SKIP_PATTERNS = [
  /^https?:\/\//,          // URLs
  /^\/[a-z]/,              // paths
  /^\d+$/,                 // pure numbers
  /^[A-Z_]{3,}$/,          // constants
  /^#[0-9a-f]{3,6}$/i,    // hex colors
  /^[\s\.\-_,;:!?]*$/,     // punctuation/whitespace only
  /^\$\{/,                 // template literal start
];

function shouldSkip(s: string): boolean {
  const trimmed = s.trim();
  if (trimmed.length < 2 || trimmed.length > 200) return true;
  return SKIP_PATTERNS.some((re) => re.test(trimmed));
}

function toKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 40);
}

function extractStrings(files: ProjectFile[]): DetectedString[] {
  const results: DetectedString[] = [];
  const seen = new Set<string>();

  const jsxFiles = files.filter((f) => /\.(tsx|jsx)$/.test(f.path));

  for (const file of jsxFiles) {
    if (!file.content) continue;
    const lines = file.content.split("\n");

    lines.forEach((line, idx) => {
      // Match JSX text content: >Some text here<
      const jsxTextRe = />([^{}<>\n]+)</g;
      let m: RegExpExecArray | null;
      while ((m = jsxTextRe.exec(line)) !== null) {
        const raw = m[1].trim();
        if (!raw || shouldSkip(raw) || seen.has(raw)) continue;
        seen.add(raw);
        results.push({
          text: raw,
          file: file.path,
          line: idx + 1,
          context: line.trim().slice(0, 80),
          key: toKey(raw),
        });
      }

      // Match string literals in attributes: placeholder="..." aria-label="..."
      const attrRe = /(?:placeholder|title|aria-label|alt|label|description)=["']([^"']{3,100})["']/g;
      while ((m = attrRe.exec(line)) !== null) {
        const raw = m[1].trim();
        if (!raw || shouldSkip(raw) || seen.has(raw)) continue;
        seen.add(raw);
        results.push({
          text: raw,
          file: file.path,
          line: idx + 1,
          context: line.trim().slice(0, 80),
          key: toKey(raw),
        });
      }
    });
  }

  return results.slice(0, 200); // cap at 200 to keep UI manageable
}

// ─── Main Panel ──────────────────────────────────────────────────────────────

interface I18nPanelProps {
  files: ProjectFile[];
  onGenerateTranslations: (prompt: string) => void;
}

export function I18nPanel({ files, onGenerateTranslations }: I18nPanelProps) {
  const [search, setSearch] = useState("");
  const [selectedLocales, setSelectedLocales] = useState<string[]>(["es", "fr"]);
  const [showLocales, setShowLocales] = useState(false);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const allStrings = useMemo(() => extractStrings(files), [files]);

  const filtered = useMemo(
    () =>
      allStrings.filter(
        (s) =>
          s.text.toLowerCase().includes(search.toLowerCase()) ||
          s.file.toLowerCase().includes(search.toLowerCase())
      ),
    [allStrings, search]
  );

  // Group by file
  const byFile = useMemo(() => {
    const map = new Map<string, DetectedString[]>();
    for (const s of filtered) {
      if (!map.has(s.file)) map.set(s.file, []);
      map.get(s.file)!.push(s);
    }
    return map;
  }, [filtered]);

  function toggleLocale(code: string) {
    setSelectedLocales((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  }

  function toggleFile(path: string) {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function copyKey(key: string) {
    void navigator.clipboard.writeText(`t("${key}")`);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  }

  function handleGenerate() {
    const keys = allStrings.slice(0, 80);
    const enJson = Object.fromEntries(keys.map((s) => [s.key, s.text]));
    const localeNames = selectedLocales
      .map((c) => LOCALES.find((l) => l.code === c)?.label)
      .filter(Boolean)
      .join(", ");

    const prompt = `Generate i18n translation files for my Next.js app.

Here is the English translation file (translations/en.json):
\`\`\`json
${JSON.stringify(enJson, null, 2)}
\`\`\`

Please:
1. Create the file \`translations/en.json\` with the content above.
2. Create translation files for: ${localeNames} (${selectedLocales.join(", ")}).
3. For each locale, create \`translations/[locale].json\` with all keys translated accurately.
4. Create a \`lib/i18n.ts\` helper that loads the correct locale based on a language cookie/header.
5. Show me how to wrap my components with the translation helper using a \`t()\` function.`;

    onGenerateTranslations(prompt);
  }

  function handleDownloadJson() {
    const keys = allStrings.slice(0, 200);
    const enJson = Object.fromEntries(keys.map((s) => [s.key, s.text]));
    const blob = new Blob([JSON.stringify(enJson, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "en.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border shrink-0">
        <Globe className="w-4 h-4 text-sky-400 shrink-0" />
        <span className="text-xs font-semibold flex-1">Internationalization</span>
        <Badge variant="outline" className="text-[10px] h-4 px-1.5">
          {allStrings.length} strings
        </Badge>
      </div>

      {/* Info row */}
      {allStrings.length === 0 ? null : (
        <div className="flex items-center gap-1.5 px-3 py-2 bg-sky-500/5 border-b border-sky-500/10 shrink-0">
          <Languages className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          <p className="text-[10px] text-sky-300 flex-1">
            {allStrings.length} hardcoded strings detected across {byFile.size} file{byFile.size !== 1 ? "s" : ""}.
          </p>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter strings…"
            className="h-7 pl-6 text-xs"
          />
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1 px-2 shrink-0"
          onClick={handleDownloadJson}
          title="Download en.json"
          disabled={allStrings.length === 0}
        >
          <Download className="w-3 h-3" />
        </Button>
      </div>

      {/* Locale picker */}
      <div className="border-b border-border shrink-0">
        <button
          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/40 text-xs"
          onClick={() => setShowLocales((v) => !v)}
        >
          <span className="flex-1 text-left font-medium">
            Target locales ({selectedLocales.length} selected)
          </span>
          {showLocales ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </button>
        {showLocales && (
          <div className="px-3 pb-2 grid grid-cols-2 gap-1">
            {LOCALES.filter((l) => l.code !== "en").map((locale) => (
              <button
                key={locale.code}
                onClick={() => toggleLocale(locale.code)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px] transition-all ${
                  selectedLocales.includes(locale.code)
                    ? "border-sky-500/40 bg-sky-500/10 text-sky-300"
                    : "border-border text-muted-foreground hover:bg-muted/40"
                }`}
              >
                <span>{locale.flag}</span>
                <span>{locale.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* String list */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-2">
          {allStrings.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 flex items-center justify-center">
                <Globe className="w-5 h-5 text-sky-400" />
              </div>
              <div>
                <p className="text-sm font-medium">No strings detected</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                  Add .tsx or .jsx files with user-facing text and they&apos;ll appear here.
                </p>
              </div>
            </div>
          ) : (
            Array.from(byFile.entries()).map(([filePath, strings]) => (
              <div key={filePath} className="rounded-lg border border-border overflow-hidden">
                <button
                  className="w-full flex items-center gap-2 px-2.5 py-2 bg-muted/20 hover:bg-muted/40 text-left"
                  onClick={() => toggleFile(filePath)}
                >
                  <FileJson className="w-3 h-3 text-sky-400 shrink-0" />
                  <span className="text-[10px] font-mono flex-1 truncate">{filePath}</span>
                  <Badge variant="outline" className="text-[9px] h-4 px-1">{strings.length}</Badge>
                  {expandedFiles.has(filePath)
                    ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
                    : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
                </button>

                {expandedFiles.has(filePath) && (
                  <div className="divide-y divide-border/40">
                    {strings.map((s) => (
                      <div key={s.key} className="px-2.5 py-2 flex items-start gap-2 group">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{s.text}</p>
                          <p className="text-[9px] text-muted-foreground font-mono mt-0.5">
                            key: <span className="text-sky-400/80">{s.key}</span>
                            <span className="ml-2 text-muted-foreground/60">L{s.line}</span>
                          </p>
                        </div>
                        <button
                          className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => copyKey(s.key)}
                          title='Copy t("key")'
                        >
                          {copiedKey === s.key
                            ? <Check className="w-3 h-3 text-emerald-400" />
                            : <Copy className="w-3 h-3 text-muted-foreground hover:text-foreground" />}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Footer — generate button */}
      <div className="border-t border-border px-3 py-3 space-y-2 shrink-0">
        {selectedLocales.length === 0 && (
          <div className="flex items-center gap-1.5 text-[10px] text-amber-400">
            <AlertCircle className="w-3 h-3 shrink-0" />
            Select at least one target locale
          </div>
        )}
        <Button
          className="w-full h-8 gap-1.5 text-xs"
          onClick={handleGenerate}
          disabled={allStrings.length === 0 || selectedLocales.length === 0}
        >
          <Wand2 className="w-3.5 h-3.5" />
          Generate translations with AI
          {selectedLocales.length > 0 && (
            <span className="ml-1 opacity-70">
              ({selectedLocales.map((c) => LOCALES.find((l) => l.code === c)?.flag).join(" ")})
            </span>
          )}
        </Button>
        <p className="text-[9px] text-muted-foreground text-center">
          Generates translations/en.json + one file per locale
        </p>
      </div>
    </div>
  );
}
