"use client";

/**
 * Lovable-style landing page for LifemarkAI.
 *
 * Modeled after the lovable.dev homepage structure (read via web_fetch on
 * 2026-06-01). The sections, in order:
 *   1. Hero — H1 + giant prompt input as the primary CTA, social-proof
 *      logo strip below.
 *   2. How it works — 3 side-by-side cards (idea → live preview → ship).
 *   3. Templates — horizontal grid of project starters.
 *   4. Numbers — 3 big stats with brief framing.
 *   5. Ready to build — CTA repeat of the prompt input.
 *
 * Deliberately sparse: cream/off-white background, dark serif-feel
 * headings, no decorative gradients, no marketing slop. The prompt input
 * is the only major interactive element — that's the conversion path.
 *
 * Mount via app/(marketing)/page.tsx instead of the existing HeroSection
 * / FeaturesSection / etc. The old sections are not deleted — switch
 * back by re-importing them from the page file if needed.
 */

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Sparkles, Zap, Globe, Play, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// ── Hero prompt input ─────────────────────────────────────────────────────────

function HeroPrompt({ placeholder }: { placeholder?: string }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  // Auto-grow textarea up to ~5 lines.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 180) + "px";
  }, [value]);

  function submit() {
    const trimmed = value.trim();
    if (!trimmed) return;
    setSubmitting(true);
    // Carry the prompt to /signup. After auth the dashboard's new-project
    // flow picks it up via the URL hash (handled by BuildWithUrlHandler).
    const hash = `prompt=${encodeURIComponent(trimmed)}`;
    router.push(`/signup?redirect=${encodeURIComponent("/?autosubmit=true#" + hash)}`);
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="relative rounded-2xl border border-border bg-card shadow-lg p-3 sm:p-4">
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          placeholder={placeholder ?? "Build me a calorie tracker with a daily streak graph…"}
          className="w-full resize-none bg-transparent text-base sm:text-lg leading-relaxed placeholder:text-muted-foreground/60 outline-none px-1 py-2 min-h-[60px]"
          maxLength={2000}
        />
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/60">
          <p className="text-[11px] text-muted-foreground hidden sm:block">
            Press <kbd className="px-1.5 py-0.5 rounded border border-border/60 text-[10px] font-mono">⌘</kbd>+
            <kbd className="px-1.5 py-0.5 rounded border border-border/60 text-[10px] font-mono">Enter</kbd> to build
          </p>
          <Button
            size="sm"
            onClick={submit}
            disabled={!value.trim() || submitting}
            className="ml-auto bg-foreground text-background hover:bg-foreground/90 px-4 h-9"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                Build
                <ArrowRight className="w-4 h-4 ml-1.5" />
              </>
            )}
          </Button>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground/70 text-center mt-3">
        No credit card required · 5 free builds daily
      </p>
    </div>
  );
}

// ── Hero ──────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="relative pt-28 pb-20 sm:pt-32 sm:pb-24">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Sparkles badge */}
        <div className="flex justify-center mb-6">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground border border-border/60 rounded-full px-3 py-1 bg-card/40">
            <Sparkles className="w-3 h-3" />
            Powered by GPT-4o, Claude &amp; Gemini
          </span>
        </div>

        {/* Headline */}
        <h1 className="text-center text-5xl sm:text-6xl lg:text-7xl font-semibold tracking-tight text-foreground mb-5">
          Build something{" "}
          <span className="italic font-serif text-violet-500">remarkable</span>
        </h1>

        <p className="text-center text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
          Create apps and websites by chatting with AI.
        </p>

        <HeroPrompt />

        {/* Social proof — logo strip placeholder */}
        <div className="mt-20">
          <p className="text-center text-[11px] uppercase tracking-widest text-muted-foreground/60 mb-5">
            Teams from top companies build with LifemarkAI
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 opacity-60">
            {["Acme", "Globex", "Initech", "Umbrella", "Stark", "Wayne"].map((name) => (
              <span key={name} className="text-base sm:text-lg font-semibold text-muted-foreground/70 tracking-wide">
                {name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── How it works — 3 cards with video placeholders ────────────────────────────

const STEPS: Array<{ title: string; description: string; videoSrc?: string; placeholder: string }> = [
  {
    title: "Start with an idea",
    description: "Describe the app or website you want — or drop in screenshots and docs.",
    placeholder: "Type a prompt",
  },
  {
    title: "Watch it come to life",
    description: "See your vision transform into a working prototype in real time as the AI builds it.",
    placeholder: "Live preview",
  },
  {
    title: "Refine and ship",
    description: "Iterate with simple feedback and deploy to the world with one click.",
    placeholder: "Click deploy",
  },
];

function HowItWorks() {
  return (
    <section className="py-20 sm:py-28 border-t border-border/40">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-center text-3xl sm:text-4xl font-semibold tracking-tight mb-3">
          How it works
        </h2>
        <p className="text-center text-base text-muted-foreground mb-14">
          Three steps from idea to deployed app.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {STEPS.map((step, i) => (
            <div
              key={step.title}
              className="rounded-2xl border border-border/60 bg-card overflow-hidden"
            >
              {/* Video placeholder — replace src once you have demo clips */}
              <div className="aspect-video bg-muted/40 border-b border-border/40 flex items-center justify-center relative">
                {step.videoSrc ? (
                  <video
                    src={step.videoSrc}
                    autoPlay
                    muted
                    loop
                    playsInline
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="text-center">
                    <Play className="w-7 h-7 text-muted-foreground/40 mx-auto mb-2" />
                    <p className="text-[11px] text-muted-foreground/60 font-mono">{step.placeholder}</p>
                  </div>
                )}
                <span className="absolute top-3 left-3 text-[10px] font-mono text-muted-foreground/60 bg-card/80 backdrop-blur px-1.5 py-0.5 rounded">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>
              <div className="p-5">
                <h3 className="text-base font-semibold mb-1.5">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Templates carousel ────────────────────────────────────────────────────────

const TEMPLATES: Array<{ slug: string; title: string; subtitle: string; emoji: string }> = [
  { slug: "saas-dashboard",    title: "SaaS dashboard",    subtitle: "Analytics & user management", emoji: "📊" },
  { slug: "ecommerce-store",   title: "Ecommerce store",   subtitle: "Premium webstore design",     emoji: "🛍️" },
  { slug: "portfolio",         title: "Personal portfolio",subtitle: "Work showcase template",      emoji: "🎨" },
  { slug: "event-platform",    title: "Event platform",    subtitle: "Find, register, host events", emoji: "🎟️" },
  { slug: "blog",              title: "Blog template",     subtitle: "Minimal, playful design",      emoji: "✍️" },
  { slug: "ai-chat",           title: "AI chat app",       subtitle: "Multi-model conversation",     emoji: "🤖" },
  { slug: "marketing-site",    title: "Marketing site",    subtitle: "Hero + features + CTA",        emoji: "🚀" },
  { slug: "admin-panel",       title: "Admin panel",       subtitle: "CRUD + auth + permissions",    emoji: "⚙️" },
];

function Templates() {
  return (
    <section className="py-20 sm:py-28 border-t border-border/40">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between mb-10">
          <div>
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight mb-2">
              Discover templates
            </h2>
            <p className="text-base text-muted-foreground">Start your next project with a template.</p>
          </div>
          <Link href="/templates" className="hidden sm:inline-flex items-center text-sm text-muted-foreground hover:text-foreground gap-1">
            View all <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {TEMPLATES.map((t) => (
            <Link
              key={t.slug}
              href={`/templates#${t.slug}`}
              className="group rounded-xl border border-border/60 bg-card overflow-hidden hover:shadow-md transition-shadow"
            >
              <div className="aspect-[4/3] bg-gradient-to-br from-muted/30 to-muted/60 flex items-center justify-center text-5xl">
                {t.emoji}
              </div>
              <div className="p-3">
                <p className="text-sm font-medium truncate">{t.title}</p>
                <p className="text-[11px] text-muted-foreground truncate">{t.subtitle}</p>
              </div>
            </Link>
          ))}
        </div>

        <div className="sm:hidden mt-6 text-center">
          <Link href="/templates" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground gap-1">
            View all templates <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}

// ── Numbers ───────────────────────────────────────────────────────────────────

function Numbers() {
  const stats = [
    { value: "2M+",  label: "projects built on LifemarkAI" },
    { value: "30K+", label: "projects built per day" },
    { value: "5M",   label: "visits per day to LifemarkAI apps" },
  ];
  return (
    <section className="py-20 sm:py-28 border-t border-border/40">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-center text-3xl sm:text-4xl font-semibold tracking-tight mb-3">
          LifemarkAI in numbers
        </h2>
        <p className="text-center text-base text-muted-foreground mb-14">
          Millions of builders are already turning ideas into reality.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-5xl sm:text-6xl font-semibold tracking-tight mb-2">{s.value}</p>
              <p className="text-sm text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── CTA repeat ────────────────────────────────────────────────────────────────

function ReadyToBuild() {
  return (
    <section className="py-24 sm:py-32 border-t border-border/40">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-center text-4xl sm:text-5xl font-semibold tracking-tight mb-3">
          Ready to build?
        </h2>
        <p className="text-center text-base text-muted-foreground mb-10">
          Describe what you want. Get a working app in seconds.
        </p>
        <HeroPrompt placeholder="What do you want to build?" />

        <div className="text-center mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Zap className="w-3 h-3" />
            5 free builds daily
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Globe className="w-3 h-3" />
            Deploy to lifemarkai.app
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Sparkles className="w-3 h-3" />
            Multi-model AI
          </span>
        </div>
      </div>
    </section>
  );
}

// ── Public composer ──────────────────────────────────────────────────────────

export function LovableStyleLanding() {
  return (
    <>
      <Hero />
      <HowItWorks />
      <Templates />
      <Numbers />
      <ReadyToBuild />
    </>
  );
}
