"use client";

import { useState, useEffect } from "react";
import {
  Mail, Key, Sparkles, Send, Check, Loader2,
  ChevronRight, RefreshCw, ExternalLink, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import type { ProjectFile } from "@/types/database";

interface EmailPanelProps {
  projectId: string;
  files: ProjectFile[];
  onFilesUpdate: (files: ProjectFile[]) => void;
}

const USE_CASES = [
  {
    id: "contact",
    label: "Contact form",
    icon: "📬",
    description: "Users fill out a contact form and an email is sent to you",
    prompt: "contact form where visitors can send messages to the site owner",
  },
  {
    id: "welcome",
    label: "Welcome email",
    icon: "👋",
    description: "Send a welcome email when a new user signs up",
    prompt: "welcome email sent automatically when a new user registers",
  },
  {
    id: "notification",
    label: "Notification",
    icon: "🔔",
    description: "Trigger email notifications for in-app events",
    prompt: "email notification triggered by an in-app event (e.g. new order, comment, or alert)",
  },
  {
    id: "newsletter",
    label: "Newsletter signup",
    icon: "📰",
    description: "Collect email addresses and send a confirmation",
    prompt: "newsletter subscription form with confirmation email",
  },
  {
    id: "otp",
    label: "Magic link / OTP",
    icon: "🔑",
    description: "Send a one-time password or magic sign-in link",
    prompt: "magic link or one-time password (OTP) authentication email",
  },
  {
    id: "custom",
    label: "Custom",
    icon: "✍️",
    description: "Describe your own email use case",
    prompt: "",
  },
];

interface Config {
  apiKey: string;
  fromEmail: string;
  fromName: string;
}

const CONFIG_FILE_PATH = ".email-config.json";

function loadConfig(files: ProjectFile[]): Config {
  const f = files.find((x) => x.path === CONFIG_FILE_PATH);
  if (f?.content) {
    try { return JSON.parse(f.content); } catch { /* ignore */ }
  }
  return { apiKey: "", fromEmail: "", fromName: "" };
}

export function EmailPanel({ projectId, files, onFilesUpdate }: EmailPanelProps) {
  const { toast } = useToast();

  const [step, setStep] = useState<"setup" | "generate" | "test">("setup");
  const [config, setConfig] = useState<Config>(loadConfig(files));
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);

  const [selectedUseCase, setSelectedUseCase] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedFiles, setGeneratedFiles] = useState<{ path: string; preview: string }[]>([]);

  const [testTo, setTestTo] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);

  // Sync config from files when they change externally
  useEffect(() => {
    setConfig(loadConfig(files));
  }, [files]);

  const configComplete = config.apiKey.trim().length > 0 && config.fromEmail.includes("@");

  async function saveConfig() {
    setSavingConfig(true);
    // Persist config as a hidden JSON file in the project
    const content = JSON.stringify(config, null, 2);
    const res = await fetch(`/api/projects/${projectId}/files`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: CONFIG_FILE_PATH, content, language: "json" }),
    });
    if (res.ok) {
      const updated = await res.json();
      onFilesUpdate([updated]);
      setConfigSaved(true);
      setTimeout(() => { setConfigSaved(false); setStep("generate"); }, 1200);
    } else {
      // Still advance — config might not need persisting
      setStep("generate");
    }
    setSavingConfig(false);
  }

  async function generateCode() {
    const useCase = USE_CASES.find((u) => u.id === selectedUseCase);
    if (!useCase) return;
    const prompt = selectedUseCase === "custom" ? customPrompt : useCase.prompt;
    if (!prompt.trim()) return;

    setGenerating(true);
    setGeneratedFiles([]);

    const res = await fetch(`/api/ai/generate-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        useCase: prompt,
        fromEmail: config.fromEmail,
        fromName: config.fromName,
        framework: (files.find((f) => f.path.endsWith("package.json"))?.content ?? "").includes("next")
          ? "nextjs"
          : "react",
      }),
    });

    if (res.ok) {
      const { files: newFiles } = await res.json();
      onFilesUpdate(newFiles);
      setGeneratedFiles(
        (newFiles as ProjectFile[]).map((f) => ({
          path: f.path,
          preview: (f.content ?? "").slice(0, 120) + "…",
        }))
      );
      setStep("test");
      toast({ title: "Email code generated!", description: `${newFiles.length} file(s) added to your project` });
    } else {
      const { error } = await res.json();
      toast({ title: "Generation failed", description: error, variant: "destructive" });
    }
    setGenerating(false);
  }

  async function sendTestEmail() {
    if (!testTo.includes("@") || !config.apiKey) return;
    setTesting(true);
    setTestResult(null);

    const res = await fetch(`/api/ai/generate-email/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey: config.apiKey,
        fromEmail: config.fromEmail,
        fromName: config.fromName,
        to: testTo,
      }),
    });

    setTestResult(res.ok ? "success" : "error");
    if (res.ok) {
      toast({ title: "Test email sent!", description: `Check ${testTo} for the test message` });
    } else {
      const { error } = await res.json().catch(() => ({ error: "Unknown error" }));
      toast({ title: "Test failed", description: error, variant: "destructive" });
    }
    setTesting(false);
  }

  // ── Step tabs ─────────────────────────────────────────────────────────────
  const steps = [
    { id: "setup",    label: "Setup",    num: 1 },
    { id: "generate", label: "Generate", num: 2 },
    { id: "test",     label: "Test",     num: 3 },
  ] as const;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <Mail className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold">Send Emails</span>
        <a
          href="https://resend.com"
          target="_blank"
          rel="noreferrer"
          className="ml-auto text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          Powered by Resend <ExternalLink className="w-2.5 h-2.5" />
        </a>
      </div>

      {/* Step tabs */}
      <div className="flex items-center gap-0 border-b border-border px-4 shrink-0">
        {steps.map((s, i) => (
          <button
            key={s.id}
            onClick={() => (s.id === "setup" || (s.id === "generate" && configComplete) || s.id === "test") && setStep(s.id)}
            className={`flex items-center gap-1.5 py-2.5 text-xs font-medium transition-colors relative pr-4 ${
              step === s.id ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${
              step === s.id ? "bg-primary text-white" : "bg-muted text-muted-foreground"
            }`}>{s.num}</span>
            {s.label}
            {i < steps.length - 1 && <ChevronRight className="w-3 h-3 text-muted-foreground/40 absolute right-0" />}
            {step === s.id && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">

        {/* ── Step 1: Setup ───────────────────────────────────────────────────── */}
        {step === "setup" && (
          <div className="p-4 space-y-5">
            <div className="rounded-lg bg-blue-500/5 border border-blue-500/20 p-3 text-xs text-blue-400 flex gap-2">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                Your Resend API key is stored only in your project's env config and never sent to our servers unencrypted.{" "}
                <a href="https://resend.com/api-keys" target="_blank" rel="noreferrer" className="underline">
                  Get a free key →
                </a>
              </span>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium flex items-center gap-1.5">
                  <Key className="w-3 h-3" /> Resend API key
                </label>
                <Input
                  type="password"
                  value={config.apiKey}
                  onChange={(e) => setConfig((c) => ({ ...c, apiKey: e.target.value }))}
                  placeholder="re_xxxxxxxxxxxxxxxxxxxx"
                  className="h-8 text-xs font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium">From email</label>
                <Input
                  type="email"
                  value={config.fromEmail}
                  onChange={(e) => setConfig((c) => ({ ...c, fromEmail: e.target.value }))}
                  placeholder="hello@yourdomain.com"
                  className="h-8 text-xs"
                />
                <p className="text-[10px] text-muted-foreground">
                  Must be a verified domain in your Resend account.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium">From name</label>
                <Input
                  value={config.fromName}
                  onChange={(e) => setConfig((c) => ({ ...c, fromName: e.target.value }))}
                  placeholder="My App"
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <Button
              onClick={saveConfig}
              disabled={!configComplete || savingConfig}
              className="w-full h-8 text-xs gap-2"
            >
              {savingConfig ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> :
               configSaved  ? <Check className="w-3.5 h-3.5" /> : null}
              {configSaved ? "Saved!" : "Save & Continue"}
            </Button>
          </div>
        )}

        {/* ── Step 2: Generate ─────────────────────────────────────────────── */}
        {step === "generate" && (
          <div className="p-4 space-y-4">
            <p className="text-xs text-muted-foreground">
              Choose an email use case. AI will generate the full API route and React component for your project.
            </p>

            {/* Use case grid */}
            <div className="grid grid-cols-2 gap-2">
              {USE_CASES.filter((u) => u.id !== "custom").map((u) => (
                <button
                  key={u.id}
                  onClick={() => setSelectedUseCase(u.id)}
                  className={`flex flex-col items-start gap-1 p-3 rounded-lg border text-left transition-all ${
                    selectedUseCase === u.id
                      ? "border-primary bg-primary/5 text-foreground"
                      : "border-border hover:border-border/80 hover:bg-muted/30 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className="text-base leading-none">{u.icon}</span>
                  <span className="text-[11px] font-semibold mt-1">{u.label}</span>
                  <span className="text-[10px] leading-snug opacity-70">{u.description}</span>
                </button>
              ))}
            </div>

            {/* Custom option */}
            <button
              onClick={() => setSelectedUseCase("custom")}
              className={`w-full flex items-center gap-2 p-3 rounded-lg border text-left transition-all ${
                selectedUseCase === "custom"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-border/80 hover:bg-muted/30"
              }`}
            >
              <span className="text-base">✍️</span>
              <div>
                <p className="text-[11px] font-semibold text-foreground">Custom use case</p>
                <p className="text-[10px] text-muted-foreground">Describe exactly what you need</p>
              </div>
            </button>

            {/* Custom prompt input */}
            {selectedUseCase === "custom" && (
              <Textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="e.g. Send an invoice email when a payment is completed, with the total amount and line items…"
                className="text-xs min-h-[80px] resize-none"
              />
            )}

            <Button
              onClick={generateCode}
              disabled={!selectedUseCase || generating || (selectedUseCase === "custom" && !customPrompt.trim())}
              className="w-full h-8 text-xs gap-2"
            >
              {generating
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Generating…</>
                : <><Sparkles className="w-3.5 h-3.5" />Generate email code</>
              }
            </Button>
          </div>
        )}

        {/* ── Step 3: Test ─────────────────────────────────────────────────── */}
        {step === "test" && (
          <div className="p-4 space-y-5">
            {/* Generated files list */}
            {generatedFiles.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                  Files added to project
                </p>
                {generatedFiles.map((f) => (
                  <div key={f.path} className="rounded-md bg-muted/30 border border-border p-2.5">
                    <p className="text-[10px] font-mono text-primary">{f.path}</p>
                    <p className="text-[9px] font-mono text-muted-foreground mt-1 leading-relaxed truncate">
                      {f.preview}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Send test */}
            <div className="space-y-3">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                Send a test email
              </p>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Send test to</label>
                <Input
                  type="email"
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                  placeholder="you@example.com"
                  className="h-8 text-xs"
                />
              </div>
              <Button
                onClick={sendTestEmail}
                disabled={!testTo.includes("@") || testing || !config.apiKey}
                variant="outline"
                className="w-full h-8 text-xs gap-2"
              >
                {testing ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" />Sending…</>
                ) : testResult === "success" ? (
                  <><Check className="w-3.5 h-3.5 text-green-500" />Sent!</>
                ) : testResult === "error" ? (
                  <><AlertCircle className="w-3.5 h-3.5 text-destructive" />Failed — check API key</>
                ) : (
                  <><Send className="w-3.5 h-3.5" />Send test email</>
                )}
              </Button>
            </div>

            {/* Restart */}
            <div className="pt-2 border-t border-border">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setStep("generate"); setSelectedUseCase(null); setGeneratedFiles([]); }}
                className="w-full h-7 text-xs gap-1.5 text-muted-foreground"
              >
                <RefreshCw className="w-3 h-3" />Generate another use case
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
