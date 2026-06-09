"use client";

import { useState, useEffect } from "react";
import {
  Sparkles, Copy, Check, Loader2, ChevronDown, ChevronUp,
  AlertTriangle, ToggleLeft, ToggleRight, Zap, Shield,
  RefreshCw, Code2, Info,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { createClient } from "@/lib/supabase/client";
import type { Project } from "@/types/database";

interface AiIntegrationPanelProps {
  project: Project;
  onProjectUpdate: (updated: Partial<Project>) => void;
}

const MODELS = [
  { value: "claude-opus-4-6",           label: "Claude Opus",       cost: "2 credits/call",  desc: "Best coding quality — recommended default" },
  { value: "claude-sonnet-4-6",         label: "Claude Sonnet",     cost: "1 credit/call",   desc: "Balanced quality and speed" },
  { value: "claude-haiku-4-5-20251001", label: "Claude Haiku",    cost: "0.5 credit/call", desc: "Fast, great for text summarisation" },
  { value: "gpt-4o-mini",               label: "GPT-4o Mini",       cost: "0.5 credit/call", desc: "Fast, affordable — best for chatbots" },
  { value: "gpt-4o",                    label: "GPT-4o",            cost: "1 credit/call",   desc: "Strong general reasoning" },
];

const CODE_SNIPPET = (projectId: string, model: string) => `// In your app — call the LifemarkAI managed AI proxy
// No API key needed — LifemarkAI handles authentication

async function askAI(userMessage: string, history = []) {
  const res = await fetch(
    "https://lifemarkai.app/api/projects/${projectId}/ai-proxy",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [...history, { role: "user", content: userMessage }],
        systemPrompt: "You are a helpful assistant.", // optional
        maxTokens: 500,
      }),
    }
  );
  const data = await res.json();
  return data.content; // the AI's response string
}

// Example usage in a React component:
const [reply, setReply] = useState("");
const handleSend = async () => {
  const answer = await askAI("What is the capital of France?");
  setReply(answer); // "Paris"
};`;

export function AiIntegrationPanel({ project, onProjectUpdate }: AiIntegrationPanelProps) {
  const { toast } = useToast();
  const supabase = createClient();

  const [enabled, setEnabled] = useState<boolean>(
    (project as any).ai_integration_enabled ?? false
  );
  const [model, setModel] = useState<string>(
    (project as any).ai_integration_model ?? "claude-opus-4-6"
  );
  const [creditLimit, setCreditLimit] = useState<number>(
    (project as any).ai_credit_limit ?? 100
  );
  const [creditsUsed, setCreditsUsed] = useState<number>(
    (project as any).ai_credits_used ?? 0
  );
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showCode, setShowCode] = useState(false);

  useEffect(() => {
    // Refresh usage count from Supabase
    void (async () => {
      const { data } = await (supabase as any)
        .from("projects")
        .select("ai_credits_used, ai_integration_enabled, ai_integration_model, ai_credit_limit")
        .eq("id", project.id)
        .single();
      if (data) {
        setEnabled(data.ai_integration_enabled ?? false);
        setModel(data.ai_integration_model ?? "claude-opus-4-6");
        setCreditLimit(data.ai_credit_limit ?? 100);
        setCreditsUsed(data.ai_credits_used ?? 0);
      }
    })();
  }, [project.id]);

  async function save() {
    setSaving(true);
    const { error } = await (supabase as any)
      .from("projects")
      .update({
        ai_integration_enabled: enabled,
        ai_integration_model: model,
        ai_credit_limit: creditLimit,
      })
      .eq("id", project.id);
    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } else {
      onProjectUpdate({ ai_integration_enabled: enabled } as Partial<Project>);
      toast({ title: enabled ? "AI integration enabled" : "AI integration disabled" });
    }
  }

  async function resetUsage() {
    const { error } = await (supabase as any)
      .from("projects")
      .update({ ai_credits_used: 0 })
      .eq("id", project.id);
    if (!error) {
      setCreditsUsed(0);
      toast({ title: "Usage counter reset" });
    }
  }

  function copyCode() {
    void navigator.clipboard.writeText(CODE_SNIPPET(project.id, model));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const usagePct = Math.min(100, Math.round((creditsUsed / creditLimit) * 100));

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-4 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500/20 to-indigo-500/20 border border-violet-500/20 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-violet-400" />
          </div>
          <div>
            <p className="text-sm font-semibold">AI for Your App</p>
            <p className="text-[11px] text-muted-foreground">Add AI to apps you build — no API keys needed</p>
          </div>
        </div>

        {/* How it works */}
        <div className="flex gap-2.5 p-3 rounded-lg border border-blue-500/20 bg-blue-500/5">
          <Info className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0" />
          <p className="text-[11px] text-blue-300 leading-relaxed">
            Enable this to expose a managed AI endpoint at <code className="font-mono">/api/projects/{project.id.slice(0,8)}…/ai-proxy</code>.
            Your deployed app calls it and LifemarkAI handles the OpenAI/Claude keys — users never see credentials.
          </p>
        </div>

        {/* Enable toggle */}
        <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-muted/20">
          <div>
            <p className="text-sm font-medium">Enable AI proxy</p>
            <p className="text-[11px] text-muted-foreground">Allow your app to call LifemarkAI's managed AI</p>
          </div>
          <button
            onClick={() => setEnabled(!enabled)}
            className="shrink-0"
            aria-label="Toggle AI proxy"
          >
            {enabled
              ? <ToggleRight className="w-8 h-8 text-violet-400" />
              : <ToggleLeft className="w-8 h-8 text-muted-foreground" />}
          </button>
        </div>

        {/* Model selector */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Model</label>
          <div className="space-y-1.5">
            {MODELS.map((m) => (
              <button
                key={m.value}
                onClick={() => setModel(m.value)}
                className={`w-full flex items-center gap-3 p-2.5 rounded-lg border text-left transition-all ${
                  model === m.value
                    ? "border-violet-500/50 bg-violet-500/5"
                    : "border-border hover:border-border/80"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium">{m.label}</span>
                    {model === m.value && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/20">
                        Selected
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-muted-foreground">{m.desc}</span>
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0">{m.cost}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Credit limit */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground">Credit limit</label>
            <span className="text-xs font-mono">{creditLimit} calls</span>
          </div>
          <input
            type="range"
            min={10}
            max={1000}
            step={10}
            value={creditLimit}
            onChange={(e) => setCreditLimit(Number(e.target.value))}
            className="w-full accent-violet-500"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground/50">
            <span>10</span><span>1000</span>
          </div>
        </div>

        {/* Usage meter */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Zap className="w-3 h-3 text-amber-400" />
              <span className="text-xs font-medium">Usage this month</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-muted-foreground">
                {creditsUsed} / {creditLimit}
              </span>
              <button onClick={resetUsage} title="Reset counter" className="text-muted-foreground/40 hover:text-muted-foreground transition-colors">
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>
          </div>
          <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${usagePct > 80 ? "bg-red-500" : usagePct > 50 ? "bg-amber-500" : "bg-violet-500"}`}
              style={{ width: `${usagePct}%` }}
            />
          </div>
          {usagePct > 80 && (
            <div className="flex items-center gap-1.5 text-[11px] text-amber-400">
              <AlertTriangle className="w-3 h-3" />
              Approaching credit limit — increase limit or reset
            </div>
          )}
        </div>

        {/* Security note */}
        <div className="flex gap-2 text-[11px] text-muted-foreground p-2.5 rounded-lg border border-border bg-muted/10">
          <Shield className="w-3.5 h-3.5 shrink-0 mt-0.5 text-green-400" />
          <span>
            Your OpenAI/Anthropic API keys are never exposed to users of your app.
            All requests are proxied through LifemarkAI's servers with server-side authentication.
          </span>
        </div>

        {/* Save */}
        <button
          onClick={() => void save()}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 text-xs py-2 px-3 rounded-lg font-medium bg-gradient-to-r from-violet-500 to-indigo-500 text-white hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          {saving ? "Saving…" : "Save settings"}
        </button>

        {/* Code snippet */}
        <div className="border border-border rounded-xl overflow-hidden">
          <button
            onClick={() => setShowCode(!showCode)}
            className="w-full flex items-center justify-between gap-2 p-3 text-xs font-medium hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Code2 className="w-3.5 h-3.5 text-violet-400" />
              How to call the proxy from your app
            </div>
            {showCode ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {showCode && (
            <div className="border-t border-border">
              <div className="flex items-center justify-between px-3 py-2 bg-muted/20">
                <span className="text-[11px] text-muted-foreground font-mono">JavaScript/TypeScript</span>
                <button
                  onClick={copyCode}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
              <pre className="p-3 text-[10px] font-mono overflow-x-auto leading-relaxed text-muted-foreground bg-background">
                {CODE_SNIPPET(project.id, model)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
