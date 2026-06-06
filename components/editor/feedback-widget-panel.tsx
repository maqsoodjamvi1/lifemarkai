"use client";

import { useState, useEffect } from "react";
import { MessageSquarePlus, Copy, Check, Star, Loader2, Trash2, SmilePlus, Frown, Meh, Smile, SmileIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";

interface FeedbackWidgetPanelProps {
  projectId: string;
  projectSlug: string;
}

interface FeedbackItem {
  id: string;
  rating: number | null;
  message: string | null;
  page_url: string | null;
  created_at: string;
}

const RATING_ICONS = [Frown, Frown, Meh, Smile, SmileIcon, Star];
const RATING_COLORS = ["", "text-red-400", "text-orange-400", "text-amber-400", "text-emerald-400", "text-violet-400"];
const RATING_LABELS = ["", "Terrible", "Bad", "Okay", "Good", "Great"];

function sentimentScore(items: FeedbackItem[]): number {
  const rated = items.filter((i) => i.rating != null);
  if (rated.length === 0) return 0;
  return Math.round(rated.reduce((sum, i) => sum + (i.rating ?? 0), 0) / rated.length * 10) / 10;
}

export function FeedbackWidgetPanel({ projectId, projectSlug }: FeedbackWidgetPanelProps) {
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [scriptCopied, setScriptCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"inbox" | "embed">("embed");

  const embedScript = `<!-- LifemarkAI Feedback Widget -->
<script
  src="https://lifemarkai.com/embed/feedback.js"
  data-project="${projectSlug}"
  data-position="bottom-right"
  data-theme="dark"
  defer
></script>`;

  const iframeEmbed = `<iframe
  src="https://lifemarkai.com/embed/feedback/${projectSlug}"
  width="60" height="60"
  frameborder="0"
  style="position:fixed;bottom:24px;right:24px;z-index:9999;border-radius:50%"
></iframe>`;

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/projects/${projectId}/feedback`);
        if (res.ok) {
          const data = await res.json() as { feedback: FeedbackItem[] };
          setFeedback(data.feedback ?? []);
        }
      } catch { /* ignore */ }
      finally { setLoading(false); }
    }
    load();
  }, [projectId]);

  function copyScript(text: string) {
    navigator.clipboard.writeText(text);
    setScriptCopied(true);
    setTimeout(() => setScriptCopied(false), 2000);
    toast({ title: "Copied to clipboard" });
  }

  const avgRating = sentimentScore(feedback);
  const ratingDistribution = [1, 2, 3, 4, 5].map((r) => ({
    rating: r,
    count: feedback.filter((f) => f.rating === r).length,
  }));
  const maxCount = Math.max(...ratingDistribution.map((r) => r.count), 1);

  return (
    <div className="flex flex-col h-full text-sm">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 mb-1">
          <MessageSquarePlus className="w-4 h-4 text-sky-400" />
          <h2 className="font-semibold text-foreground">Feedback Widget</h2>
          {feedback.length > 0 && (
            <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-sky-500/30 text-sky-400">
              {feedback.length} response{feedback.length !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">Embed a feedback button in your published app</p>
      </div>

      {/* Stats */}
      {feedback.length > 0 && (
        <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
          <div className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground mb-0.5">Responses</p>
            <p className="text-lg font-bold text-foreground">{feedback.length}</p>
          </div>
          <div className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground mb-0.5">Avg Rating</p>
            <p className={`text-lg font-bold ${avgRating >= 4 ? "text-emerald-400" : avgRating >= 3 ? "text-amber-400" : "text-red-400"}`}>
              {avgRating > 0 ? avgRating.toFixed(1) : "—"}/5
            </p>
          </div>
          <div className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground mb-0.5">With message</p>
            <p className="text-lg font-bold text-foreground">{feedback.filter((f) => f.message).length}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-2 border-b border-border">
        {(["embed", "inbox"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-1.5 rounded-md text-xs font-medium capitalize transition-all ${
              activeTab === tab ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "embed" ? "Embed" : `Inbox (${feedback.length})`}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === "embed" ? (
          <>
            {/* Script tag */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Script tag (recommended)</label>
              <div className="relative rounded-lg border border-border bg-muted/20 p-3">
                <pre className="text-[10px] font-mono text-foreground whitespace-pre-wrap break-words">{embedScript}</pre>
                <button
                  onClick={() => copyScript(embedScript)}
                  className="absolute top-2 right-2"
                >
                  {scriptCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />}
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">Paste before <code className="font-mono">&lt;/body&gt;</code> in your app's HTML.</p>
            </div>

            {/* iFrame alternative */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">iFrame (no-JS fallback)</label>
              <div className="relative rounded-lg border border-border bg-muted/20 p-3">
                <pre className="text-[10px] font-mono text-foreground whitespace-pre-wrap break-words">{iframeEmbed}</pre>
                <button onClick={() => copyScript(iframeEmbed)} className="absolute top-2 right-2">
                  <Copy className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                </button>
              </div>
            </div>

            {/* Preview mockup */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Widget preview</label>
              <div className="rounded-xl border border-border bg-muted/10 p-6 relative h-32 flex items-end justify-end">
                <div className="text-[10px] text-muted-foreground absolute top-3 left-3">Your app content here…</div>
                <div className="w-12 h-12 rounded-full bg-violet-500 flex items-center justify-center shadow-lg cursor-pointer hover:bg-violet-400 transition-colors">
                  <MessageSquarePlus className="w-5 h-5 text-white" />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">Floating button appears in the bottom-right corner of your app.</p>
            </div>

            {/* Rating distribution */}
            {feedback.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Rating breakdown</label>
                <div className="space-y-1.5">
                  {ratingDistribution.reverse().map(({ rating, count }) => {
                    const Icon = RATING_ICONS[rating];
                    return (
                      <div key={rating} className="flex items-center gap-2">
                        <Icon className={`w-3.5 h-3.5 shrink-0 ${RATING_COLORS[rating]}`} />
                        <span className="text-[10px] text-muted-foreground w-12">{RATING_LABELS[rating]}</span>
                        <div className="flex-1 h-1.5 rounded-full bg-muted/40 overflow-hidden">
                          <div
                            className="h-full bg-violet-500/60 rounded-full transition-all"
                            style={{ width: `${(count / maxCount) * 100}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground w-4 text-right">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        ) : (
          /* Inbox */
          loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : feedback.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <SmilePlus className="w-8 h-8 text-muted-foreground/40" />
              <p className="text-sm font-medium text-foreground">No feedback yet</p>
              <p className="text-xs text-muted-foreground">Add the embed script to your app and share it to start collecting feedback.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {feedback.map((item) => {
                const Icon = item.rating ? RATING_ICONS[item.rating] : MessageSquarePlus;
                return (
                  <div key={item.id} className="rounded-xl border border-border bg-muted/20 p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        {item.rating && (
                          <Icon className={`w-3.5 h-3.5 ${RATING_COLORS[item.rating]}`} />
                        )}
                        <span className="text-xs font-medium text-foreground">
                          {item.rating ? RATING_LABELS[item.rating] : "No rating"}
                        </span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(item.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    {item.message && (
                      <p className="text-[11px] text-muted-foreground leading-relaxed">{item.message}</p>
                    )}
                    {item.page_url && (
                      <p className="text-[10px] text-muted-foreground/60 font-mono truncate">{item.page_url}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>
    </div>
  );
}
