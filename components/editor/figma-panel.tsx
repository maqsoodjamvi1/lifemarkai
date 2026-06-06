"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Figma, Link, Key, ArrowRight, Loader2,
  CheckCircle2, AlertCircle, Sparkles, ChevronDown, ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface FigmaPanelProps {
  projectId: string;
  onGenerateFromFigma: (prompt: string) => void;
}

interface FigmaSummary {
  fileName: string;
  fileKey: string;
  pages: string[];
  componentCount: number;
  aiPrompt: string;
}

export function FigmaPanel({ projectId, onGenerateFromFigma }: FigmaPanelProps) {
  const [figmaUrl, setFigmaUrl] = useState("");
  const [figmaToken, setFigmaToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<FigmaSummary | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");

  async function handleFetch() {
    if (!figmaUrl.trim() || !figmaToken.trim()) return;
    setLoading(true);
    setError(null);
    setSummary(null);

    try {
      const res = await fetch("/api/figma", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ figmaUrl, figmaToken }),
      });
      const data = await res.json() as FigmaSummary & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to fetch Figma file");
        return;
      }
      setSummary(data);
      setCustomPrompt(data.aiPrompt);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  function handleGenerate() {
    if (!customPrompt.trim()) return;
    onGenerateFromFigma(customPrompt);
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <div className="w-6 h-6 rounded-md bg-[#1e1e2e] flex items-center justify-center">
          <Figma className="w-3.5 h-3.5 text-violet-400" />
        </div>
        <span className="text-sm font-semibold">Figma Import</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Intro */}
        <div className="rounded-xl border border-border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Paste your Figma file URL and a personal access token to import the design
            and let AI convert it into React components.
          </p>
          <a
            href="https://www.figma.com/settings"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-violet-400 hover:underline mt-1 inline-block"
          >
            Get your Figma token →
          </a>
        </div>

        {/* Figma URL */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium flex items-center gap-1.5">
            <Link className="w-3 h-3" />
            Figma File URL
          </Label>
          <Input
            placeholder="https://www.figma.com/file/…"
            value={figmaUrl}
            onChange={(e) => setFigmaUrl(e.target.value)}
            className="text-sm h-9"
          />
        </div>

        {/* Personal token */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium flex items-center gap-1.5">
            <Key className="w-3 h-3" />
            Personal Access Token
          </Label>
          <Input
            type="password"
            placeholder="figd_…"
            value={figmaToken}
            onChange={(e) => setFigmaToken(e.target.value)}
            className="text-sm h-9 font-mono"
          />
          <p className="text-[11px] text-muted-foreground">
            Token is sent directly to Figma — never stored.
          </p>
        </div>

        {/* Fetch button */}
        <Button
          className="w-full gap-2 bg-gradient-to-r from-violet-500 to-blue-500 text-white hover:opacity-90"
          onClick={handleFetch}
          disabled={loading || !figmaUrl.trim() || !figmaToken.trim()}
        >
          {loading ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Importing…</>
          ) : (
            <><Figma className="w-3.5 h-3.5" /> Import from Figma</>
          )}
        </Button>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {/* Summary card */}
        <AnimatePresence>
          {summary && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-3 space-y-3"
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                <div>
                  <p className="text-sm font-semibold truncate">{summary.fileName}</p>
                  <p className="text-xs text-muted-foreground">
                    {summary.pages.length} page{summary.pages.length !== 1 ? "s" : ""} ·{" "}
                    {summary.componentCount} components
                  </p>
                </div>
              </div>

              {/* Pages list */}
              <div className="flex flex-wrap gap-1">
                {summary.pages.map((page) => (
                  <span
                    key={page}
                    className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border"
                  >
                    {page}
                  </span>
                ))}
              </div>

              {/* Prompt preview */}
              <div>
                <button
                  onClick={() => setShowPrompt((v) => !v)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPrompt ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {showPrompt ? "Hide" : "Edit"} AI prompt
                </button>

                <AnimatePresence>
                  {showPrompt && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <textarea
                        className="mt-2 w-full h-36 text-xs font-mono bg-muted/40 border border-border rounded-lg p-2 resize-none focus:outline-none focus:ring-1 focus:ring-violet-500"
                        value={customPrompt}
                        onChange={(e) => setCustomPrompt(e.target.value)}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Generate button */}
              <Button
                className="w-full gap-2 bg-gradient-to-r from-violet-500 to-blue-500 text-white hover:opacity-90"
                onClick={handleGenerate}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Generate React Components
                <ArrowRight className="w-3.5 h-3.5 ml-auto" />
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tips */}
        {!summary && !loading && (
          <div className="space-y-2 pt-2">
            <p className="text-xs font-medium text-muted-foreground">Tips</p>
            {[
              "Use frames/artboards as top-level pages for best results",
              "Name your components clearly — the AI uses the names",
              "Auto-layout frames convert well to Flexbox/Grid",
            ].map((tip) => (
              <div key={tip} className="flex items-start gap-2 text-xs text-muted-foreground">
                <span className="text-violet-400 mt-0.5">•</span>
                {tip}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
