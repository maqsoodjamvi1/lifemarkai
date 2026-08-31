
/**
 * WebhookPanel
 * Configure outgoing webhooks fired on project events:
 *   deploy_success | deploy_failed | build_complete | ai_generation
 * Endpoints are persisted at projects.metadata.webhooks via
 * /api/projects/:id/webhooks, and actually fired from src/lib/webhooks/dispatch.ts
 * (called from the deploy route and the AI chat/agent build-completion paths).
 */

import { useState,useEffect,useCallback } from "react";
import {
Webhook,Plus,Trash2,Send,CheckCircle2,XCircle,
Loader2,Copy,Check,ChevronDown,ChevronRight,
AlertCircle,ShieldCheck,Zap,Eye,EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import type { WebhookEndpoint as SharedWebhookEndpoint, WebhookEvent } from "@/lib/webhooks/dispatch";

// ─── Types ────────────────────────────────────────────────────────────────────

const ALL_EVENTS: WebhookEvent[] = [
  "deploy_success",
  "deploy_failed",
  "build_complete",
  "ai_generation",
];

const EVENT_LABELS: Record<WebhookEvent, string> = {
  deploy_success: "Deploy succeeded",
  deploy_failed: "Deploy failed",
  build_complete: "Build complete",
  ai_generation: "AI generation",
};

const EVENT_COLORS: Record<WebhookEvent, string> = {
  deploy_success: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  deploy_failed: "text-red-400 bg-red-500/10 border-red-500/20",
  build_complete: "text-sky-400 bg-sky-500/10 border-sky-500/20",
  ai_generation: "text-violet-400 bg-violet-500/10 border-violet-500/20",
};

interface WebhookEndpoint extends SharedWebhookEndpoint {
  enabled: boolean;
  label: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function randomId() {
  return Math.random().toString(36).slice(2, 9);
}

function randomSecret() {
  const arr = new Uint8Array(20);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** HMAC-SHA256(secret, body) as lowercase hex, matching src/lib/webhooks/dispatch.ts's server-side signing. */
async function signHmacSha256(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

// ─── Add Webhook Form ─────────────────────────────────────────────────────────

interface AddFormProps {
  onAdd: (ep: WebhookEndpoint) => void;
  onCancel: () => void;
}

function AddWebhookForm({ onAdd, onCancel }: AddFormProps) {
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [events, setEvents] = useState<WebhookEvent[]>(["deploy_success"]);
  const [secret] = useState(randomSecret);

  function toggleEvent(ev: WebhookEvent) {
    setEvents((prev) =>
      prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev]
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url || events.length === 0) return;
    onAdd({
      id: randomId(),
      url,
      label: label || new URL(url).hostname,
      secret,
      events,
      enabled: true,
      lastStatus: null,
      lastFiredAt: null,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4 border border-border rounded-xl bg-muted/20">
      <p className="text-xs font-semibold">New webhook endpoint</p>

      <div className="space-y-1.5">
        <Label className="text-xs">Payload URL *</Label>
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://your-server.com/hooks/lifemark"
          className="h-8 text-xs font-mono"
          type="url"
          required
          autoFocus
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Label (optional)</Label>
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Slack deploy notifier"
          className="h-8 text-xs"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Trigger events</Label>
        <div className="grid grid-cols-2 gap-1.5">
          {ALL_EVENTS.map((ev) => (
            <button
              key={ev}
              type="button"
              onClick={() => toggleEvent(ev)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-all ${
                events.includes(ev)
                  ? EVENT_COLORS[ev]
                  : "border-border text-muted-foreground hover:border-border/80 hover:bg-muted/40"
              }`}
            >
              <Zap className="w-3 h-3 shrink-0" />
              {EVENT_LABELS[ev]}
            </button>
          ))}
        </div>
        {events.length === 0 && (
          <p className="text-[10px] text-destructive">Select at least one event</p>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="w-3 h-3 text-muted-foreground" />
          <Label className="text-xs">Secret (HMAC-SHA256 signing key)</Label>
        </div>
        <code className="block text-[10px] font-mono bg-muted/50 border border-border rounded px-2 py-1.5 break-all">
          {secret}
        </code>
        <p className="text-[10px] text-muted-foreground">
          Use this to verify payloads. We&apos;ll send it as <code>X-Lifemark-Signature</code>.
        </p>
      </div>

      <div className="flex gap-2 pt-1">
        <Button type="submit" size="sm" className="h-7 text-xs" disabled={!url || events.length === 0}>
          <Plus className="w-3 h-3 mr-1" /> Add webhook
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ─── Endpoint Row ─────────────────────────────────────────────────────────────

interface EndpointRowProps {
  ep: WebhookEndpoint;
  onChange: (updated: WebhookEndpoint) => void;
  onDelete: (id: string) => void;
  onTestFire: (id: string) => void;
  testing: boolean;
}

function EndpointRow({ ep, onChange, onDelete, onTestFire, testing }: EndpointRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [secretRevealed, setSecretRevealed] = useState(false);

  function copySecret() {
    navigator.clipboard.writeText(ep.secret).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => { /* clipboard unavailable — the masked/revealed text is still selectable */ });
  }

  function toggleEvent(ev: WebhookEvent) {
    const events = ep.events.includes(ev)
      ? ep.events.filter((e) => e !== ev)
      : [...ep.events, ev];
    onChange({ ...ep, events });
  }

  return (
    <div className={`rounded-xl border transition-colors ${ep.enabled ? "border-border" : "border-border/40 opacity-60"}`}>
      {/* Summary row */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button onClick={() => setExpanded((v) => !v)} className="text-muted-foreground hover:text-foreground">
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>

        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium truncate">{ep.label}</p>
          <p className="text-[10px] text-muted-foreground font-mono truncate">{ep.url}</p>
        </div>

        {/* Last status */}
        {ep.lastStatus === "success" && (
          <span title="Last delivery succeeded">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          </span>
        )}
        {ep.lastStatus === "failed" && (
          <span title="Last delivery failed">
            <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
          </span>
        )}

        <Switch
          checked={ep.enabled}
          onCheckedChange={(v) => onChange({ ...ep, enabled: v })}
          className="scale-75 shrink-0"
        />
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border/40 px-3 py-3 space-y-3">
          {/* URL edit */}
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Payload URL</Label>
            <Input
              value={ep.url}
              onChange={(e) => onChange({ ...ep, url: e.target.value })}
              className="h-7 text-xs font-mono"
              type="url"
            />
          </div>

          {/* Events */}
          <div className="space-y-1.5">
            <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Events</Label>
            <div className="grid grid-cols-2 gap-1">
              {ALL_EVENTS.map((ev) => (
                <button
                  key={ev}
                  onClick={() => toggleEvent(ev)}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded border text-[10px] transition-all ${
                    ep.events.includes(ev)
                      ? EVENT_COLORS[ev]
                      : "border-border/60 text-muted-foreground hover:bg-muted/40"
                  }`}
                >
                  <Zap className="w-2.5 h-2.5 shrink-0" />
                  {EVENT_LABELS[ev]}
                </button>
              ))}
            </div>
          </div>

          {/* Secret — masked by default, same discipline as the secrets vault
              and env panels. This used to render in plaintext the moment the
              row was expanded, so a screen share or screenshot taken to copy
              the webhook URL would also leak the HMAC signing secret. */}
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Signing secret</Label>
            <div className="flex gap-1.5 items-center">
              <code className="flex-1 text-[10px] font-mono bg-muted/50 border border-border rounded px-2 py-1 truncate">
                {secretRevealed ? ep.secret : "•".repeat(Math.min(ep.secret.length, 32))}
              </code>
              <Button
                variant="outline"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={() => setSecretRevealed((v) => !v)}
                title={secretRevealed ? "Hide secret" : "Reveal secret"}
              >
                {secretRevealed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              </Button>
              <Button variant="outline" size="icon" className="h-6 w-6 shrink-0" onClick={copySecret} title="Copy secret">
                {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
              </Button>
            </div>
          </div>

          {/* Last fired */}
          {ep.lastFiredAt && (
            <p className="text-[10px] text-muted-foreground">
              Last fired: {new Date(ep.lastFiredAt).toLocaleString()}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1.5"
              onClick={() => onTestFire(ep.id)}
              disabled={testing}
            >
              {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
              Test fire
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10 ml-auto"
              onClick={() => onDelete(ep.id)}
            >
              <Trash2 className="w-3 h-3" /> Remove
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

interface WebhookPanelProps {
  projectId: string;
}

export function WebhookPanel({ projectId }: WebhookPanelProps) {
  const { toast } = useToast();
  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  // Load persisted webhooks from project env vars API
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/webhooks`);
      if (!res.ok) return;
      const data = await res.json() as { webhooks?: WebhookEndpoint[] };
      setEndpoints((data.webhooks ?? []).map((w) => ({ ...w, label: w.label || new URL(w.url).hostname, enabled: w.enabled !== false })));
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  async function handleAdd(ep: WebhookEndpoint) {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/webhooks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: ep.url, events: ep.events, secret: ep.secret }),
      });
      const data = await res.json() as { webhook?: WebhookEndpoint; error?: string };
      if (!res.ok || !data.webhook) {
        toast({ title: "Could not add webhook", description: data.error, variant: "destructive" });
        return;
      }
      setEndpoints((prev) => [...prev, { ...data.webhook!, label: ep.label, enabled: true }]);
      setShowForm(false);
      toast({ title: "Webhook added", description: ep.url });
    } finally {
      setSaving(false);
    }
  }

  async function handleChange(updated: WebhookEndpoint) {
    setEndpoints((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    setSaving(true);
    try {
      await fetch(`/api/projects/${projectId}/webhooks`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhook: updated }),
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setEndpoints((prev) => prev.filter((e) => e.id !== id));
    setSaving(true);
    try {
      await fetch(`/api/projects/${projectId}/webhooks`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      toast({ title: "Webhook removed" });
    } finally {
      setSaving(false);
    }
  }

  async function handleTestFire(id: string) {
    setTestingId(id);
    const ep = endpoints.find((e) => e.id === id);
    if (!ep) { setTestingId(null); return; }

    try {
      // Fire a simulated ping payload to the endpoint, signed the same way
      // the real dispatcher (src/lib/webhooks/dispatch.ts) signs deliveries,
      // so a receiver validating X-Lifemark-Signature sees consistent
      // behavior between "test fire" and a real event.
      const payload = {
        event: "ping",
        project_id: projectId,
        fired_at: new Date().toISOString(),
        message: "Test delivery from LifemarkAI",
      };
      const body = JSON.stringify(payload);
      const signature = await signHmacSha256(ep.secret, body);
      const res = await fetch(ep.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Lifemark-Event": "ping",
          "X-Lifemark-Signature": `sha256=${signature}`,
        },
        body,
      }).catch(() => null);

      const ok = res?.ok ?? false;
      const updated: WebhookEndpoint = {
        ...ep,
        lastStatus: ok ? ("success" as const) : ("failed" as const),
        lastFiredAt: new Date().toISOString(),
      };
      setEndpoints((prev) => prev.map((e) => (e.id === id ? updated : e)));
      void handleChange(updated);

      toast({
        title: ok ? "Test delivery succeeded" : "Test delivery failed",
        description: ok
          ? `${ep.url} responded with ${res!.status}`
          : "Could not reach the endpoint. Check the URL and CORS settings.",
        variant: ok ? "default" : "destructive",
      });
    } finally {
      setTestingId(null);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border shrink-0">
        <Webhook className="w-4 h-4 text-violet-400 shrink-0" />
        <span className="text-xs font-semibold flex-1">Webhooks</span>
        {saving && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
        <Badge variant="outline" className="text-[10px] h-4 px-1.5">
          {endpoints.length} endpoint{endpoints.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-2 px-3 py-2.5 bg-muted/20 border-b border-border/40 shrink-0">
        <AlertCircle className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          Webhooks fire a POST request to your URL when project events occur.
          Verify payloads using the <code className="font-mono">X-Lifemark-Signature</code> header.
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : endpoints.length === 0 && !showForm ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
                <Webhook className="w-5 h-5 text-violet-400" />
              </div>
              <div>
                <p className="text-sm font-medium">No webhooks yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Add an endpoint to receive event notifications.
                </p>
              </div>
              <Button size="sm" onClick={() => setShowForm(true)} className="gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Add webhook
              </Button>
            </div>
          ) : (
            <>
              {endpoints.map((ep) => (
                <EndpointRow
                  key={ep.id}
                  ep={ep}
                  onChange={handleChange}
                  onDelete={handleDelete}
                  onTestFire={handleTestFire}
                  testing={testingId === ep.id}
                />
              ))}

              {showForm ? (
                <AddWebhookForm onAdd={handleAdd} onCancel={() => setShowForm(false)} />
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-8 gap-1.5 border-dashed text-xs"
                  onClick={() => setShowForm(true)}
                >
                  <Plus className="w-3.5 h-3.5" /> Add endpoint
                </Button>
              )}
            </>
          )}
        </div>
      </ScrollArea>

      {/* Footer — payload schema reference */}
      <div className="border-t border-border shrink-0 px-3 py-3">
        <p className="text-[10px] font-medium text-muted-foreground mb-1.5">Payload schema</p>
        <pre className="text-[9px] font-mono bg-muted/40 rounded p-2 text-muted-foreground overflow-x-auto leading-relaxed">{`{
  "event": "deploy_success",
  "project_id": "...",
  "fired_at": "2026-01-01T00:00:00Z",
  "data": { ... }
}`}</pre>
      </div>
    </div>
  );
}
