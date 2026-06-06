"use client";

import { useState } from "react";
import { Database, CheckCircle, XCircle, Loader2, Copy, ExternalLink, Wand2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";

interface SupabaseWizardProps {
  projectId: string;
}

type Step = "connect" | "validate" | "schema" | "done";

export function SupabaseWizard({ projectId }: SupabaseWizardProps) {
  const [step, setStep] = useState<Step>("connect");
  const [supabaseUrl, setSupabaseUrl] = useState("");
  const [supabaseAnonKey, setSupabaseAnonKey] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const [generatedSchema, setGeneratedSchema] = useState("");
  const [copied, setCopied] = useState(false);

  async function validateCredentials() {
    if (!supabaseUrl || !supabaseAnonKey) {
      toast({ title: "Enter both URL and anon key", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/integrations/supabase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, supabaseUrl, supabaseAnonKey, action: "validate" }),
      });
      const data = await res.json();
      setIsValid(data.valid);
      if (data.valid) {
        setStep("validate");
      } else {
        toast({ title: "Invalid credentials", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Validation failed", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }

  async function saveAndGenerateSchema() {
    setIsLoading(true);
    try {
      // Save credentials
      await fetch("/api/integrations/supabase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, supabaseUrl, supabaseAnonKey, action: "save" }),
      });

      // Generate schema
      const schemaRes = await fetch("/api/integrations/supabase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, action: "generate_schema" }),
      });
      const schemaData = await schemaRes.json();
      setGeneratedSchema(schemaData.schema || "");
      setStep("schema");
    } catch {
      toast({ title: "Failed to generate schema", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }

  function copySchema() {
    navigator.clipboard.writeText(generatedSchema);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Schema copied to clipboard!" });
  }

  const stepLabels: Record<Step, string> = {
    connect: "Connect",
    validate: "Validated",
    schema: "Schema",
    done: "Done",
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 mb-3">
          <Database className="h-4 w-4 text-green-500" />
          <span className="font-semibold text-sm">Supabase Integration</span>
        </div>
        {/* Step indicator */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          {(["connect", "validate", "schema", "done"] as Step[]).map((s, i, arr) => (
            <div key={s} className="flex items-center gap-1">
              <span className={step === s ? "text-primary font-medium" : step > s ? "text-green-500" : ""}>
                {stepLabels[s]}
              </span>
              {i < arr.length - 1 && <ChevronRight className="h-3 w-3" />}
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {step === "connect" && (
          <div className="space-y-4">
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-sm">
              <p className="font-medium text-green-600 dark:text-green-400 mb-1">Connect your Supabase project</p>
              <p className="text-muted-foreground text-xs">
                Find your credentials in <strong>Project Settings → API</strong> in your Supabase dashboard.
              </p>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Project URL</Label>
                <Input
                  placeholder="https://xxxxx.supabase.co"
                  value={supabaseUrl}
                  onChange={(e) => setSupabaseUrl(e.target.value)}
                  className="text-xs h-8 font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Anon / Public Key</Label>
                <Input
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI..."
                  value={supabaseAnonKey}
                  onChange={(e) => setSupabaseAnonKey(e.target.value)}
                  className="text-xs h-8 font-mono"
                />
              </div>
            </div>

            <Button onClick={validateCredentials} disabled={isLoading} className="w-full" size="sm">
              {isLoading ? (
                <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> Validating...</>
              ) : (
                "Validate & Connect"
              )}
            </Button>

            <a
              href="https://supabase.com/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ExternalLink className="h-3 w-3" /> Open Supabase Dashboard
            </a>
          </div>
        )}

        {step === "validate" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
              <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-green-600 dark:text-green-400">Connected successfully!</p>
                <p className="text-xs text-muted-foreground truncate">{supabaseUrl}</p>
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <p className="font-medium">What's next?</p>
              <ul className="space-y-1.5 text-muted-foreground text-xs">
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                  Save credentials to your project
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                  Generate a database schema based on your app
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                  Copy schema to Supabase SQL Editor
                </li>
              </ul>
            </div>

            <Button onClick={saveAndGenerateSchema} disabled={isLoading} className="w-full" size="sm">
              {isLoading ? (
                <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> Generating Schema...</>
              ) : (
                <><Wand2 className="h-3 w-3 mr-1.5" /> Save & Generate Schema</>
              )}
            </Button>
          </div>
        )}

        {step === "schema" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Generated SQL Schema</p>
              <Button variant="outline" size="sm" onClick={copySchema} className="h-7 text-xs gap-1">
                <Copy className="h-3 w-3" />
                {copied ? "Copied!" : "Copy"}
              </Button>
            </div>

            <div className="bg-muted rounded-lg p-3 overflow-auto max-h-64">
              <pre className="text-xs font-mono whitespace-pre-wrap text-muted-foreground">{generatedSchema}</pre>
            </div>

            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-xs">
              <p className="font-medium text-blue-600 dark:text-blue-400 mb-1">How to apply</p>
              <ol className="space-y-1 text-muted-foreground list-decimal list-inside">
                <li>Copy the schema above</li>
                <li>Go to your Supabase dashboard</li>
                <li>Open SQL Editor</li>
                <li>Paste and run the SQL</li>
              </ol>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-xs"
                onClick={() => window.open(`${supabaseUrl}/project/sql`, "_blank")}
              >
                <ExternalLink className="h-3 w-3 mr-1" /> Open SQL Editor
              </Button>
              <Button size="sm" className="flex-1 text-xs" onClick={() => setStep("done")}>
                Done
              </Button>
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="text-center space-y-3 py-6">
            <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
              <CheckCircle className="h-6 w-6 text-green-500" />
            </div>
            <div>
              <p className="font-semibold">Supabase Connected!</p>
              <p className="text-xs text-muted-foreground mt-1">
                Your project is now connected to Supabase. AI will automatically use your database config when generating code.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setStep("connect")} className="text-xs">
              Reconfigure
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
