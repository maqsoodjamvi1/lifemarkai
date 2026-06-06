"use client";

import { motion } from "framer-motion";
import { Star } from "lucide-react";

const testimonials = [
  {
    quote: "I built and launched my SaaS in a weekend. What would have taken 3 months took 2 days. LifemarkAI is genuinely insane.",
    name: "Sarah Chen",
    role: "Indie hacker",
    avatar: "SC",
    stars: 5,
  },
  {
    quote: "The Agent Mode is like having a senior developer who never sleeps. It explores the codebase, fixes bugs, and builds features autonomously.",
    name: "Marcus Reid",
    role: "Startup founder",
    avatar: "MR",
    stars: 5,
  },
  {
    quote: "Visual Edit is a game changer. I can click any element and tweak it without writing a single prompt. My designers love it.",
    name: "Priya Sharma",
    role: "Product designer",
    avatar: "PS",
    stars: 5,
  },
  {
    quote: "We migrated our entire prototyping workflow to LifemarkAI. Our team ships 5x faster and the code quality is production-ready.",
    name: "James O'Brien",
    role: "CTO at a Series A startup",
    avatar: "JO",
    stars: 5,
  },
  {
    quote: "The GitHub sync means I'm never locked in. I own my code, I can deploy anywhere. That's a big deal for a developer.",
    name: "Ananya Patel",
    role: "Full-stack developer",
    avatar: "AP",
    stars: 5,
  },
  {
    quote: "I used Lovable before but switched to LifemarkAI for the multi-model AI support. Being able to use Claude for complex logic and GPT-4o for UI is 🤌",
    name: "Leo Zhang",
    role: "AI product builder",
    avatar: "LZ",
    stars: 5,
  },
];

export function TestimonialsSection() {
  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 bg-muted/20">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            Loved by builders
          </h2>
          <p className="text-xl text-muted-foreground">
            Join 12,000+ developers, designers, and founders who ship with LifemarkAI
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {testimonials.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
              className="p-6 rounded-2xl bg-card border border-border"
            >
              <div className="flex gap-1 mb-4">
                {Array.from({ length: t.stars }).map((_, j) => (
                  <Star key={j} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                ))}
              </div>
              <p className="text-sm leading-relaxed mb-6 text-foreground/90">
                &ldquo;{t.quote}&rdquo;
              </p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-brand flex items-center justify-center text-white text-sm font-bold">
                  {t.avatar}
                </div>
                <div>
                  <div className="font-semibold text-sm">{t.name}</div>
                  <div className="text-xs text-muted-foreground">{t.role}</div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
