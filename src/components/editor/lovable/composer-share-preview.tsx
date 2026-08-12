
import { useState } from "react";
import { Check,Copy,Link2 } from "lucide-react";
import { usePreviewToken } from "@/hooks/use-preview-token";

interface LovableComposerSharePreviewProps {
  projectId: string;
  className?: string;
}

/** One-click copy of the signed preview URL for stakeholder review (Lovable parity). */
export function LovableComposerSharePreview({ projectId, className }: LovableComposerSharePreviewProps) {
  const { url, loading } = usePreviewToken(projectId);
  const [copied, setCopied] = useState(false);

  if (!url || loading) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className={`mx-3 mb-2 flex items-center gap-2 rounded-lg border border-[color:var(--border-default)] bg-[var(--bg-muted)]/30 px-2.5 py-1.5 ${className ?? ""}`}>
      <Link2 className="w-3 h-3 text-[var(--fg-tertiary)] shrink-0" />
      <span className="text-[10px] text-[var(--fg-tertiary)] truncate flex-1 font-mono" title={url}>
        {url.replace(/^https?:\/\//, "").slice(0, 48)}
        {url.length > 52 ? "…" : ""}
      </span>
      <button
        type="button"
        onClick={() => void copy()}
        className="shrink-0 flex items-center gap-1 text-[10px] text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] px-2 py-0.5 rounded-md hover:bg-[var(--bg-muted)]/60 transition-colors"
      >
        {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}
