
import { useState } from "react";
import { Copy, Check, MessageSquare, Globe } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface LovableGuestCommentsSetupProps {
  projectId: string;
  isPublic: boolean;
}

/** Embed snippet for anonymous preview comments on public projects. */
export function LovableGuestCommentsSetup({ projectId, isPublic }: LovableGuestCommentsSetupProps) {
  const [copied, setCopied] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "https://lifemarkai.com";

  const embedScript = `<!-- LifemarkAI Guest Comments -->
<script
  src="${origin}/embed/comments.js"
  data-project="${projectId}"
  data-position="bottom-right"
  data-theme="dark"
  defer
></script>`;

  function copy() {
    navigator.clipboard.writeText(embedScript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copied to clipboard" });
  }

  if (!isPublic) {
    return (
      <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-muted-foreground" />
          <p className="text-xs font-medium text-foreground">Guest comments require a public project</p>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Enable public sharing in the top bar so visitors can leave feedback on your preview without signing in.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-sky-400" />
        <div>
          <p className="text-xs font-semibold text-foreground">Guest preview comments</p>
          <p className="text-[11px] text-muted-foreground">
            Let visitors comment on your live preview — no account needed.
          </p>
        </div>
      </div>

      <div className="relative rounded-lg border border-border bg-muted/20 p-3">
        <pre className="text-[10px] font-mono text-foreground whitespace-pre-wrap break-words pr-8">
          {embedScript}
        </pre>
        <button
          type="button"
          onClick={copy}
          className="absolute top-2 right-2 p-1 rounded hover:bg-muted/50 transition-colors"
          aria-label="Copy embed script"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <Copy className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
          )}
        </button>
      </div>

      <p className="text-[10px] text-muted-foreground">
        Paste before <code className="font-mono">&lt;/body&gt;</code> in your deployed app, or add to{" "}
        <code className="font-mono">index.html</code> while previewing locally.
      </p>

      <div className="rounded-xl border border-border bg-muted/10 p-4 relative h-28 flex items-end justify-end">
        <span className="text-[10px] text-muted-foreground absolute top-3 left-3">Your app preview…</span>
        <div className="w-11 h-11 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg text-base">
          💬
        </div>
      </div>
    </div>
  );
}
