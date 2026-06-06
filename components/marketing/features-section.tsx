"use client";

import { motion } from "framer-motion";
import {
  Bot, Eye, MousePointer, GitBranch, Rocket, Users,
  Mic, Image, Zap, Shield, Globe, Code2,
} from "lucide-react";

const features = [
  {
    icon: Bot,
    title: "Agent Mode",
    description: "The AI autonomously explores your codebase, writes code across every file, connects frontend to backend, and fixes errors — end to end, without hand-holding.",
    color: "text-violet-400",
    bg: "bg-violet-500/10 border-violet-500/20",
    badge: "Autonomous",
  },
  {
    icon: Eye,
    title: "Visual Edit",
    description: "Click any element in your live preview to instantly edit text, colors, spacing, and more — no prompts needed. Direct manipulation at its finest.",
    color: "text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/20",
    badge: "No Prompts",
  },
  {
    icon: Zap,
    title: "Plan Mode",
    description: "Before writing a single line of code, review a detailed plan: pages, components, data models, and tech stack. Approve or adjust — then watch it build.",
    color: "text-yellow-400",
    bg: "bg-yellow-500/10 border-yellow-500/20",
    badge: "New",
  },
  {
    icon: Users,
    title: "Real-Time Collaboration",
    description: "Invite up to 20 teammates to work on the same project simultaneously. See live cursors, shared chat, and instant sync — like Figma for app building.",
    color: "text-green-400",
    bg: "bg-green-500/10 border-green-500/20",
    badge: "Team",
  },
  {
    icon: GitBranch,
    title: "GitHub Two-Way Sync",
    description: "Every change pushes to GitHub automatically. Pull from GitHub to update your project. Full branch management, diff viewer, and commit history included.",
    color: "text-orange-400",
    bg: "bg-orange-500/10 border-orange-500/20",
    badge: "DevOps",
  },
  {
    icon: Rocket,
    title: "One-Click Deploy",
    description: "Ship to your own subdomain on lifemarkai.app instantly. Or deploy to Vercel, Netlify, or Railway. HTTPS, CDN, and custom domains all handled for you.",
    color: "text-red-400",
    bg: "bg-red-500/10 border-red-500/20",
    badge: "Production",
  },
  {
    icon: MousePointer,
    title: "Multi-Model AI",
    description: "Choose between GPT-4o, Claude Opus, Claude Sonnet, or Gemini Pro per request. Always use the best model for the job with full cost transparency.",
    color: "text-pink-400",
    bg: "bg-pink-500/10 border-pink-500/20",
    badge: "Advanced",
  },
  {
    icon: Mic,
    title: "Voice Mode",
    description: "Describe your app changes by speaking. Powered by Whisper AI, voice input is transcribed and sent to the AI instantly. Hands-free building.",
    color: "text-cyan-400",
    bg: "bg-cyan-500/10 border-cyan-500/20",
    badge: "Hands-free",
  },
  {
    icon: Image,
    title: "Built-in Image Generation",
    description: "Generate app icons, hero images, product photos, and UI assets with DALL-E 3 — right inside the editor. With transparent background support.",
    color: "text-teal-400",
    bg: "bg-teal-500/10 border-teal-500/20",
    badge: "DALL-E 3",
  },
  {
    icon: Code2,
    title: "Full Code Editor",
    description: "VS Code-level Monaco editor with IntelliSense, syntax highlighting, multi-tab support, and Vim mode. You own your code, always.",
    color: "text-indigo-400",
    bg: "bg-indigo-500/10 border-indigo-500/20",
    badge: "Monaco",
  },
  {
    icon: Globe,
    title: "Supabase + Stripe Ready",
    description: "Native Supabase integration: PostgreSQL, auth, storage, real-time. Stripe payments set up in one click. Build full-stack without writing a backend.",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/20",
    badge: "Full-stack",
  },
  {
    icon: Shield,
    title: "Enterprise Grade",
    description: "SSO (SAML/OIDC), audit logging, data residency, IP allowlisting, and dedicated support. LifemarkAI scales with your organization.",
    color: "text-slate-400",
    bg: "bg-slate-500/10 border-slate-500/20",
    badge: "Enterprise",
  },
];

export function FeaturesSection() {
  return (
    <section id="features" className="py-24 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            Everything you need to ship,{" "}
            <span className="gradient-text">nothing you don&apos;t</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            LifemarkAI goes beyond Lovable with multi-model AI, a real code editor,
            template marketplace, and a powerful public API.
          </p>
        </motion.div>

        {/* Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
              className="group relative p-6 rounded-2xl bg-card border border-border hover:border-border/80 hover:shadow-lg transition-all duration-300"
            >
              <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl border mb-4 ${feature.bg}`}>
                <feature.icon className={`w-6 h-6 ${feature.color}`} />
              </div>
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-lg font-semibold">{feature.title}</h3>
                <span className={`text-xs px-2 py-0.5 rounded-full border ${feature.bg} ${feature.color} font-medium`}>
                  {feature.badge}
                </span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
