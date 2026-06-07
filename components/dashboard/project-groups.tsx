"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  FolderOpen, Folder, Plus, MoreHorizontal, Pencil, Trash2,
  Layers, Check,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProjectGroup {
  id: string;
  user_id: string;
  name: string;
  color: string;
  position: number;
  parent_id?: string | null;
  created_at: string;
  updated_at: string;
}

/** Flatten groups into tree order with depth (max 3 levels). */
function buildGroupTree(groups: ProjectGroup[]): Array<{ group: ProjectGroup; depth: number }> {
  const byParent = new Map<string | null, ProjectGroup[]>();
  for (const g of groups) {
    const key = g.parent_id ?? null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(g);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
  }
  const result: Array<{ group: ProjectGroup; depth: number }> = [];
  function walk(parentId: string | null, depth: number) {
    if (depth > 2) return;
    for (const g of byParent.get(parentId) ?? []) {
      result.push({ group: g, depth });
      walk(g.id, depth + 1);
    }
  }
  walk(null, 0);
  return result;
}

interface ProjectGroupsProps {
  /** Currently selected group id; null = "All Projects" */
  activeGroupId: string | null;
  /** Total project count (for "All" badge) */
  totalCount: number;
  /** Count of projects per group */
  groupCounts: Record<string, number>;
  onGroupSelect: (groupId: string | null) => void;
  /** Called when a group is created/updated/deleted so parent can refresh */
  onGroupsChange: () => void;
}

// ─── Preset colors ────────────────────────────────────────────────────────────

const PRESET_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444",
  "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#3b82f6", "#64748b",
];

// ─── Color dot ────────────────────────────────────────────────────────────────

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-1">
      {PRESET_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110"
          style={{
            backgroundColor: c,
            borderColor: value === c ? "white" : "transparent",
            outline: value === c ? `2px solid ${c}` : "none",
            outlineOffset: "1px",
          }}
        />
      ))}
    </div>
  );
}

// ─── Create/Edit Dialog ───────────────────────────────────────────────────────

function GroupDialog({
  open,
  onClose,
  initial,
  title,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  initial?: { name: string; color: string };
  title?: string;
  onSave: (name: string, color: string) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState(initial?.color ?? PRESET_COLORS[0]);
  const [saving, setSaving] = useState(false);

  // Reset when opened
  useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
      setColor(initial?.color ?? PRESET_COLORS[0]);
    }
  }, [open, initial?.name, initial?.color]);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave(name.trim(), color);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title ?? (initial ? "Rename group" : "New group")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <Input
            placeholder="Group name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            autoFocus
          />
          <div>
            <p className="text-xs text-muted-foreground mb-1">Color</p>
            <ColorPicker value={color} onChange={setColor} />
          </div>
          {/* Preview */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/40 border border-border">
            <Folder className="w-4 h-4 shrink-0" style={{ color }} />
            <span className="text-sm font-medium">{name || "Group name"}</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={!name.trim() || saving}>
            {saving ? "Saving…" : initial ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ProjectGroups({
  activeGroupId,
  totalCount,
  groupCounts,
  onGroupSelect,
  onGroupsChange,
}: ProjectGroupsProps) {
  const [groups, setGroups] = useState<ProjectGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [createParentId, setCreateParentId] = useState<string | null>(null);
  const [editingGroup, setEditingGroup] = useState<ProjectGroup | null>(null);

  const loadGroups = useCallback(async () => {
    try {
      const res = await fetch("/api/projects/groups");
      if (res.ok) setGroups(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadGroups(); }, [loadGroups]);

  const handleCreate = async (name: string, color: string) => {
    const res = await fetch("/api/projects/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        color,
        ...(createParentId ? { parent_id: createParentId } : {}),
      }),
    });
    if (res.ok) {
      setCreateParentId(null);
      await loadGroups();
      onGroupsChange();
    }
  };

  const handleEdit = async (name: string, color: string) => {
    if (!editingGroup) return;
    const res = await fetch(`/api/projects/groups/${editingGroup.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, color }),
    });
    if (res.ok) {
      await loadGroups();
      onGroupsChange();
    }
  };

  const handleDelete = async (group: ProjectGroup) => {
    const res = await fetch(`/api/projects/groups/${group.id}`, { method: "DELETE" });
    if (res.ok) {
      if (activeGroupId === group.id) onGroupSelect(null);
      await loadGroups();
      onGroupsChange();
    }
  };

  return (
    <>
      <div className="flex flex-col gap-0.5">
        {/* All Projects */}
        <button
          onClick={() => onGroupSelect(null)}
          className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm transition-colors w-full text-left ${
            activeGroupId === null
              ? "bg-accent text-accent-foreground font-medium"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          }`}
        >
          <Layers className="w-4 h-4 shrink-0" />
          <span className="flex-1">All Projects</span>
          <Badge variant="secondary" className="text-[10px] h-4 px-1.5 font-normal">
            {totalCount}
          </Badge>
        </button>

        {/* Divider */}
        {groups.length > 0 && (
          <div className="my-1 border-t border-border" />
        )}

        {/* Group list */}
        {loading ? (
          <div className="px-2.5 py-1 text-xs text-muted-foreground">Loading…</div>
        ) : (
          buildGroupTree(groups).map(({ group, depth }) => {
            const isActive = activeGroupId === group.id;
            const count = groupCounts[group.id] ?? 0;
            return (
              <div key={group.id} className="flex items-center gap-0.5 group/row" style={{ paddingLeft: depth * 12 }}>
                <button
                  onClick={() => onGroupSelect(group.id)}
                  className={`flex-1 flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm transition-colors text-left min-w-0 ${
                    isActive
                      ? "bg-accent text-accent-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  {isActive
                    ? <FolderOpen className="w-4 h-4 shrink-0" style={{ color: group.color }} />
                    : <Folder className="w-4 h-4 shrink-0" style={{ color: group.color }} />
                  }
                  <span className="flex-1 truncate">{group.name}</span>
                  {count > 0 && (
                    <Badge variant="secondary" className="text-[10px] h-4 px-1.5 font-normal shrink-0">
                      {count}
                    </Badge>
                  )}
                </button>

                {/* Actions */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="p-1 rounded opacity-0 group-hover/row:opacity-100 hover:bg-muted transition-all shrink-0">
                      <MoreHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    {depth < 2 && (
                      <DropdownMenuItem
                        className="text-xs gap-2"
                        onClick={() => {
                          setCreateParentId(group.id);
                          setCreateOpen(true);
                        }}
                      >
                        <Plus className="w-3.5 h-3.5" />New subfolder
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      className="text-xs gap-2"
                      onClick={() => setEditingGroup(group)}
                    >
                      <Pencil className="w-3.5 h-3.5" />Rename
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-xs gap-2 text-destructive focus:text-destructive"
                      onClick={() => handleDelete(group)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })
        )}

        {/* New group button */}
        <button
          onClick={() => {
            setCreateParentId(null);
            setCreateOpen(true);
          }}
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors w-full mt-0.5"
        >
          <Plus className="w-3.5 h-3.5" />
          New group
        </button>
      </div>

      {/* Create dialog */}
      <GroupDialog
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          setCreateParentId(null);
        }}
        title={createParentId ? "New subfolder" : "New group"}
        onSave={handleCreate}
      />

      {/* Edit dialog */}
      <GroupDialog
        open={!!editingGroup}
        onClose={() => setEditingGroup(null)}
        initial={editingGroup ? { name: editingGroup.name, color: editingGroup.color } : undefined}
        onSave={handleEdit}
      />
    </>
  );
}

// ─── Assign-to-group dropdown (used on project card context menu) ─────────────

interface AssignGroupMenuProps {
  projectId: string;
  currentGroupId: string | null;
  groups: ProjectGroup[];
  onAssigned: (groupId: string | null) => void;
}

export function AssignGroupMenu({ projectId, currentGroupId, groups, onAssigned }: AssignGroupMenuProps) {
  const assign = async (groupId: string | null) => {
    const res = await fetch(`/api/projects/${projectId}/group`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupId }),
    });
    if (res.ok) onAssigned(groupId);
  };

  if (groups.length === 0) return null;

  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuItem className="text-xs font-medium text-muted-foreground" disabled>
        Move to group
      </DropdownMenuItem>
      {currentGroupId && (
        <DropdownMenuItem className="text-xs gap-2" onClick={() => assign(null)}>
          <Layers className="w-3.5 h-3.5" />No group
        </DropdownMenuItem>
      )}
      {groups.map((g) => (
        <DropdownMenuItem
          key={g.id}
          className="text-xs gap-2"
          onClick={() => assign(g.id)}
        >
          <Folder className="w-3.5 h-3.5" style={{ color: g.color }} />
          {g.name}
          {currentGroupId === g.id && <Check className="w-3 h-3 ml-auto" />}
        </DropdownMenuItem>
      ))}
    </>
  );
}
