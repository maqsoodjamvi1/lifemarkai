
import React, { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Check, ChevronDown, ChevronUp, Copy, Download, FileCode2, Loader2 } from "lucide-react";
import { sanitizeSvg } from "@/lib/security/sanitize";

function MermaidBlock({ code }: { code: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function render() {
      try {
        setLoading(true);
        setError(null);
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "dark",
          themeVariables: {
            background: "#1e1e2e",
            primaryColor: "#7c3aed",
            primaryTextColor: "#cdd6f4",
            primaryBorderColor: "#313244",
            lineColor: "#6c7086",
            secondaryColor: "#313244",
            tertiaryColor: "#1e1e2e",
          },
        });
        const id = `mermaid-${Math.random().toString(36).slice(2)}`;
        const { svg: rendered } = await mermaid.render(id, code);
        if (!cancelled) {
          setSvg(sanitizeSvg(rendered));
          setLoading(false);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Diagram render failed");
          setLoading(false);
        }
      }
    }
    void render();
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-6 my-2 rounded-lg border border-border/40 bg-[#1e1e2e]">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Rendering diagram…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="my-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
        <p className="text-[10px] text-destructive font-mono">{error}</p>
        <pre className="mt-2 text-[10px] text-muted-foreground font-mono whitespace-pre-wrap">{code}</pre>
      </div>
    );
  }

  return (
    <div className="my-2 rounded-lg overflow-hidden border border-border/40 bg-[#1e1e2e]">
      <div className="flex items-center justify-between px-3 py-1 border-b border-border/30">
        <span className="text-[10px] text-[#6c7086] font-mono flex items-center gap-1">
          <span>📊</span> mermaid diagram
        </span>
        <button
          onClick={() => navigator.clipboard.writeText(code).catch(() => {})}
          className="text-[10px] text-[#6c7086] hover:text-[#cdd6f4] transition-colors px-1.5 py-0.5 rounded hover:bg-[#313244]/60"
        >
          Copy source
        </button>
      </div>
      <div ref={ref} className="p-4 overflow-x-auto" dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );
}

function SvgBlock({ code }: { code: string }) {
  const [showSource, setShowSource] = useState(false);
  const clean = useMemo(() => sanitizeSvg(code), [code]);

  function handleDownloadSvg() {
    const blob = new Blob([clean], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "image.svg";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="my-2 rounded-lg overflow-hidden border border-border/40 bg-[#1e1e2e]">
      <div className="flex items-center justify-between px-3 py-1 border-b border-border/30">
        <span className="text-[10px] text-[#6c7086] font-mono flex items-center gap-1">
          <span>🖼️</span> svg
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowSource((v) => !v)}
            className="text-[10px] text-[#6c7086] hover:text-[#cdd6f4] transition-colors px-1.5 py-0.5 rounded hover:bg-[#313244]/60"
          >
            {showSource ? "Preview" : "Source"}
          </button>
          <button
            onClick={() => navigator.clipboard.writeText(code).catch(() => {})}
            className="text-[10px] text-[#6c7086] hover:text-[#cdd6f4] transition-colors px-1.5 py-0.5 rounded hover:bg-[#313244]/60"
          >
            Copy
          </button>
          <button
            onClick={handleDownloadSvg}
            className="text-[10px] text-[#6c7086] hover:text-[#cdd6f4] transition-colors px-1.5 py-0.5 rounded hover:bg-[#313244]/60"
          >
            Download
          </button>
        </div>
      </div>
      {showSource ? (
        <pre className="p-3 text-[10px] text-muted-foreground font-mono whitespace-pre-wrap max-h-64 overflow-auto">{code}</pre>
      ) : (
        <div
          className="p-4 flex items-center justify-center [&>svg]:max-w-full [&>svg]:max-h-72"
          // Transparency checkerboard — inline style because Tailwind
          // arbitrary values can't contain spaces (the class never generated).
          style={{
            backgroundImage: "repeating-conic-gradient(#262637 0% 25%, transparent 0% 50%)",
            backgroundSize: "16px 16px",
          }}
          dangerouslySetInnerHTML={{ __html: clean }}
        />
      )}
    </div>
  );
}

function LovableChatCodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const [inserted, setInserted] = useState(false);
  const lineCount = code.split("\n").length;
  const [isCollapsed, setIsCollapsed] = useState(lineCount > 8);

  useEffect(() => {
    function handleSetAll(e: Event) {
      setIsCollapsed((e as CustomEvent<{ collapsed: boolean }>).detail.collapsed);
    }
    window.addEventListener("chat-codeblock-set-all", handleSetAll);
    return () => window.removeEventListener("chat-codeblock-set-all", handleSetAll);
  }, []);

  if (language === "mermaid") return <MermaidBlock code={code} />;
  if (language === "svg" || (code.trimStart().startsWith("<svg") && code.trimEnd().endsWith("</svg>"))) {
    return <SvgBlock code={code} />;
  }

  function handleCopy() {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  function handleInsert() {
    window.dispatchEvent(new CustomEvent("monaco-insert-code", { detail: { text: code } }));
    setInserted(true);
    setTimeout(() => setInserted(false), 1800);
  }

  const DOWNLOADABLE: Record<string, string> = {
    csv: "data.csv",
    json: "data.json",
    xml: "data.xml",
    yaml: "data.yaml",
    yml: "data.yaml",
    toml: "data.toml",
    txt: "output.txt",
    text: "output.txt",
    markdown: "output.md",
    md: "output.md",
    sql: "query.sql",
    sh: "script.sh",
    bash: "script.sh",
  };
  const downloadFilename = DOWNLOADABLE[language?.toLowerCase() ?? ""];

  function handleDownload() {
    const mimeMap: Record<string, string> = {
      csv: "text/csv",
      json: "application/json",
      xml: "application/xml",
      yaml: "text/yaml",
      yml: "text/yaml",
      sql: "text/plain",
    };
    const mime = mimeMap[language?.toLowerCase() ?? ""] ?? "text/plain";
    const blob = new Blob([code], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = downloadFilename ?? "file.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (isCollapsed) {
    return (
      <div
        className="relative my-2 rounded-lg border border-border/40 bg-[#1e1e2e] flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-[#24243e] transition-colors"
        onClick={() => setIsCollapsed(false)}
      >
        <FileCode2 className="w-3 h-3 text-[#6c7086] shrink-0" />
        <span className="text-[10px] text-[#6c7086] font-mono">{language || "code"}</span>
        <span className="text-[10px] text-[#45475a]">·</span>
        <span className="text-[10px] text-[#45475a] font-mono">
          {lineCount} line{lineCount !== 1 ? "s" : ""}
        </span>
        <ChevronDown className="w-3 h-3 text-[#6c7086] ml-auto" />
      </div>
    );
  }

  return (
    <div className="relative group my-2 rounded-lg overflow-hidden border border-border/40">
      <div className="flex items-center justify-between px-3 py-1 bg-[#1e1e2e] border-b border-border/30">
        <span className="text-[10px] text-[#6c7086] font-mono">{language || "code"}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsCollapsed(true)}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-[#6c7086] hover:text-[#cba6f7] hover:bg-[#313244]/60 transition-colors"
            title="Collapse code block"
          >
            <ChevronUp className="w-3 h-3" />
          </button>
          <button
            onClick={handleInsert}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors ${
              inserted ? "text-green-400 bg-green-500/10" : "text-[#6c7086] hover:text-[#cba6f7] hover:bg-[#313244]/60"
            }`}
            title="Insert at cursor in editor"
          >
            {inserted ? <Check className="w-3 h-3" /> : <FileCode2 className="w-3 h-3" />}
            {inserted ? "Inserted" : "Insert"}
          </button>
          {downloadFilename && (
            <button
              onClick={handleDownload}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-[#6c7086] hover:text-[#a6e3a1] hover:bg-[#313244]/60 transition-colors"
              title={`Download as ${downloadFilename}`}
            >
              <Download className="w-3 h-3" />
              Download
            </button>
          )}
          <button
            onClick={handleCopy}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors ${
              copied ? "text-green-400 bg-green-500/10" : "text-[#6c7086] hover:text-[#cdd6f4] hover:bg-[#313244]/60"
            }`}
            title="Copy code"
          >
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      <SyntaxHighlighter
        style={oneDark as Record<string, React.CSSProperties>}
        language={language || "text"}
        PreTag="div"
        customStyle={{ margin: 0, borderRadius: 0, fontSize: "0.78rem" }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

function linkifyLineRefs(content: string): string {
  const REF = /@([\w./\-]+\.\w{1,8}):(\d+)(?:-(\d+))?/g;
  const SECURITY = /@security-memory\b|Security Memory/g;
  return content
    .split(/(```[\s\S]*?```)/)
    .map((seg, i) => {
      if (i % 2 === 1) return seg;
      return seg
        .replace(SECURITY, () => `[Security Memory](#lm-security-memory)`)
        .replace(REF, (m, path, start) => `[${m}](#lm-ref/${encodeURIComponent(path)}/${start})`);
    })
    .join("");
}

export const LovableMessageContent = React.memo(function LovableMessageContent({
  content,
  mode: _mode,
}: {
  content: string;
  mode: string;
}) {
  const processed = useMemo(() => (content.includes("@") ? linkifyLineRefs(content) : content), [content]);
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ className, children, ...props }: React.ComponentPropsWithoutRef<"code"> & { inline?: boolean }) {
          const match = /language-(\w+)/.exec(className || "");
          const inline = !match;
          const code = String(children).replace(/\n$/, "");
          return !inline ? (
            <LovableChatCodeBlock language={match?.[1] ?? ""} code={code} />
          ) : (
            <code className="bg-muted/60 px-1 py-0.5 rounded text-[0.85em] font-mono" {...props}>
              {children}
            </code>
          );
        },
        p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
        ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-0.5">{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
        h1: ({ children }) => <h1 className="text-base font-bold mt-3 mb-1">{children}</h1>,
        h2: ({ children }) => <h2 className="text-sm font-semibold mt-3 mb-1">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-medium mt-2 mb-1">{children}</h3>,
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-muted-foreground/30 pl-3 italic text-muted-foreground my-2">
            {children}
          </blockquote>
        ),
        a: ({ href, children }) => {
          if (href === "#lm-security-memory") {
            return (
              <span
                data-mention="security-memory"
                className="group/pill inline-flex items-center gap-1 rounded-full border border-[color:var(--border-default)] bg-[var(--bg-secondary-pulse)] px-2 py-0.5 text-[11px] font-medium text-[var(--fg-secondary)] align-baseline"
              >
                <span aria-hidden className="size-1.5 rounded-full bg-emerald-500" />
                Security Memory
              </span>
            );
          }
          if (href?.startsWith("#lm-ref/")) {
            const [, encodedPath, lineStr] = href.split("/");
            return (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  window.dispatchEvent(
                    new CustomEvent("lifemark-open-file-at-line", {
                      detail: { path: decodeURIComponent(encodedPath ?? ""), line: parseInt(lineStr ?? "0", 10) },
                    }),
                  );
                }}
                className="inline-flex items-center gap-0.5 px-1.5 py-0 rounded-md bg-violet-500/10 border border-violet-500/25 text-violet-400 hover:bg-violet-500/20 font-mono text-[0.85em] align-baseline transition-colors"
                title="Open in editor at this line"
              >
                {children}
              </button>
            );
          }
          return (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:no-underline">
              {children}
            </a>
          );
        },
        // Lovable parity (Jul 14 2026): media in chat renders as clickable
        // thumbnails, not bare file paths / full-bleed images.
        img({ src, alt }: React.ComponentPropsWithoutRef<"img">) {
          if (!src) return null;
          return (
            <button
              type="button"
              onClick={() => window.open(src, "_blank", "noopener,noreferrer")}
              className="group/thumb my-1.5 inline-block overflow-hidden rounded-[var(--radius-3,12px)] border border-[color:var(--border-translucent)] bg-[var(--bg-muted)]/40 align-top"
              title={alt || "Open image"}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={alt ?? ""}
                loading="lazy"
                className="block max-h-56 max-w-full object-cover transition-transform duration-150 group-hover/thumb:scale-[1.02] cursor-zoom-in"
              />
              {alt && (
                <span className="block truncate px-2 py-1 text-[10px] text-[var(--fg-tertiary)]">{alt}</span>
              )}
            </button>
          );
        },
      }}
    >
      {processed}
    </ReactMarkdown>
  );
});

export const LovableHighlightedText = React.memo(function LovableHighlightedText({
  text,
  query,
}: {
  text: string;
  query: string;
}) {
  const q = query.trim();
  if (!q) return <p className="whitespace-pre-wrap leading-relaxed">{text}</p>;
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  const parts: React.ReactNode[] = [];
  let i = 0;
  let idx = lower.indexOf(needle);
  let key = 0;
  while (idx >= 0) {
    if (idx > i) parts.push(text.slice(i, idx));
    parts.push(
      <mark key={key++} className="bg-amber-400/40 text-inherit rounded-[2px] px-0.5">
        {text.slice(idx, idx + needle.length)}
      </mark>,
    );
    i = idx + needle.length;
    idx = lower.indexOf(needle, i);
  }
  if (i < text.length) parts.push(text.slice(i));
  return <p className="whitespace-pre-wrap leading-relaxed break-words">{parts}</p>;
});
