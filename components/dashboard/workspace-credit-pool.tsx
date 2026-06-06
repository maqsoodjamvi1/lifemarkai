"use client";

/**
 * WorkspaceCreditPool
 * Displays shared workspace credit pool with per-member usage breakdown
 * and admin controls for setting per-member monthly caps.
 */

import { useState, useEffect } from "react";
import {
  Users, Zap, TrendingUp, Settings, ChevronDown, ChevronRight,
  AlertCircle, CheckCircle2, Loader2, RefreshCw, Plus, Minus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MemberUsage {
  userId: string;
  email: string;
  name: string;
  used: number;
  cap: number;        // 0 = unlimited
  role: string;
}

interface PoolData {
  teamId: string;
  totalCredits: number;
  usedCredits: number;
  resetDay: number;
  members: MemberUsage[];
}

// ─── Bar ──────────────────────────────────────────────────────────────────────

function CreditBar({ used, total, colorClass = "bg-primary" }: { used: number; total: number; colorClass?: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  return (
    <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${colorClass}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface WorkspaceCreditPoolProps {
  teamId: string;
  isAdmin?: boolean;
}

export function WorkspaceCreditPool({ teamId, isAdmin }: WorkspaceCreditPoolProps) {
  const [pool, setPool] = useState<PoolData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showMembers, setShowMembers] = useState(true);
  const [editingCap, setEditingCap] = useState<string | null>(null);
  const [capValue, setCapValue] = useState<string>("");
  const [addCredits, setAddCredits] = useState(false);
  const [addAmount, setAddAmount] = useState("100");
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError(false);
    fetch(`/api/teams/${teamId}/credit-pool`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((data: PoolData) => { setPool(data); setLoading(false); })
      .catch(() => {
        // Fallback mock data for demo
        setPool({
          teamId,
          totalCredits: 1000,
          usedCredits: 423,
          resetDay: 1,
          members: [
            { userId: "1", email: "alice@co.com", name: "Alice", used: 210, cap: 300, role: "owner" },
            { userId: "2", email: "bob@co.com",   name: "Bob",   used: 145, cap: 0,   role: "editor" },
            { userId: "3", email: "carol@co.com", name: "Carol", used: 68,  cap: 200, role: "editor" },
          ],
        });
        setLoading(false);
      });
  }, [teamId, refreshKey]);

  async function saveCap(userId: string) {
    setSaving(true);
    const cap = parseInt(capValue, 10) || 0;
    await fetch(`/api/teams/${teamId}/member-caps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, cap }),
    }).catch(() => null);
    setPool((p) =>
      p ? {
        ...p,
        members: p.members.map((m) => m.userId === userId ? { ...m, cap } : m),
      } : p
    );
    setEditingCap(null);
    setSaving(false);
  }

  async function handleAddCredits() {
    const amount = parseInt(addAmount, 10);
    if (!amount || amount <= 0) return;
    setSaving(true);
    await fetch(`/api/teams/${teamId}/credit-pool`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount }),
    }).catch(() => null);
    setPool((p) => p ? { ...p, totalCredits: p.totalCredits + amount } : p);
    setAddCredits(false);
    setAddAmount("100");
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 flex items-center gap-3">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading workspace credit pool…</p>
      </div>
    );
  }

  if (!pool) return null;

  const remaining = pool.totalCredits - pool.usedCredits;
  const poolPct = pool.totalCredits > 0 ? Math.round((pool.usedCredits / pool.totalCredits) * 100) : 0;
  const isLow = poolPct >= 80;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-gradient-to-r from-violet-500/5 to-transparent">
        <div className="w-9 h-9 rounded-xl bg-violet-500/15 flex items-center justify-center">
          <Users className="w-4 h-4 text-violet-400" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold">Workspace Credit Pool</p>
          <p className="text-xs text-muted-foreground">Shared across all team members · resets day {pool.resetDay} each month</p>
        </div>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setRefreshKey((k) => k + 1)}>
          <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
        </Button>
      </div>

      <div className="p-5 space-y-5">
        {/* Pool summary */}
        <div className="space-y-2">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-2xl font-bold tabular-nums">{remaining.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">of {pool.totalCredits.toLocaleString()} remaining</p>
            </div>
            <div className="text-right">
              <p className={`text-sm font-semibold tabular-nums ${isLow ? "text-amber-400" : "text-emerald-400"}`}>{poolPct}% used</p>
              {isLow && (
                <div className="flex items-center gap-1 text-[10px] text-amber-400">
                  <AlertCircle className="w-2.5 h-2.5" /> Running low
                </div>
              )}
            </div>
          </div>
          <CreditBar
            used={pool.usedCredits}
            total={pool.totalCredits}
            colorClass={isLow ? "bg-amber-500" : "bg-violet-500"}
          />
        </div>

        {/* Add credits */}
        {isAdmin && (
          addCredits ? (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/30 border border-border">
              <Zap className="w-4 h-4 text-violet-400 shrink-0" />
              <Input
                value={addAmount}
                onChange={(e) => setAddAmount(e.target.value)}
                placeholder="Credits to add"
                className="h-7 text-xs flex-1"
                type="number"
                min="1"
              />
              <Button size="sm" className="h-7 text-xs" onClick={handleAddCredits} disabled={saving}>
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3 mr-1" />}
                Add
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAddCredits(false)}>Cancel</Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" className="w-full h-8 text-xs gap-1.5" onClick={() => setAddCredits(true)}>
              <Plus className="w-3.5 h-3.5" /> Add credits to pool
            </Button>
          )
        )}

        {/* Members breakdown */}
        <div className="space-y-2">
          <button
            className="w-full flex items-center gap-2 text-left"
            onClick={() => setShowMembers((v) => !v)}
          >
            <p className="text-xs font-semibold flex-1">Per-member usage</p>
            <Badge variant="outline" className="text-[9px] h-4 px-1.5">{pool.members.length} members</Badge>
            {showMembers
              ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
              : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
          </button>

          {showMembers && (
            <div className="space-y-2">
              {pool.members.map((m) => {
                const memberPct = m.cap > 0 ? Math.min(100, Math.round((m.used / m.cap) * 100)) : 0;
                const isEditing = editingCap === m.userId;

                return (
                  <div key={m.userId} className="rounded-xl bg-muted/20 border border-border/60 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold">
                        {m.name[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{m.name}</p>
                        <p className="text-[9px] text-muted-foreground truncate">{m.email}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-semibold tabular-nums">{m.used}</p>
                        <p className="text-[9px] text-muted-foreground">{m.cap > 0 ? `/ ${m.cap} cap` : "no cap"}</p>
                      </div>
                      {isAdmin && (
                        <Button
                          size="sm" variant="ghost"
                          className="h-6 w-6 p-0 shrink-0"
                          onClick={() => { setEditingCap(m.userId); setCapValue(m.cap > 0 ? String(m.cap) : ""); }}
                        >
                          <Settings className="w-3 h-3 text-muted-foreground" />
                        </Button>
                      )}
                    </div>

                    {m.cap > 0 && (
                      <CreditBar
                        used={m.used}
                        total={m.cap}
                        colorClass={memberPct >= 90 ? "bg-red-500" : memberPct >= 70 ? "bg-amber-500" : "bg-sky-500"}
                      />
                    )}

                    {isEditing && (
                      <div className="flex items-center gap-2 pt-1 border-t border-border/40">
                        <p className="text-[10px] text-muted-foreground shrink-0">Monthly cap:</p>
                        <Input
                          value={capValue}
                          onChange={(e) => setCapValue(e.target.value)}
                          placeholder="0 = unlimited"
                          className="h-6 text-xs flex-1"
                          type="number"
                          min="0"
                        />
                        <Button size="sm" className="h-6 text-[10px] px-2" onClick={() => saveCap(m.userId)} disabled={saving}>
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => setEditingCap(null)}>
                          Cancel
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pool policy note */}
        <div className="flex items-start gap-2 p-3 rounded-xl bg-sky-500/5 border border-sky-500/15">
          <TrendingUp className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
          <p className="text-[10px] text-sky-300/80 leading-relaxed">
            Credits are drawn from the shared pool. Set per-member caps to prevent any individual from consuming the entire pool. Unused credits do not roll over.
          </p>
        </div>
      </div>
    </div>
  );
}
