"use client";

import { useState, useEffect } from "react";
import { BookOpen, Sparkles, Copy, Check, Loader2, Download, RefreshCw, FileText, ChevronDown, ChevronUp, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { BALANCED_CODING_MODEL } from "@/lib/ai/model-defaults";

interface ChangelogPanelProps {
  projectId: string;
  onInsertChangelog: (prompt: string) => void;
}

interface ChangelogEntry {
  version: string;
  date: string;
  sections: {
    type: "Features" | "Fixes" | "Improvements" | "Breaking" | "Security";
    items: string[];
  }[];
}

interface RawMessage {
  role: string;
  content: string;
  created_at: string;
  title?: string;
}

const SECTION_COLORS: Record<string, string> = {
  Features:     "text-emerald-400 border-emerald-500/30 bg-emerald-500/5",
  Fixes:        "text-amber-400 border-amber-500/30 bg-amber-500/5",
  Improvements: "text-sky-400 border-sky-500/30 bg-sky-500/5",
  Breaking:     "text-red-400 border-red-500/30 bg-red-500/5",
  Security:     "text-violet-400 border-violet-500/30 bg-violet-500/5",
};

const SECTION_EMOJIS: Record<string, string> = {
  Features: "✨", Fixes: "🐛", Improvements: "⚡", Breaking: "💥", Security: "🔒",
};

function generateMarkdown(entries: ChangelogEntry[]): string {
  const lines = ["# Changelog\n", "All notable changes to this project will be documented here.\n"];
  for (const entry of entries) {
    lines.push(`## [${entry.version}] — ${entry.date}\n`);
    for (const section of entry.sections) {
      lines.push(`### ${SECTION_EMOJIS[section.type] ?? ""} ${section.type}\n`);
      for (const item of section.items) {
        lines.push(`- ${item}`);
      }
      lines.push("");
    }
  }
  return lines.join("\n");
}

async function generateChangelogFromMessages(
  messages: RawMessage[],
  projectName: string,
  signal: AbortSignal
): Promise<ChangelogEntry[]> {
  const summaries = messages
    .filter((m) => m.role === "user" && m.content.length > 20)
    .slice(-30)
    .map((m) => `- ${new Date(m.created_at).toLocaleDateString()}: ${m.content.slice(0, 150)}`)
    .join("\n");

  const systemPrompt = `You are a technical writer generating a user-facing changelog.

Return ONLY valid JSON — an array of changelog entry objects with this shape:
[{
  "version": "1.x.0",
  "date": "YYYY-MM-DD",
  "sections": [{
    "type": "Features" | "Fixes" | "Improvements" | "Breaking" | "Security",
    "items": ["string description of change"]
  }]
}]

Rules:
- Group messages by approximate time period into 1-3 versions
- Convert raw developer prompts into friendly, user-facing change descriptions
- Use present tense: "Add X", "Fix Y", "Improve Z"
- Keep each item concise (one line max)
- Skip duplicate/similar prompts
- Start version numbers from 1.0.0 and increment appropriately`;

  const res = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: `Project: ${projectName}\n\nDevelopment history:\n${summaries || "No messages yet — generate a sample changelog for a new project."}` }],
      model: BALANCED_CODING_MODEL,
      system: systemPrompt,
      mode: "chat",
      projectId: "changelog",
      response_format: { type: "json_object" },
    }),
    signal,
  });

  if (!res.ok || !res.body) throw new Error("AI request failed");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let accumulated = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value);
    for (const line of chunk.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") break;
      try {
        const parsed = JSON.parse(data) as { content?: string };
        if (parsed.content) accumulated += parsed.content;
      } catch { /* skip */ }
    }
  }

  const jsonMatch = accumulated.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    // Try object wrapper
    const objMatch = accumulated.match(/\{[\s\S]*\}/);
    if (objMatch) {
      const obj = JSON.parse(objMatch[0]) as { entries?: ChangelogEntry[] };
      return obj.entries ?? [];
    }
    throw new Error("No JSON array in response");
  }
  return JSON.parse(jsonMatch[0]) as ChangelogEntry[];
}

export function ChangelogPanel({ projectId, onInsertChangelog }: ChangelogPanelProps) {
  const [messages, setMessages] = useState<RawMessage[]>([]);
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const [expandedVersion, setExpandedVersion] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [projectName, setProjectName] = useState("My App");
  const [abortCtrl, setAbortCtrl] = useState<AbortController | null>(null);

  // Load messages + project name
  useEffect(() => {
    Promise.all([
      fetch(`/api/projects/${projectId}/messages?limit=50`).then((r) => r.ok ? r.json() : { messages: [] }),
      fetch(`/api/projects/${projectId}`).then((r) => r.ok ? r.json() : null),
    ]).then(([msgData, projData]) => {
      setMessages((msgData as { messages: RawMessage[] }).messages ?? []);
      if (projData?.project?.name) setProjectName(projData.project.name);
      setMessagesLoaded(true);
    }).catch(() => setMessagesLoaded(true));
  }, [projectId]);

  async function generate() {
    if (loading) { abortCtrl?.abort(); return; }
    const ctrl = new AbortController();
    setAbortCtrl(ctrl);
    setLoading(true);
    setEntries([]);
    try {
      const result = await generateChangelogFromMessages(messages, projectName, ctrl.signal);
      setEntries(result);
      if (result.length > 0) setExpandedVersion(result[0].version);
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== "AbortError") {
        toast({ title: "Generation failed", variant: "destructive" });
      }
    } finally {
      setLoading(false);
    }
  }

  function copyMarkdown() {
    if (entries.length === 0) return;
    navigator.clipboard.writeText(generateMarkdown(entries));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function insertAsFile() {
    if (entries.length === 0) return;
    const md = generateMarkdown(entries);
    onInsertChangelog(`Create a CHANGELOG.md file in the project root with this content:\n\n${md}`);
  }

  function downloadMarkdown() {
    const md = generateMarkdown(entries);
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "CHANGELOG.md"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col h-full text-sm">
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 mb-1">
          <BookOpen className="w-4 h-4 text-violet-400" />
          <h2 className="font-semibold text-foreground">Changelog Generator</h2>
          {entries.length > 0 && (
            <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-violet-500/30 text-violet-400">
              {entries.length} versions
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">Auto-generate a changelog from your AI chat history</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Context summary */}
        <div className="rounded-xl border border-border bg-muted/20 p-3 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-foreground">{projectName}</p>
            <p className="text-[10px] text-muted-foreground">{messages.length} messages in history</p>
          </div>
          <Badge variant="outline" className={`text-[10px] h-5 px-1.5 ${messagesLoaded ? "border-emerald-500/40 text-emerald-400" : "border-border text-muted-foreground"}`}>
            {messagesLoaded ? "Ready" : "Loading…"}
          </Badge>
        </div>

        {loading && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
            <p className="text-xs text-muted-foreground">Analysing chat history and generating changelog…</p>
          </div>
        )}

        {entries.length > 0 && !loading && (
          <div className="space-y-3">
            {/* Action bar */}
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-none gap-1 text-xs" onClick={copyMarkdown}>
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                Copy MD
              </Button>
              <Button size="sm" variant="outline" className="flex-none gap-1 text-xs" onClick={downloadMarkdown}>
                <Download className="w-3 h-3" /> Download
              </Button>
              <Button size="sm" className="flex-1 gap-1 text-xs" onClick={insertAsFile}>
                <FileText className="w-3 h-3" /> Save as CHANGELOG.md
              </Button>
            </div>

            {/* Version entries */}
            {entries.map((entry) => (
              <div key={entry.version} className="rounded-xl border border-border bg-muted/10 overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/20 transition-colors"
                  onClick={() => setExpandedVersion(expandedVersion === entry.version ? null : entry.version)}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-bold text-foreground">v{entry.version}</span>
                    <span className="text-xs text-muted-foreground">{entry.date}</span>
                    <div className="flex gap-1">
                      {entry.sections.map((s) => (
                        <span key={s.type} title={s.type} className="text-sm">{SECTION_EMOJIS[s.type]}</span>
                      ))}
                    </div>
                  </div>
                  {expandedVersion === entry.version
                    ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                    : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                </button>

                {expandedVersion === entry.version && (
                  <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
                    {entry.sections.map((section) => (
                      <div key={section.type}>
                        <div className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-md border mb-2 ${SECTION_COLORS[section.type]}`}>
                          {SECTION_EMOJIS[section.type]} {section.type}
                        </div>
                        <ul className="space-y-1">
                          {section.items.map((item, i) => (
                            <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                              <span className="text-muted-foreground/40 shrink-0 mt-0.5">—</span>
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {!loading && entries.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <BookOpen className="w-8 h-8 text-muted-foreground/40" />
            <p className="text-sm font-medium text-foreground">No changelog yet</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              Click Generate to create a user-facing changelog from your AI chat history.
            </p>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-border flex gap-2">
        {entries.length > 0 && !loading && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={generate}>
            <RefreshCw className="w-3.5 h-3.5" /> Regenerate
          </Button>
        )}
        <Button size="sm" className="flex-1 gap-1.5" onClick={generate} disabled={loading || !messagesLoaded}>
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {loading ? "Stop" : "Generate Changelog"}
        </Button>
      </div>
    </div>
  );
}
