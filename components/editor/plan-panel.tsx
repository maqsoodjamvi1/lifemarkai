"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Send, Loader2, Sparkles, CheckCheck, Pencil, RotateCcw,
  ChevronDown, XCircle, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { createClient } from "@/lib/supabase/client";
import type { Project, ProjectFile } from "@/types/database";

interface PlanMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  hasPlan?: boolean;         // assistant message that includes a formal plan
}

interface PlanPanelProps {
  project: Project;
  files: ProjectFile[];
  /** Called when user approves a plan — switches editor to Agent mode */
  onApprovePlan: (planMarkdown: string) => void;
}

const EXAMPLE_PROMPTS = [
  "Add email/password authentication with password reset. Users should stay logged in for 30 days.",
  "What's the best way to implement real-time notifications in this project?",
  "Walk me through adding a shopping cart with Stripe checkout.",
  "Review my current setup and suggest security improvements.",
];

/** Extract the first fenced markdown code block, or return the full content */
function extractPlanMarkdown(content: string): string | null {
  const fenceMatch = content.match(/```(?:markdown|md)?\n([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();
  // If the message contains a formal plan header, treat whole content as plan
  if (content.includes("## ") || content.includes("# ")) return content;
  return null;
}

export function PlanPanel({ project, files, onApprovePlan }: PlanPanelProps) {
  const [messages, setMessages] = useState<PlanMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [approvedPlan, setApprovedPlan] = useState<string | null>(null);
  const [editingPlan, setEditingPlan] = useState<string | null>(null);  // when editing
  const [planMsgId, setPlanMsgId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(false);
    if (streamingContent) {
      const id = `plan-${Date.now()}`;
      const hasPlan = !!extractPlanMarkdown(streamingContent);
      setMessages((prev) => [
        ...prev,
        { id, role: "assistant", content: streamingContent, hasPlan },
      ]);
      if (hasPlan) setPlanMsgId(id);
    }
    setStreamingContent("");
  }, [streamingContent]);

  async function sendMessage(overrideInput?: string) {
    const text = (overrideInput ?? input).trim();
    if (!text || streaming) return;

    const userMsg: PlanMessage = { id: `u-${Date.now()}`, role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setStreaming(true);
    setStreamingContent("");

    abortRef.current = new AbortController();

    const systemPrompt = `You are a senior software architect in Plan mode for a project called "${project.name}".

CRITICAL RULES:
- You are in PLAN MODE. You NEVER write or modify any code.
- You explore ideas, ask clarifying questions, investigate issues, and reason about changes.
- When you have a clear implementation to propose, produce a formal markdown plan.
- Plans are structured documents with: overview, key decisions, components/data models/APIs, step-by-step implementation sequence.
- Be conversational and ask clarifying questions before creating a formal plan when needed.
- Keep plans precise and actionable.

Current project files: ${files.map(f => f.path).slice(0, 20).join(", ")}${files.length > 20 ? "..." : ""}`;

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
          mode: "plan",
          systemPrompt,
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) throw new Error("Plan request failed");
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        // Parse SSE lines
        for (const line of chunk.split("\n")) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content ?? parsed.delta?.text ?? parsed.content ?? "";
              if (delta) {
                fullContent += delta;
                setStreamingContent(fullContent);
              }
            } catch {
              // plain text chunk
              fullContent += data;
              setStreamingContent(fullContent);
            }
          }
        }
      }

      const id = `a-${Date.now()}`;
      const hasPlan = !!extractPlanMarkdown(fullContent);
      setMessages((prev) => [
        ...prev,
        { id, role: "assistant", content: fullContent, hasPlan },
      ]);
      if (hasPlan) setPlanMsgId(id);
    } catch (err: unknown) {
      if ((err as Error).name !== "AbortError") {
        toast({ title: "Plan generation failed", variant: "destructive" });
        // Fallback: generate a simple plan
        const fallbackPlan = `# Plan: ${text.slice(0, 60)}

## Overview
Based on your request, here's a structured approach for implementing this feature in ${project.name}.

## Key Decisions
- Use the existing stack (Next.js 14, TypeScript, Supabase, Tailwind CSS)
- Follow the current project patterns and conventions
- Implement incrementally to minimise risk

## Components & Data Models
- Define required database schema changes first
- Build reusable UI components
- Wire up API routes and server actions

## Implementation Steps
1. **Database** — Create/update tables, RLS policies, and types
2. **Backend** — Add API routes and server-side logic
3. **UI Components** — Build the interface components
4. **Integration** — Connect frontend to backend
5. **Testing** — Verify the feature works end-to-end

## Notes
- Review each step before implementation
- Approve this plan to switch to Agent mode and begin building`;
        const id = `a-${Date.now()}`;
        setMessages((prev) => [...prev, { id, role: "assistant", content: fallbackPlan, hasPlan: true }]);
        setPlanMsgId(id);
      }
    } finally {
      setStreaming(false);
      setStreamingContent("");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  async function approvePlan(planContent: string) {
    const markdown = extractPlanMarkdown(planContent) ?? planContent;
    setApprovedPlan(markdown);

    // Save plan to project files via API
    try {
      await fetch(`/api/projects/${project.id}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: ".lovable/plan.md",
          content: markdown,
          language: "markdown",
        }),
      });
    } catch {
      // Non-critical — plan still approved in memory
    }

    onApprovePlan(markdown);
    toast({ title: "Plan approved — switching to Agent mode" });
  }

  function startEditPlan(content: string) {
    setEditingPlan(extractPlanMarkdown(content) ?? content);
  }

  function resetChat() {
    setMessages([]);
    setApprovedPlan(null);
    setEditingPlan(null);
    setPlanMsgId(null);
    setInput("");
  }

  const isEmpty = messages.length === 0 && !streaming;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5">

        {/* Empty state */}
        {isEmpty && (
          <div className="flex flex-col h-full items-center justify-center py-8 px-2">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-600/20 to-blue-600/10 border border-violet-500/20 flex items-center justify-center mb-4">
              <FileText className="w-6 h-6 text-violet-400" />
            </div>
            <h3 className="text-sm font-semibold mb-1">Plan before you build</h3>
            <p className="text-xs text-muted-foreground text-center mb-6 max-w-[220px] leading-relaxed">
              Explore ideas, investigate issues, and decide on an approach — without touching any code.
            </p>
            <div className="w-full space-y-2">
              {EXAMPLE_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => { setInput(p); textareaRef.current?.focus(); }}
                  className="w-full text-left text-xs px-3.5 py-2.5 rounded-xl border border-border/60 bg-muted/30 hover:bg-muted hover:border-border transition-all text-muted-foreground hover:text-foreground group"
                >
                  <span className="flex items-start gap-2">
                    <span className="mt-0.5 text-violet-400/60 group-hover:text-violet-400 transition-colors">→</span>
                    <span>{p}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Message thread */}
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "user" ? (
                <div className="max-w-[80%] px-3.5 py-2.5 rounded-2xl rounded-br-sm bg-muted text-sm leading-relaxed text-foreground">
                  {msg.content}
                </div>
              ) : (
                <div className="w-full space-y-3">
                  {/* If this message has a formal plan, show it in a plan card */}
                  {msg.hasPlan ? (
                    <div className="rounded-xl border border-border bg-card overflow-hidden">
                      {/* Plan card header */}
                      <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 border-b border-border">
                        <FileText className="w-3.5 h-3.5 text-violet-400" />
                        <span className="text-xs font-semibold text-foreground">Implementation Plan</span>
                        <span className="ml-auto text-[10px] text-muted-foreground">Plan mode · no code changed</span>
                      </div>

                      {/* Editable plan or rendered markdown */}
                      {editingPlan !== null && planMsgId === msg.id ? (
                        <div className="p-3 space-y-2">
                          <Textarea
                            value={editingPlan}
                            onChange={(e) => setEditingPlan(e.target.value)}
                            className="min-h-[260px] resize-none text-xs font-mono bg-background border-border"
                            autoFocus
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="flex-1 h-7 text-xs bg-[#0066FF] hover:bg-[#0052cc] text-white"
                              onClick={() => {
                                // Save edited plan back to the message
                                setMessages((prev) =>
                                  prev.map((m) =>
                                    m.id === msg.id ? { ...m, content: editingPlan } : m
                                  )
                                );
                                setEditingPlan(null);
                              }}
                            >
                              Save edits
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs"
                              onClick={() => setEditingPlan(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="px-4 py-3 prose prose-sm prose-invert max-w-none text-sm leading-relaxed
                          [&_h1]:text-base [&_h1]:font-bold [&_h1]:mb-2 [&_h1]:mt-1
                          [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mb-1.5 [&_h2]:mt-3 [&_h2]:text-foreground
                          [&_h3]:text-xs [&_h3]:font-semibold [&_h3]:mb-1 [&_h3]:mt-2
                          [&_ul]:space-y-0.5 [&_ol]:space-y-0.5 [&_li]:text-xs [&_li]:text-muted-foreground
                          [&_p]:text-xs [&_p]:text-muted-foreground [&_p]:mb-2
                          [&_strong]:text-foreground [&_code]:text-violet-400 [&_code]:bg-muted [&_code]:px-1 [&_code]:rounded
                        ">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {extractPlanMarkdown(msg.content) ?? msg.content}
                          </ReactMarkdown>
                        </div>
                      )}

                      {/* Plan actions */}
                      {editingPlan === null && (
                        <div className="flex items-center gap-2 px-3 py-2 border-t border-border bg-muted/20">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs gap-1.5"
                            onClick={() => startEditPlan(msg.content)}
                          >
                            <Pencil className="w-3 h-3" />
                            Edit plan
                          </Button>
                          <Button
                            size="sm"
                            className="ml-auto h-7 text-xs gap-1.5 bg-[#0066FF] hover:bg-[#0052cc] text-white"
                            onClick={() => approvePlan(msg.content)}
                          >
                            <CheckCheck className="w-3 h-3" />
                            Approve &amp; Build
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Regular plan-mode conversation message */
                    <div className="text-sm leading-relaxed text-foreground py-0.5">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}
                        components={{
                          p: ({ children }) => <p className="mb-2 text-sm text-foreground">{children}</p>,
                          ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5 text-sm text-muted-foreground">{children}</ul>,
                          ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5 text-sm text-muted-foreground">{children}</ol>,
                          strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                          code: ({ children }) => <code className="text-violet-400 bg-muted px-1 rounded text-xs">{children}</code>,
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Streaming */}
        {streaming && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex justify-start">
            <div className="w-full text-sm leading-relaxed text-foreground py-0.5">
              {streamingContent ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}
                  components={{
                    p: ({ children }) => <p className="mb-2 text-sm text-foreground">{children}</p>,
                    ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5 text-sm text-muted-foreground">{children}</ul>,
                    strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                    code: ({ children }) => <code className="text-violet-400 bg-muted px-1 rounded text-xs">{children}</code>,
                  }}
                >
                  {streamingContent}
                </ReactMarkdown>
              ) : (
                <div className="flex items-center gap-1.5 py-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 typing-dot" />
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 typing-dot" />
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 typing-dot" />
                </div>
              )}
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Approved plan banner */}
      {approvedPlan && (
        <div className="mx-3 mb-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2 text-xs text-emerald-400">
          <CheckCheck className="w-3.5 h-3.5 shrink-0" />
          Plan approved — Agent mode will implement it
          <button
            className="ml-auto text-emerald-400/60 hover:text-emerald-400 transition-colors"
            onClick={() => setApprovedPlan(null)}
          >
            <XCircle className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* "No code changed" info bar */}
      {messages.length > 0 && (
        <div className="mx-3 mb-1 flex items-center gap-1.5 text-[10px] text-muted-foreground/50">
          <Sparkles className="w-2.5 h-2.5" />
          Plan mode · no code is modified until you approve
          <button onClick={resetChat} className="ml-auto flex items-center gap-0.5 hover:text-muted-foreground transition-colors">
            <RotateCcw className="w-2.5 h-2.5" />
            New plan
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="px-3 pb-3 pt-1 border-t border-border shrink-0">
        <div className="relative rounded-2xl border border-border bg-background shadow-sm focus-within:border-border/80 transition-colors">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your codebase, explore ideas, or describe what to build…"
            className="min-h-[56px] max-h-40 resize-none border-0 bg-transparent px-4 pt-3.5 pb-2 text-sm focus-visible:ring-0 placeholder:text-muted-foreground/50"
            disabled={streaming}
          />
          <div className="flex items-center gap-2 px-3 pb-3 pt-0">
            <span className="text-[10px] text-muted-foreground/40 font-medium">PLAN</span>
            <div className="flex-1" />
            {streaming ? (
              <button
                onClick={stopGeneration}
                className="w-8 h-8 rounded-full flex items-center justify-center bg-muted border border-border text-muted-foreground hover:text-foreground transition-colors"
              >
                <XCircle className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={() => void sendMessage()}
                disabled={!input.trim()}
                className="w-8 h-8 rounded-full flex items-center justify-center bg-gradient-to-br from-violet-500 to-blue-600 text-white shadow-sm hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
