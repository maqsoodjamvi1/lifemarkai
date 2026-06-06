"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MessageSquare, Send, Check, CheckCheck, Trash2, Reply, MoreHorizontal, Loader2, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";

interface CommentAuthor {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  email: string | null;
}

interface Comment {
  id: string;
  project_id: string;
  user_id: string;
  parent_id: string | null;
  content: string;
  resolved: boolean;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  element_xpath?: string | null;
  element_tag?: string | null;
  page_path?: string | null;
  element_preview?: string | null;
  author: CommentAuthor | null;
}

interface CommentsPanelProps {
  projectId: string;
  currentUserId: string;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function authorLabel(author: CommentAuthor | null): string {
  return author?.full_name || author?.email?.split("@")[0] || "User";
}

function authorInitials(author: CommentAuthor | null): string {
  const name = authorLabel(author);
  return name.slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = [
  "bg-violet-500", "bg-blue-500", "bg-emerald-500",
  "bg-amber-500", "bg-rose-500", "bg-cyan-500",
];

function avatarColor(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

// ── Single comment card ──────────────────────────────────────────────────────
function CommentCard({
  comment,
  currentUserId,
  replies,
  onReply,
  onResolve,
  onDelete,
  depth = 0,
}: {
  comment: Comment;
  currentUserId: string;
  replies: Comment[];
  onReply: (parentId: string) => void;
  onResolve: (id: string, resolved: boolean) => void;
  onDelete: (id: string) => void;
  depth?: number;
}) {
  const isOwn = comment.user_id === currentUserId;

  return (
    <div className={`${depth > 0 ? "ml-6 border-l border-border pl-3" : ""}`}>
      <div className={`group rounded-lg p-3 transition-colors ${comment.resolved ? "opacity-50" : "hover:bg-muted/30"}`}>
        {/* Author row */}
        <div className="flex items-start gap-2">
          {/* Avatar */}
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0 ${avatarColor(comment.user_id)}`}>
            {comment.author?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={comment.author.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
            ) : (
              authorInitials(comment.author)
            )}
          </div>

          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-semibold text-foreground">{authorLabel(comment.author)}</span>
              {comment.resolved && (
                <span className="flex items-center gap-0.5 text-[10px] text-emerald-500 font-medium">
                  <CheckCheck className="w-3 h-3" />Resolved
                </span>
              )}
              <span className="text-[10px] text-muted-foreground ml-auto">{timeAgo(comment.created_at)}</span>
            </div>

            {comment.element_xpath && (
              <p className="text-[10px] text-blue-400/80 mt-1 font-mono truncate" title={comment.element_xpath}>
                📍 &lt;{comment.element_tag ?? "element"}&gt; on {comment.page_path ?? "/"}
                {comment.element_preview ? ` — ${comment.element_preview}` : ""}
              </p>
            )}

            {/* Content */}
            <p className="text-xs text-foreground/90 mt-1 leading-relaxed whitespace-pre-wrap break-words">
              {comment.content}
            </p>

            {/* Actions */}
            <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
              {depth === 0 && (
                <button
                  onClick={() => onReply(comment.id)}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Reply className="w-3 h-3" />Reply
                </button>
              )}

              <button
                onClick={() => onResolve(comment.id, !comment.resolved)}
                className={`flex items-center gap-1 text-[10px] transition-colors ml-2 ${
                  comment.resolved
                    ? "text-muted-foreground hover:text-foreground"
                    : "text-muted-foreground hover:text-emerald-500"
                }`}
              >
                <Check className="w-3 h-3" />
                {comment.resolved ? "Unresolve" : "Resolve"}
              </button>

              {isOwn && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="ml-2 text-muted-foreground hover:text-foreground transition-colors">
                      <MoreHorizontal className="w-3.5 h-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-32">
                    <DropdownMenuItem
                      onClick={() => onDelete(comment.id)}
                      className="text-xs text-destructive gap-2"
                    >
                      <Trash2 className="w-3.5 h-3.5" />Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Replies */}
      {replies.length > 0 && (
        <div className="space-y-0.5 mt-0.5">
          {replies.map((reply) => (
            <CommentCard
              key={reply.id}
              comment={reply}
              currentUserId={currentUserId}
              replies={[]}
              onReply={onReply}
              onResolve={onResolve}
              onDelete={onDelete}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main panel ───────────────────────────────────────────────────────────────
export function CommentsPanel({ projectId, currentUserId }: CommentsPanelProps) {
  const { toast } = useToast();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "open" | "resolved">("all");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Load comments
  const loadComments = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/comments`);
    if (res.ok) setComments(await res.json());
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  // Real-time subscription
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`comments:${projectId}`)
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "project_comments", filter: `project_id=eq.${projectId}` },
        () => { loadComments(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [projectId, loadComments]);

  // Focus textarea when replying
  useEffect(() => {
    if (replyTo) textareaRef.current?.focus();
  }, [replyTo]);

  const handleSend = async () => {
    if (!text.trim() || sending) return;
    setSending(true);

    const res = await fetch(`/api/projects/${projectId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: text.trim(), parent_id: replyTo }),
    });

    if (res.ok) {
      const newComment: Comment = await res.json();
      setComments((prev) => [...prev, newComment]);
      setText("");
      setReplyTo(null);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } else {
      toast({ title: "Failed to post comment", variant: "destructive" });
    }
    setSending(false);
  };

  const handleResolve = async (id: string, resolved: boolean) => {
    const res = await fetch(`/api/projects/${projectId}/comments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolved }),
    });
    if (res.ok) {
      const updated: Comment = await res.json();
      setComments((prev) => prev.map((c) => (c.id === id ? updated : c)));
    }
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/projects/${projectId}/comments/${id}`, { method: "DELETE" });
    if (res.ok) setComments((prev) => prev.filter((c) => c.id !== id && c.parent_id !== id));
    else toast({ title: "Failed to delete", variant: "destructive" });
  };

  // Organise into threads
  const topLevel = comments.filter((c) => !c.parent_id);
  const repliesMap = comments.reduce<Record<string, Comment[]>>((acc, c) => {
    if (c.parent_id) {
      if (!acc[c.parent_id]) acc[c.parent_id] = [];
      acc[c.parent_id].push(c);
    }
    return acc;
  }, {});

  const filtered = topLevel.filter((c) => {
    if (filter === "open") return !c.resolved;
    if (filter === "resolved") return c.resolved;
    return true;
  });

  const openCount = topLevel.filter((c) => !c.resolved).length;
  const replyTarget = replyTo ? comments.find((c) => c.id === replyTo) : null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">Comments</span>
          {openCount > 0 && (
            <span className="text-[10px] font-medium bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
              {openCount}
            </span>
          )}
        </div>
        {/* Filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <Filter className="w-3.5 h-3.5" />
              {filter === "all" ? "All" : filter === "open" ? "Open" : "Resolved"}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-28">
            {(["all", "open", "resolved"] as const).map((f) => (
              <DropdownMenuItem
                key={f}
                onClick={() => setFilter(f)}
                className={`text-xs capitalize ${filter === f ? "bg-accent" : ""}`}
              >
                {f}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Comment list */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-center gap-2">
            <MessageSquare className="w-8 h-8 text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground">
              {filter === "resolved" ? "No resolved comments" : "No comments yet"}
            </p>
            {filter === "all" && (
              <p className="text-[10px] text-muted-foreground/60">
                Leave a comment to start a discussion
              </p>
            )}
          </div>
        ) : (
          filtered.map((comment) => (
            <CommentCard
              key={comment.id}
              comment={comment}
              currentUserId={currentUserId}
              replies={repliesMap[comment.id] ?? []}
              onReply={(pid) => {
                setReplyTo(pid);
                textareaRef.current?.focus();
              }}
              onResolve={handleResolve}
              onDelete={handleDelete}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Compose */}
      <div className="border-t border-border p-3 shrink-0 space-y-2">
        {/* Reply context banner */}
        {replyTo && replyTarget && (
          <div className="flex items-center justify-between bg-muted/50 rounded-md px-2.5 py-1.5 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Reply className="w-3 h-3" />
              Replying to <span className="font-medium text-foreground">{authorLabel(replyTarget.author)}</span>
            </span>
            <button onClick={() => setReplyTo(null)} className="hover:text-foreground transition-colors">✕</button>
          </div>
        )}

        <div className="flex gap-2 items-end">
          <Textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSend();
            }}
            placeholder={replyTo ? "Write a reply…" : "Add a comment…"}
            className="min-h-[64px] max-h-40 text-xs resize-none flex-1"
          />
          <Button
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={handleSend}
            disabled={!text.trim() || sending}
          >
            {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground">⌘↵ to send</p>
      </div>
    </div>
  );
}
