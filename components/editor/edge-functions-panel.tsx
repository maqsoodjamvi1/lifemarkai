"use client";

import { useState, useEffect, useRef } from "react";
import { Zap, Play, Plus, Trash2, Copy, Check, Loader2, ChevronDown, ChevronUp, ExternalLink, RefreshCw, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";

interface EdgeFunctionsPanelProps {
  projectId: string;
}

interface EdgeFunction {
  id: string;
  name: string;
  slug: string;
  status: "ACTIVE" | "INACTIVE" | "DEPLOYING";
  created_at: string;
  updated_at: string;
}

interface TestResult {
  status: number;
  body: string;
  duration_ms: number;
  headers: Record<string, string>;
}

const STARTER_TEMPLATE = `// Supabase Edge Function — Deno runtime
// Deploy via: supabase functions deploy my-function

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data, error } = await req.json();
    if (error) throw error;

    return new Response(
      JSON.stringify({ message: "Hello from Edge Functions!", data }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
`;

const TEMPLATES: { id: string; name: string; description: string; code: string }[] = [
  {
    id: "hello",
    name: "Hello World",
    description: "Basic CORS-enabled function",
    code: STARTER_TEMPLATE,
  },
  {
    id: "stripe-webhook",
    name: "Stripe Webhook",
    description: "Verify and handle Stripe events",
    code: `import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@12?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", { apiVersion: "2023-10-16" });

serve(async (req: Request) => {
  const sig = req.headers.get("stripe-signature") ?? "";
  const body = await req.text();
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    return new Response(\`Webhook error: \${err}\`, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed":
      // Handle successful payment
      console.log("Payment completed:", event.data.object);
      break;
    default:
      console.log(\`Unhandled event: \${event.type}\`);
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
`,
  },
  {
    id: "send-email",
    name: "Send Email (Resend)",
    description: "Trigger transactional emails",
    code: `import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const { to, subject, html } = await req.json();

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": \`Bearer \${Deno.env.get("RESEND_API_KEY")}\`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: "noreply@yourdomain.com", to, subject, html }),
  });

  const data = await res.json();
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: res.status,
  });
});
`,
  },
  {
    id: "ai-proxy",
    name: "AI Proxy",
    description: "Secure OpenRouter calls server-side",
    code: `import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const { prompt, model = "openrouter/fusion" } = await req.json();

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": \`Bearer \${Deno.env.get("OPENROUTER_API_KEY")}\`,
      "Content-Type": "application/json",
      "HTTP-Referer": Deno.env.get("APP_URL") ?? "",
      "X-Title": "LifemarkAI App",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1000,
    }),
  });

  const data = await res.json();
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: res.status,
  });
});
`,
  },
];

export function EdgeFunctionsPanel({ projectId }: EdgeFunctionsPanelProps) {
  const [functions, setFunctions] = useState<EdgeFunction[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"list" | "editor">("list");
  const [selectedFn, setSelectedFn] = useState<EdgeFunction | null>(null);
  const [code, setCode] = useState(STARTER_TEMPLATE);
  const [fnName, setFnName] = useState("my-function");
  const [testBody, setTestBody] = useState('{\n  "message": "hello"\n}');
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/edge-functions`)
      .then((r) => r.ok ? r.json() : { functions: [] })
      .then((d) => setFunctions(d.functions ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  async function testFunction() {
    setTesting(true);
    setTestResult(null);
    const start = Date.now();
    try {
      // Simulate running the function via a proxy endpoint
      const res = await fetch(`/api/projects/${projectId}/edge-functions/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: fnName, code, body: testBody }),
      });
      const json = await res.json() as { result?: string; error?: string; headers?: Record<string, string> };
      setTestResult({
        status: res.status,
        body: json.result ?? json.error ?? JSON.stringify(json, null, 2),
        duration_ms: Date.now() - start,
        headers: json.headers ?? {},
      });
    } catch (err) {
      setTestResult({ status: 500, body: String(err), duration_ms: Date.now() - start, headers: {} });
    } finally {
      setTesting(false);
    }
  }

  async function deployFunction() {
    setDeploying(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/edge-functions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: fnName, code }),
      });
      if (!res.ok) throw new Error();
      toast({ title: `Deployed ${fnName}`, description: "Edge Function is now live on Supabase." });
      // Refresh list
      const updated = await fetch(`/api/projects/${projectId}/edge-functions`).then((r) => r.json()) as { functions: EdgeFunction[] };
      setFunctions(updated.functions ?? []);
      setActiveTab("list");
    } catch {
      toast({ title: "Deploy failed", description: "Check your Supabase project is linked.", variant: "destructive" });
    } finally {
      setDeploying(false);
    }
  }

  function applyTemplate(tpl: typeof TEMPLATES[0]) {
    setCode(tpl.code);
    setFnName(tpl.id === "hello" ? "my-function" : tpl.id);
    setShowTemplates(false);
  }

  function copyInvokeUrl() {
    const url = `https://<project-ref>.functions.supabase.co/${fnName}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col h-full text-sm">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 mb-1">
          <Zap className="w-4 h-4 text-amber-400" />
          <h2 className="font-semibold text-foreground">Edge Functions</h2>
          <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-amber-500/30 text-amber-400">Deno</Badge>
        </div>
        <p className="text-xs text-muted-foreground">Write and deploy Supabase Edge Functions</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-2 border-b border-border">
        {(["list", "editor"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-1.5 rounded-md text-xs font-medium capitalize transition-all ${
              activeTab === tab ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "list" ? `Functions (${functions.length})` : "Editor"}
          </button>
        ))}
      </div>

      {activeTab === "list" ? (
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* New function button */}
          <Button
            size="sm"
            className="w-full gap-1.5"
            onClick={() => { setCode(STARTER_TEMPLATE); setFnName("my-function"); setActiveTab("editor"); }}
          >
            <Plus className="w-3.5 h-3.5" /> New Edge Function
          </Button>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : functions.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center">
                <Zap className="w-6 h-6 text-amber-400" />
              </div>
              <p className="text-sm font-medium text-foreground">No Edge Functions yet</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                Edge Functions run server-side Deno code at the edge — perfect for webhooks, AI calls, and secure API proxies.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {functions.map((fn) => (
                <div
                  key={fn.id}
                  className="rounded-xl border border-border bg-muted/20 p-3 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-xs font-semibold text-foreground truncate font-mono">{fn.slug}</p>
                      <Badge
                        variant="outline"
                        className={`text-[9px] h-4 px-1 shrink-0 ${
                          fn.status === "ACTIVE"    ? "border-emerald-500/40 text-emerald-400" :
                          fn.status === "DEPLOYING" ? "border-amber-500/40 text-amber-400" :
                          "border-border text-muted-foreground"
                        }`}
                      >
                        {fn.status}
                      </Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Updated {new Date(fn.updated_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2"
                      onClick={() => { setFnName(fn.slug); setActiveTab("editor"); }}
                    >
                      Edit
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Supabase docs link */}
          <a
            href="https://supabase.com/docs/guides/functions"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Supabase Edge Functions docs
          </a>
        </div>
      ) : (
        /* Editor view */
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Function name + template picker */}
          <div className="p-3 border-b border-border space-y-2">
            <div className="flex gap-2">
              <Input
                value={fnName}
                onChange={(e) => setFnName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                placeholder="function-name"
                className="h-8 text-xs font-mono bg-muted/30 border-border flex-1"
              />
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1 text-xs shrink-0"
                onClick={() => setShowTemplates((v) => !v)}
              >
                Templates {showTemplates ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </Button>
            </div>

            {showTemplates && (
              <div className="grid grid-cols-2 gap-1.5">
                {TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    onClick={() => applyTemplate(tpl)}
                    className="rounded-lg border border-border bg-muted/20 hover:bg-muted/40 p-2 text-left transition-all"
                  >
                    <p className="text-[11px] font-medium text-foreground">{tpl.name}</p>
                    <p className="text-[10px] text-muted-foreground">{tpl.description}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Code editor (textarea, Monaco not imported here to avoid SSR) */}
          <div className="flex-1 relative overflow-hidden">
            <textarea
              ref={textareaRef}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full h-full resize-none bg-[#0d1117] text-[#e6edf3] font-mono text-[11px] leading-relaxed p-3 focus:outline-none border-0"
              spellCheck={false}
            />
          </div>

          {/* Test section */}
          <div className="border-t border-border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <Terminal className="w-3 h-3" /> Test request body (JSON)
              </label>
              {testResult && (
                <span className={`text-[10px] font-mono ${testResult.status < 300 ? "text-emerald-400" : "text-red-400"}`}>
                  {testResult.status} · {testResult.duration_ms}ms
                </span>
              )}
            </div>
            <textarea
              value={testBody}
              onChange={(e) => setTestBody(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-lg border border-border bg-muted/20 p-2 text-[10px] font-mono text-foreground focus:outline-none focus:border-violet-500/50"
              spellCheck={false}
            />
            {testResult && (
              <pre className="rounded-lg border border-border bg-muted/20 p-2 text-[10px] font-mono text-foreground max-h-24 overflow-y-auto">
                {testResult.body}
              </pre>
            )}
          </div>

          {/* Invoke URL */}
          <div className="px-3 pb-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className="font-mono truncate">https://&lt;ref&gt;.functions.supabase.co/{fnName}</span>
            <button onClick={copyInvokeUrl}>
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 hover:text-foreground" />}
            </button>
          </div>

          {/* Action buttons */}
          <div className="p-3 border-t border-border flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="flex-none gap-1.5"
              onClick={testFunction}
              disabled={testing}
            >
              {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              Test
            </Button>
            <Button
              size="sm"
              className="flex-1 gap-1.5"
              onClick={deployFunction}
              disabled={deploying}
            >
              {deploying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              {deploying ? "Deploying…" : "Deploy"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
