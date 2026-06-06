"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Sparkles, Zap, Bot, Globe, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// ── Demo animation data ──────────────────────────────────────────────────────

const DEMO_SEQUENCES = [
  {
    prompt: "Build a SaaS dashboard with dark mode, user auth, and billing",
    files: [
      { name: "src/App.tsx",                    lang: "tsx" },
      { name: "src/pages/Dashboard.tsx",        lang: "tsx" },
      { name: "src/pages/Billing.tsx",          lang: "tsx" },
      { name: "src/components/Sidebar.tsx",     lang: "tsx" },
      { name: "src/lib/stripe.ts",              lang: "ts"  },
    ],
    code: [
      'import React from "react";',
      'import { Dashboard } from "./pages/Dashboard";',
      'import { AuthProvider } from "./context/auth";',
      '',
      'export default function App() {',
      '  return (',
      '    <AuthProvider>',
      '      <Dashboard />',
      '    </AuthProvider>',
      '  );',
      '}',
    ],
    deploy: "my-saas-dashboard",
  },
  {
    prompt: "Create a real-time chat app with rooms and online presence",
    files: [
      { name: "src/App.tsx",                    lang: "tsx" },
      { name: "src/components/ChatRoom.tsx",    lang: "tsx" },
      { name: "src/components/MessageList.tsx", lang: "tsx" },
      { name: "src/hooks/usePresence.ts",       lang: "ts"  },
      { name: "src/lib/supabase.ts",            lang: "ts"  },
    ],
    code: [
      'import { useEffect, useState } from "react";',
      'import { supabase } from "./lib/supabase";',
      '',
      'export function ChatRoom({ roomId }: { roomId: string }) {',
      '  const [messages, setMessages] = useState([]);',
      '',
      '  useEffect(() => {',
      '    const channel = supabase',
      '      .channel(`room:${roomId}`)',
      '      .on("postgres_changes", { event: "*",',
      '          schema: "public", table: "messages" },',
      '        (payload) => setMessages(m => [...m, payload.new]))',
      '      .subscribe();',
      '    return () => supabase.removeChannel(channel);',
      '  }, [roomId]);',
      '}',
    ],
    deploy: "real-time-chat",
  },
  {
    prompt: "Make an e-commerce store with product catalog and Stripe checkout",
    files: [
      { name: "src/App.tsx",                    lang: "tsx" },
      { name: "src/pages/Catalog.tsx",          lang: "tsx" },
      { name: "src/pages/Cart.tsx",             lang: "tsx" },
      { name: "src/components/ProductCard.tsx", lang: "tsx" },
      { name: "src/lib/stripe.ts",              lang: "ts"  },
    ],
    code: [
      'import { useState } from "react";',
      'import { ProductCard } from "./components/ProductCard";',
      'import { useCart } from "./hooks/useCart";',
      '',
      'export function Catalog({ products }) {',
      '  const { addToCart } = useCart();',
      '',
      '  return (',
      '    <div className="grid grid-cols-3 gap-6 p-8">',
      '      {products.map(product => (',
      '        <ProductCard',
      '          key={product.id}',
      '          product={product}',
      '          onAddToCart={() => addToCart(product)}',
      '        />',
      '      ))}',
      '    </div>',
      '  );',
      '}',
    ],
    deploy: "my-ecommerce-store",
  },
];

// ms each phase lasts
const PHASE_DURATIONS = {
  typing:     2800,   // typing out the prompt
  building:   1000,   // "Building..." spinner
  files:      2200,   // files appear (5 × 440ms)
  streaming:  2200,   // code lines stream in
  done:       1800,   // "Done / Live" celebration
  reset:       400,   // fade out before next
};

const TOTAL = Object.values(PHASE_DURATIONS).reduce((a, b) => a + b, 0);

const LANG_COLORS: Record<string, string> = {
  tsx: "text-cyan-400",
  ts:  "text-blue-400",
  css: "text-pink-400",
  js:  "text-yellow-400",
};

const QUICK_PROMPTS = ["SaaS dashboard", "E-commerce store", "Chat app", "Portfolio site"];

export function HeroSection() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");

  // ── Animation state ────────────────────────────────────────────────────────
  const [seqIdx,   setSeqIdx]   = useState(0);
  const [phase,    setPhase]    = useState<"typing"|"building"|"files"|"streaming"|"done"|"reset">("typing");
  const [typedLen, setTypedLen] = useState(0);
  const [filesShown, setFilesShown] = useState(0);
  const [linesShown, setLinesShown] = useState(0);

  const seq = DEMO_SEQUENCES[seqIdx];

  useEffect(() => {
    let raf: ReturnType<typeof setTimeout>;

    function tick() {
      if (phase === "typing") {
        const target = seq.prompt.length;
        if (typedLen < target) {
          const charsPerTick = Math.ceil(target / 28);
          setTypedLen((n) => Math.min(n + charsPerTick, target));
          raf = setTimeout(tick, 80);
        } else {
          raf = setTimeout(() => setPhase("building"), 200);
        }
      } else if (phase === "building") {
        raf = setTimeout(() => { setFilesShown(0); setPhase("files"); }, PHASE_DURATIONS.building);
      } else if (phase === "files") {
        if (filesShown < seq.files.length) {
          raf = setTimeout(() => setFilesShown((n) => n + 1), 440);
        } else {
          raf = setTimeout(() => { setLinesShown(0); setPhase("streaming"); }, 300);
        }
      } else if (phase === "streaming") {
        if (linesShown < seq.code.length) {
          raf = setTimeout(() => setLinesShown((n) => n + 1), PHASE_DURATIONS.streaming / seq.code.length);
        } else {
          raf = setTimeout(() => setPhase("done"), 300);
        }
      } else if (phase === "done") {
        raf = setTimeout(() => setPhase("reset"), PHASE_DURATIONS.done);
      } else if (phase === "reset") {
        raf = setTimeout(() => {
          const next = (seqIdx + 1) % DEMO_SEQUENCES.length;
          setSeqIdx(next);
          setTypedLen(0);
          setFilesShown(0);
          setLinesShown(0);
          setPhase("typing");
        }, PHASE_DURATIONS.reset);
      }
    }

    tick();
    return () => clearTimeout(raf);
  }, [phase, typedLen, filesShown, linesShown, seq, seqIdx]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;
    router.push(`/signup?prompt=${encodeURIComponent(prompt)}`);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <section className="relative min-h-screen flex items-center justify-center pt-16 hero-bg overflow-hidden">
      {/* Background blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-violet-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-brand-500/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-radial from-violet-500/5 to-transparent rounded-full" />
      </div>

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center py-20">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-sm font-medium mb-8"
        >
          <Sparkles className="w-4 h-4" />
          Powered by GPT-4o + Claude — Choose your AI
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-5xl md:text-7xl font-bold tracking-tight mb-6"
        >
          Build apps at the{" "}
          <span className="gradient-text">speed of thought</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-xl text-muted-foreground max-w-2xl mx-auto mb-12"
        >
          Describe your app in plain English. Get production-ready React + TypeScript code,
          Supabase backend, and one-click deployment — in seconds, not months.
        </motion.p>

        {/* Prompt Input */}
        <motion.form
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          onSubmit={handleSubmit}
          className="max-w-2xl mx-auto mb-6"
        >
          <div className="relative flex flex-col sm:flex-row gap-3 p-2 bg-card border border-border rounded-2xl shadow-2xl shadow-black/20">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe your app... e.g. 'Build a SaaS dashboard with auth and billing'"
              className="flex-1 bg-transparent resize-none outline-none text-sm px-3 py-2 min-h-[80px] placeholder:text-muted-foreground"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
            />
            <div className="flex items-end gap-2 pb-1 pr-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setPrompt(seq.prompt)}
                className="text-xs text-muted-foreground hover:text-foreground shrink-0"
              >
                <Sparkles className="w-3 h-3 mr-1" />
                Example
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={!prompt.trim()}
                className="bg-gradient-brand text-white hover:opacity-90 shrink-0 h-9 px-4"
              >
                Build it
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        </motion.form>

        {/* Quick prompts */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="flex flex-wrap items-center justify-center gap-3 mb-16 text-sm"
        >
          <span className="text-muted-foreground">Try:</span>
          {QUICK_PROMPTS.map((q) => (
            <button
              key={q}
              onClick={() => setPrompt(`Build a ${q.toLowerCase()}`)}
              className="px-3 py-1 rounded-full bg-muted hover:bg-accent border border-border text-muted-foreground hover:text-foreground transition-colors"
            >
              {q}
            </button>
          ))}
        </motion.div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="grid grid-cols-3 gap-8 max-w-lg mx-auto mb-20"
        >
          {[
            { label: "Apps built",     value: "50K+" },
            { label: "Developers",     value: "12K+" },
            { label: "Avg build time", value: "< 2min" },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-2xl font-bold gradient-text">{stat.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{stat.label}</div>
            </div>
          ))}
        </motion.div>

        {/* ── Animated demo window ─────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.6 }}
          className="relative mx-auto max-w-4xl"
        >
          {/* Live badge */}
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-500/10 border border-green-500/30 text-green-400 text-xs font-medium shadow-lg">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              Live Demo
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
            {/* Window chrome */}
            <div className="flex items-center gap-2 px-4 py-3 bg-muted/50 border-b border-border shrink-0">
              <div className="w-3 h-3 rounded-full bg-red-500/60" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
              <div className="w-3 h-3 rounded-full bg-green-500/60" />
              <div className="flex-1 mx-4 bg-background/50 rounded px-3 py-1 text-xs text-muted-foreground text-center truncate">
                lifemarkai.app/editor/{seq.deploy}
              </div>
              <div className="flex gap-2 shrink-0">
                <div className="flex items-center gap-1 text-xs text-muted-foreground px-2 py-1 rounded bg-background/50">
                  <Bot className="w-3 h-3" />
                  <span className="hidden sm:inline">Agent</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground px-2 py-1 rounded bg-background/50">
                  <Globe className="w-3 h-3" />
                  <span className="hidden sm:inline">Deploy</span>
                </div>
              </div>
            </div>

            {/* Editor layout */}
            <div className="flex h-72">
              {/* Chat panel */}
              <div className="w-64 xl:w-72 shrink-0 border-r border-border bg-background/30 flex flex-col overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50 shrink-0">
                  <Zap className="w-3 h-3 text-violet-400 shrink-0" />
                  <span className="text-xs font-medium text-muted-foreground">AI Chat</span>
                </div>

                <div className="flex-1 p-3 flex flex-col gap-2 overflow-hidden">
                  {/* User message */}
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={`prompt-${seqIdx}`}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      className="bg-muted rounded-lg p-2.5 text-xs text-muted-foreground leading-relaxed"
                    >
                      {seq.prompt.slice(0, typedLen)}
                      {phase === "typing" && (
                        <span className="inline-block w-0.5 h-3 bg-violet-400 ml-0.5 animate-pulse align-middle" />
                      )}
                    </motion.div>
                  </AnimatePresence>

                  {/* AI response */}
                  <AnimatePresence>
                    {(phase === "building" || phase === "files" || phase === "streaming" || phase === "done") && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-violet-500/10 border border-violet-500/20 rounded-lg p-2.5 text-xs flex-1 overflow-hidden"
                      >
                        <div className="flex items-center gap-1.5 mb-2 text-violet-400 font-medium">
                          {phase === "done" ? (
                            <CheckCircle2 className="w-3 h-3 text-green-400 shrink-0" />
                          ) : (
                            <span className="w-3 h-3 border-2 border-violet-400 border-t-transparent rounded-full animate-spin shrink-0" />
                          )}
                          {phase === "done" ? (
                            <span className="text-green-400">Done! Deploying...</span>
                          ) : (
                            "Building your app..."
                          )}
                        </div>

                        <div className="space-y-1">
                          {seq.files.slice(0, filesShown).map((f, i) => (
                            <motion.div
                              key={f.name}
                              initial={{ opacity: 0, x: -6 }}
                              animate={{ opacity: 1, x: 0 }}
                              className="flex items-center gap-1.5"
                            >
                              <CheckCircle2 className="w-2.5 h-2.5 text-green-400 shrink-0" />
                              <span className={`font-mono truncate ${LANG_COLORS[f.lang] ?? "text-muted-foreground"}`}>
                                {f.name}
                              </span>
                            </motion.div>
                          ))}

                          {/* Currently generating file */}
                          {filesShown < seq.files.length && phase === "files" && (
                            <motion.div
                              key={`pending-${filesShown}`}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              className="flex items-center gap-1.5"
                            >
                              <span className="w-2.5 h-2.5 border border-violet-400 border-t-transparent rounded-full animate-spin shrink-0" />
                              <span className="font-mono text-violet-300/50 truncate">
                                {seq.files[filesShown]?.name}
                              </span>
                            </motion.div>
                          )}
                        </div>

                        {phase === "done" && (
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="mt-2 flex items-center gap-1 text-green-400"
                          >
                            <Globe className="w-2.5 h-2.5 shrink-0" />
                            <span className="font-mono text-[10px] truncate">
                              https://{seq.deploy}.netlify.app
                            </span>
                          </motion.div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Code panel */}
              <div className="flex-1 bg-[#1e1e2e] font-mono text-[11px] leading-5 p-4 overflow-hidden relative">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`code-${seqIdx}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 p-4 overflow-hidden"
                  >
                    {/* File tab */}
                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-[#313244]/50">
                      <span className="text-cyan-400 text-[10px]">
                        {seq.files[0]?.name.split("/").pop()}
                      </span>
                      <span className="text-[#45475a] text-[10px]">
                        — generated by LifemarkAI
                      </span>
                    </div>

                    {/* Code lines */}
                    {seq.code.slice(0, linesShown).map((line, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -4 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.15 }}
                        className="whitespace-pre"
                      >
                        <SyntaxLine line={line} />
                      </motion.div>
                    ))}

                    {/* Cursor */}
                    {phase === "streaming" && (
                      <span className="inline-block w-0.5 h-3.5 bg-violet-400 animate-pulse" />
                    )}
                  </motion.div>
                </AnimatePresence>

                {/* Scan line overlay during building */}
                {(phase === "building" || phase === "files") && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                      <span className="text-violet-400 text-xs">Generating code...</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Glow */}
          <div className="absolute -inset-4 bg-gradient-brand opacity-10 blur-2xl rounded-3xl -z-10" />
        </motion.div>
      </div>
    </section>
  );
}

// ── Minimal syntax highlighter ────────────────────────────────────────────────

function SyntaxLine({ line }: { line: string }) {
  if (!line.trim()) return <span>&nbsp;</span>;

  // Keywords
  const highlighted = line
    .replace(/\b(import|export|default|function|return|const|let|var|from|of|new|async|await|useEffect|useState)\b/g,
      '<kw>$1</kw>')
    .replace(/"([^"]*)"/g, '<str>"$1"</str>')
    .replace(/'([^']*)'/g, '<str>\'$1\'</str>')
    .replace(/`([^`]*)`/g, '<str>`$1`</str>')
    .replace(/\/\/(.*)/g, '<cmt>//$1</cmt>');

  // Split and colorize
  const parts = highlighted.split(/(<kw>.*?<\/kw>|<str>.*?<\/str>|<cmt>.*?<\/cmt>)/);

  return (
    <span>
      {parts.map((part, i) => {
        if (part.startsWith('<kw>'))  return <span key={i} className="text-violet-400">{part.replace(/<\/?kw>/g, '')}</span>;
        if (part.startsWith('<str>')) return <span key={i} className="text-green-400">{part.replace(/<\/?str>/g, '')}</span>;
        if (part.startsWith('<cmt>')) return <span key={i} className="text-[#6c7086]">{part.replace(/<\/?cmt>/g, '')}</span>;
        return <span key={i} className="text-[#cdd6f4]">{part}</span>;
      })}
    </span>
  );
}
