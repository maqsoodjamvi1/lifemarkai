"use client";

import { PromptCreateBox } from "./prompt-create-box";
import { Link2 } from "lucide-react";
import Link from "next/link";

interface DashboardHeroProps {
  firstName: string;
}

export function DashboardHero({ firstName }: DashboardHeroProps) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-border/40 mb-8">
      <div
        className="absolute inset-0 opacity-90"
        style={{
          background:
            "linear-gradient(135deg, #dbeafe 0%, #e9d5ff 35%, #fbcfe8 60%, #fef3c7 85%, #ffffff 100%)",
        }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.5),transparent_60%)]" />

      <div className="relative px-6 py-10 md:py-14 flex flex-col items-center text-center max-w-3xl mx-auto">
        <Link
          href="/connectors"
          className="inline-flex items-center gap-1.5 mb-4 px-3 py-1 rounded-full bg-white/70 border border-white/80 text-[11px] font-medium text-violet-800 shadow-sm hover:bg-white transition-colors"
        >
          <Link2 className="w-3 h-3" />
          Power your app with connectors
        </Link>

        <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 mb-6 tracking-tight">
          Got an idea, {firstName}?
        </h1>

        <div className="w-full">
          <PromptCreateBox variant="hero" />
        </div>
      </div>
    </section>
  );
}
