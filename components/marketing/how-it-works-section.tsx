"use client";

import { motion } from "framer-motion";
import { MessageSquare, Code2, Eye, Rocket } from "lucide-react";

const steps = [
  {
    step: "01",
    icon: MessageSquare,
    title: "Describe your app",
    description: "Tell the AI what you want to build in plain English. Be as detailed or as vague as you like — the AI will ask follow-up questions if needed.",
    color: "text-violet-400",
    bg: "bg-violet-500/10",
  },
  {
    step: "02",
    icon: Code2,
    title: "AI generates your code",
    description: "In Agent Mode, the AI autonomously builds your entire app — pages, components, API routes, and database schema — with React + TypeScript + Tailwind.",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
  },
  {
    step: "03",
    icon: Eye,
    title: "Preview & refine",
    description: "See your app live in the preview panel. Click any element to edit it visually, or chat with the AI to refine, add features, or fix issues.",
    color: "text-green-400",
    bg: "bg-green-500/10",
  },
  {
    step: "04",
    icon: Rocket,
    title: "Deploy in one click",
    description: "Ship to your personal subdomain instantly. Or push to GitHub and deploy to Vercel, Netlify, or Railway. HTTPS and CDN included.",
    color: "text-orange-400",
    bg: "bg-orange-500/10",
  },
];

export function HowItWorksSection() {
  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            From idea to deployed app{" "}
            <span className="gradient-text">in minutes</span>
          </h2>
          <p className="text-xl text-muted-foreground">
            No setup. No boilerplate. No DevOps headaches.
          </p>
        </motion.div>

        <div className="relative">
          {/* Connection line */}
          <div className="absolute top-16 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border to-transparent hidden lg:block" />

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((step, i) => (
              <motion.div
                key={step.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                className="relative text-center"
              >
                <div className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl ${step.bg} mb-4 relative`}>
                  <step.icon className={`w-7 h-7 ${step.color}`} />
                  <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-background border border-border text-xs font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                </div>
                <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
