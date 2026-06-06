"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ClipboardList, ChevronDown, ChevronUp, Clock, User, Globe,
  Monitor, FileJson, Copy, Check, Filter, Calendar, HelpCircle,
  AlertTriangle, X, Loader2, Info,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/* ─── Types ─────────────────────────────────────────────── */

interface AuditLog {
  id: string;
  action: string;
  resource: string | null;
  actor_name: string | null;
  user_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

/* ─── Constants ─────────────────────────────────────────── */

const TIME_RANGES = [
  { key: "all",        label: "All time" },
  { key: "7d",         label: "Last 7 days" },
  { key: "30d",        label: "Last 30 days" },
  { key: "90d",        label: "Last 90 days" },
  { key: "this_month", label: "This month" },
];

const FAQ = [
  { q: "Who can access audit logs?",            a: "Audit logs are visible to workspace owners and admins on Enterprise plans." },
  { q: "How long are audit logs retained?",     a: "Logs are retained for 90 days. Events older than that are automatically removed." },
  { q: "Can I export audit logs?",              a: "Entries can be expanded to view structured JSON details, which can be copied. For SIEM integration, contact support." },
  { q: "Why don't I see audit logs?",           a: "Try clearing filters and using a broader time range." },
];

/* ─── Helpers ───────────────────────────────────────────── */

function timeAgo(date: string): string {
  const d = new Date(date);
  const now = new Date();
  const s = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (s < 60)     return `${s}s ago`;
  if (s < 3600)   return `${Math.floor(s / 60)}m ago`;
  if (s < 86400)  return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return d.toLocaleDateString();
}

function actionBadge(action: string): string {
  if (action.includes("creat") || action.includes("add"))    return "bg-green-500/20 text-green-400";
  if (action.includes("delet") || action.includes("remov"))  return "bg-red-500/20 text-red-400";
  if (action.includes("updat") || action.includes("chang"))  return "bg-amber-500/20 text-amber-400";
  if (action.includes("sent"))   return "bg-blue-500/20 text-blue-400";
  if (action.includes("access")) return "bg-purple-500/20 text-purple-400";
  return "bg-muted text-muted-foreground";
}

/* ─── Component ─────────────────────────────────────────── */

export function AuditLogsPage({ userId }: { userId: string }) {
  const [logs, setLogs]             = useState<AuditLog[]>([]);
  const [loading, setLoading]       = useState(true);
  const [actionFilter, setActionFilter] = useState("");
  const [timeRange, setTimeRange]   = useState("all");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [copiedJson, setCopiedJson] = useState(false);
  const [showFAQ, setShowFAQ]       = useState(false);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    let q = (supabase as ReturnType<typeof createClient>)
      .from("audit_logs")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (actionFilter) q = q.ilike("action", `%${actionFilter}%`);

    if (timeRange !== "all") {
      const now = new Date();
      let since: Date;
      if (timeRange === "7d")         { since = new Date(now.getTime() - 7 * 86400_000); }
      else if (timeRange === "30d")   { since = new Date(now.getTime() - 30 * 86400_000); }
      else if (timeRange === "90d")   { since = new Date(now.getTime() - 90 * 86400_000); }
      else /* this_month */ {
        since = new Date(now.getFullYear(), now.getMonth(), 1);
      }
      q = q.gte("created_at", since.toISOString());
    }

    const { data } = await q;
    setLogs((data as AuditLog[] | null) ?? []);
    setLoading(false);
  }, [userId, actionFilter, timeRange]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const handleCopyJson = (details: Record<string, unknown> | null, log: AuditLog) => {
    const payload = details ?? { action: log.action, resource: log.resource, actor: log.actor_name, timestamp: log.created_at };
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  const uniqueActions = Array.from(new Set(logs.map((l) => l.action))).sort();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Page header */}
      <div className="border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center gap-3">
            <ClipboardList size={20} className="text-muted-foreground" />
            <div>
              <h1 className="text-lg font-semibold">Audit Logs</h1>
              <p className="text-xs text-muted-foreground">Monitor workspace activity and compliance</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-5">
        {/* Retention notice */}
        <div className="flex items-start gap-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
          <Info size={14} className="text-blue-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-blue-400">
            Logs are retained for <strong>90 days</strong>. Events older than that are automatically removed.
            Showing <strong>{logs.length}</strong> events.
          </p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Filter size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="pl-8 pr-6 py-2 text-xs border border-border rounded-lg bg-background text-foreground appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">All actions</option>
              {uniqueActions.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>

          <div className="relative">
            <Calendar size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="pl-8 pr-6 py-2 text-xs border border-border rounded-lg bg-background text-foreground appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {TIME_RANGES.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
            <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>

          {(actionFilter || timeRange !== "all") && (
            <button
              onClick={() => { setActionFilter(""); setTimeRange("all"); }}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition"
            >
              <X size={10} /> Clear filters
            </button>
          )}

          <div className="ml-auto text-[10px] text-muted-foreground">
            {logs.length} {logs.length === 1 ? "log" : "logs"}
          </div>
        </div>

        {/* Table */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <table className="w-full text-xs">
            <thead className="border-b border-border bg-muted/30">
              <tr>
                <th className="text-left py-2.5 px-4 text-muted-foreground font-medium w-36">Timestamp</th>
                <th className="text-left py-2.5 px-4 text-muted-foreground font-medium">Action</th>
                <th className="text-left py-2.5 px-4 text-muted-foreground font-medium">Resource</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="py-12 text-center">
                  <Loader2 size={20} className="text-muted-foreground animate-spin mx-auto" />
                </td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={4} className="py-12 text-center text-muted-foreground">
                  <ClipboardList size={28} className="mx-auto mb-2 text-muted-foreground/30" />
                  <p>No audit logs found</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1">
                    {actionFilter || timeRange !== "all" ? "Try adjusting your filters" : "Activity will appear here as you use the app"}
                  </p>
                </td></tr>
              ) : logs.map((log) => {
                const isExpanded = expandedRow === log.id;
                return [
                  <tr
                    key={log.id}
                    className={`border-b border-border hover:bg-muted/30 cursor-pointer transition ${isExpanded ? "bg-muted/30" : ""}`}
                    onClick={() => setExpandedRow(isExpanded ? null : log.id)}
                  >
                    <td className="py-3 px-4" title={new Date(log.created_at).toLocaleString()}>
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Clock size={10} />
                        {timeAgo(log.created_at)}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${actionBadge(log.action)}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground">{log.resource ?? "—"}</td>
                    <td className="py-3 px-2">
                      {isExpanded
                        ? <ChevronUp size={12} className="text-muted-foreground" />
                        : <ChevronDown size={12} className="text-muted-foreground" />
                      }
                    </td>
                  </tr>,

                  isExpanded && (
                    <tr key={`${log.id}-detail`}>
                      <td colSpan={4} className="px-4 py-3 bg-muted/20 border-b border-border">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                              <FileJson size={10} /> Event Details
                            </span>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleCopyJson(log.details, log); }}
                              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition"
                            >
                              {copiedJson ? <><Check size={10} className="text-green-400" /> Copied</> : <><Copy size={10} /> Copy JSON</>}
                            </button>
                          </div>
                          <pre className="text-[10px] text-foreground bg-background p-3 rounded-lg border border-border overflow-x-auto font-mono leading-relaxed">
                            {JSON.stringify(log.details ?? { action: log.action, resource: log.resource, timestamp: log.created_at }, null, 2)}
                          </pre>
                          <div className="flex gap-4 text-[9px] text-muted-foreground">
                            {log.ip_address  && <span className="flex items-center gap-1"><Globe size={8} /> {log.ip_address}</span>}
                            {log.user_agent  && <span className="flex items-center gap-1"><Monitor size={8} /> {log.user_agent.substring(0, 60)}{log.user_agent.length > 60 ? "…" : ""}</span>}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>

        {/* FAQ */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <button
            onClick={() => setShowFAQ(!showFAQ)}
            className="flex items-center justify-between w-full p-4 hover:bg-muted/30 transition"
          >
            <div className="flex items-center gap-2">
              <HelpCircle size={14} className="text-muted-foreground" />
              <span className="text-sm font-medium">FAQ</span>
            </div>
            {showFAQ ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
          </button>
          {showFAQ && (
            <div className="border-t border-border divide-y divide-border">
              {FAQ.map((faq, i) => (
                <div key={i}>
                  <button
                    onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
                    className="flex items-center justify-between w-full p-4 hover:bg-muted/30 transition text-left"
                  >
                    <span className="text-xs text-foreground pr-4">{faq.q}</span>
                    {expandedFaq === i ? <ChevronUp size={10} className="text-muted-foreground flex-shrink-0" /> : <ChevronDown size={10} className="text-muted-foreground flex-shrink-0" />}
                  </button>
                  {expandedFaq === i && (
                    <p className="text-xs text-muted-foreground px-4 pb-4 leading-relaxed">{faq.a}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
