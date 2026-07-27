"use client";

import { useState } from "react";
import { FormInput, Sparkles, Copy, Check, Loader2, RefreshCw, FileCode2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { DEFAULT_CODING_MODEL } from "@/lib/ai/model-defaults";

interface FormBuilderPanelProps {
  projectId: string;
  onInsertForm: (prompt: string) => void;
}

const FORM_EXAMPLES = [
  "Contact form with name, email, subject, and message fields",
  "User registration form with username, email, password, and confirm password",
  "Checkout form with shipping address, card details, and order summary",
  "Job application form with name, email, resume upload, cover letter, and LinkedIn URL",
  "Survey form with rating scales, multiple choice, and open-ended questions",
  "Newsletter signup with email and optional first name",
];

const STYLE_OPTIONS = [
  { id: "shadcn",    label: "shadcn/ui",     desc: "Radix primitives + Tailwind" },
  { id: "tailwind",  label: "Plain Tailwind", desc: "No component library" },
  { id: "html",      label: "Plain HTML",     desc: "Accessible, no framework" },
];

const VALIDATION_OPTIONS = [
  { id: "zod",       label: "Zod + react-hook-form", desc: "Type-safe schema validation" },
  { id: "yup",       label: "Yup + react-hook-form",  desc: "Popular schema validation" },
  { id: "native",    label: "HTML5 native",            desc: "Browser built-in validation" },
];

const SUBMIT_OPTIONS = [
  { id: "api",       label: "POST to API route",     desc: "Submits to /api/contact or similar" },
  { id: "email",     label: "Send via Resend",        desc: "Email the submission directly" },
  { id: "supabase",  label: "Save to Supabase table", desc: "Inserts a row into the DB" },
  { id: "console",   label: "Console.log (demo)",     desc: "Just log for now" },
];

interface GeneratedForm {
  componentCode: string;
  apiCode?: string;
  installDeps: string[];
  description: string;
}

async function generateFormComponent(
  description: string,
  style: string,
  validation: string,
  submitTarget: string,
  signal: AbortSignal
): Promise<GeneratedForm> {
  const styleMap: Record<string, string> = {
    shadcn: "shadcn/ui components (Button, Input, Label, Textarea, Select from @/components/ui)",
    tailwind: "plain Tailwind CSS classes, no component library",
    html: "plain semantic HTML5 with inline styles",
  };
  const validationMap: Record<string, string> = {
    zod: "react-hook-form with zod resolver and z.object() schema",
    yup: "react-hook-form with yupResolver and yup.object() schema",
    native: "HTML5 required/pattern attributes, no library",
  };
  const submitMap: Record<string, string> = {
    api:      "POST to an API route (show loading state, success/error toast)",
    email:    "POST to /api/contact which sends email via Resend",
    supabase: "insert row into a Supabase table via createClient()",
    console:  "console.log the form data (development placeholder)",
  };

  const systemPrompt = `You are an expert React developer. Generate a complete, production-ready form component.

IMPORTANT: Return ONLY valid JSON with these exact keys:
{
  "componentCode": "// complete TSX component file content",
  "apiCode": "// optional API route code if needed, or null",
  "installDeps": ["list", "of", "npm", "packages", "to", "install"],
  "description": "one-line description of what was generated"
}

Rules:
- The component must be a default export named after the form (e.g. ContactForm)
- Use ${styleMap[style] ?? styleMap.shadcn}
- Validation: ${validationMap[validation] ?? validationMap.zod}
- Submit handler: ${submitMap[submitTarget] ?? submitMap.api}
- Include proper TypeScript types
- Include loading, success, and error states
- Include accessibility attributes (aria-label, htmlFor, id)
- Make it copy-paste ready with all imports included`;

  const res = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: `Generate a form for: ${description}` }],
      model: DEFAULT_CODING_MODEL,
      system: systemPrompt,
      mode: "chat",
      projectId: "form-gen",
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

  const jsonMatch = accumulated.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON in response");
  return JSON.parse(jsonMatch[0]) as GeneratedForm;
}

export function FormBuilderPanel({ projectId, onInsertForm }: FormBuilderPanelProps) {
  const [description, setDescription] = useState("");
  const [style, setStyle] = useState("shadcn");
  const [validation, setValidation] = useState("zod");
  const [submitTarget, setSubmitTarget] = useState("api");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GeneratedForm | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [showApiCode, setShowApiCode] = useState(false);
  const [copiedComponent, setCopiedComponent] = useState(false);
  const [copiedApi, setCopiedApi] = useState(false);
  const [abortCtrl, setAbortCtrl] = useState<AbortController | null>(null);

  async function generate() {
    if (!description.trim()) {
      toast({ title: "Describe your form", description: "Tell the AI what fields and purpose the form has." });
      return;
    }
    if (generating) { abortCtrl?.abort(); return; }

    const ctrl = new AbortController();
    setAbortCtrl(ctrl);
    setGenerating(true);
    setResult(null);

    try {
      const form = await generateFormComponent(description, style, validation, submitTarget, ctrl.signal);
      setResult(form);
      setShowCode(true);
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== "AbortError") {
        toast({ title: "Generation failed", description: "Could not reach AI. Try again.", variant: "destructive" });
      }
    } finally {
      setGenerating(false);
    }
  }

  function insertIntoProject() {
    if (!result) return;
    onInsertForm(
      `Add this form component to my project:\n\n\`\`\`tsx\n${result.componentCode}\n\`\`\`\n\n` +
      (result.apiCode ? `Also add this API route:\n\n\`\`\`ts\n${result.apiCode}\n\`\`\`` : "") +
      (result.installDeps.length > 0 ? `\n\nInstall these dependencies: ${result.installDeps.join(", ")}` : "")
    );
  }

  function copyCode(code: string, setCopied: (v: boolean) => void) {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col h-full text-sm">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 mb-1">
          <FormInput className="w-4 h-4 text-sky-400" />
          <h2 className="font-semibold text-foreground">AI Form Builder</h2>
          <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-violet-500/30 text-violet-400">AI</Badge>
        </div>
        <p className="text-xs text-muted-foreground">Describe a form → get production-ready React code</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Description */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Describe your form</label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Contact form with name, email, subject, and message. Validates email format and requires all fields."
            rows={3}
            className="text-xs bg-muted/30 border-border resize-none"
          />
          {/* Examples */}
          <div className="flex flex-wrap gap-1 pt-1">
            {FORM_EXAMPLES.slice(0, 3).map((ex) => (
              <button
                key={ex}
                onClick={() => setDescription(ex)}
                className="text-[10px] px-2 py-0.5 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-violet-500/40 transition-all"
              >
                {ex.split(" ").slice(0, 3).join(" ")}…
              </button>
            ))}
          </div>
        </div>

        {/* Style */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Style</label>
          <div className="grid grid-cols-3 gap-1.5">
            {STYLE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                onClick={() => setStyle(opt.id)}
                className={`rounded-lg border p-2 text-left transition-all ${style === opt.id ? "border-violet-500/50 bg-violet-500/10" : "border-border bg-muted/20"}`}
              >
                <p className="text-[11px] font-medium text-foreground">{opt.label}</p>
                <p className="text-[9px] text-muted-foreground leading-tight">{opt.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Validation */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Validation</label>
          <div className="grid grid-cols-3 gap-1.5">
            {VALIDATION_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                onClick={() => setValidation(opt.id)}
                className={`rounded-lg border p-2 text-left transition-all ${validation === opt.id ? "border-violet-500/50 bg-violet-500/10" : "border-border bg-muted/20"}`}
              >
                <p className="text-[11px] font-medium text-foreground">{opt.label}</p>
                <p className="text-[9px] text-muted-foreground leading-tight">{opt.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Submit target */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Submit action</label>
          <div className="grid grid-cols-2 gap-1.5">
            {SUBMIT_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                onClick={() => setSubmitTarget(opt.id)}
                className={`rounded-lg border p-2 text-left transition-all ${submitTarget === opt.id ? "border-violet-500/50 bg-violet-500/10" : "border-border bg-muted/20"}`}
              >
                <p className="text-[11px] font-medium text-foreground">{opt.label}</p>
                <p className="text-[9px] text-muted-foreground leading-tight">{opt.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Generated result */}
        {generating && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
            <p className="text-xs text-muted-foreground">Generating form component…</p>
          </div>
        )}

        {result && !generating && (
          <div className="space-y-3">
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 flex items-center gap-2">
              <FileCode2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <p className="text-xs text-emerald-300 flex-1">{result.description}</p>
            </div>

            {result.installDeps.length > 0 && (
              <div className="rounded-lg border border-border bg-muted/20 p-2.5">
                <p className="text-[10px] text-muted-foreground mb-1.5 font-medium uppercase tracking-wide">Install dependencies</p>
                <code className="text-[10px] font-mono text-foreground">
                  npm install {result.installDeps.join(" ")}
                </code>
              </div>
            )}

            {/* Component code */}
            <div className="rounded-xl border border-border overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-3 py-2 bg-muted/20 hover:bg-muted/30 transition-colors"
                onClick={() => setShowCode((v) => !v)}
              >
                <span className="text-[11px] font-medium text-foreground flex items-center gap-1.5">
                  <FileCode2 className="w-3.5 h-3.5" /> Component.tsx
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); copyCode(result.componentCode, setCopiedComponent); }}
                    className="p-1 hover:text-foreground text-muted-foreground"
                  >
                    {copiedComponent ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                  {showCode ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                </div>
              </button>
              {showCode && (
                <pre className="p-3 text-[10px] font-mono text-foreground overflow-x-auto max-h-48 bg-[#0d1117] whitespace-pre-wrap">
                  {result.componentCode}
                </pre>
              )}
            </div>

            {/* API route code */}
            {result.apiCode && (
              <div className="rounded-xl border border-border overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-3 py-2 bg-muted/20 hover:bg-muted/30 transition-colors"
                  onClick={() => setShowApiCode((v) => !v)}
                >
                  <span className="text-[11px] font-medium text-foreground flex items-center gap-1.5">
                    <FileCode2 className="w-3.5 h-3.5" /> API Route
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); copyCode(result.apiCode!, setCopiedApi); }}
                      className="p-1 hover:text-foreground text-muted-foreground"
                    >
                      {copiedApi ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    {showApiCode ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                  </div>
                </button>
                {showApiCode && (
                  <pre className="p-3 text-[10px] font-mono text-foreground overflow-x-auto max-h-40 bg-[#0d1117] whitespace-pre-wrap">
                    {result.apiCode}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-border flex gap-2">
        {result && !generating && (
          <>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={generate}>
              <RefreshCw className="w-3.5 h-3.5" /> Regenerate
            </Button>
            <Button size="sm" className="flex-1 gap-1.5" onClick={insertIntoProject}>
              <FileCode2 className="w-3.5 h-3.5" /> Add to project
            </Button>
          </>
        )}
        {!result && (
          <Button size="sm" className="flex-1 gap-1.5" onClick={generate} disabled={generating}>
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {generating ? "Stop" : "Generate Form"}
          </Button>
        )}
      </div>
    </div>
  );
}
