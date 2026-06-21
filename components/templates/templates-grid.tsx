"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  GitFork, Loader2, Zap, Star,
  LayoutDashboard, ShoppingCart, MessageSquare,
  FileText, BarChart3, Globe, Sparkles, Music,
  Briefcase, Calendar, Inbox, User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { starterIdForName } from "@/lib/templates/starter-catalog";

interface TemplateItem {
  id: string;
  name: string;
  description: string;
  category: string;
  is_featured: boolean;
  fork_count: number;
  preview_url?: string | null;
  tags?: string[];
  source?: "builtin" | "db";
}

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  dashboard: LayoutDashboard,
  ecommerce: ShoppingCart,
  saas: Zap,
  chat: MessageSquare,
  blog: FileText,
  analytics: BarChart3,
  landing: Globe,
  portfolio: User,
  music: Music,
  calendar: Calendar,
  jobs: Briefcase,
  social: Inbox,
  all: Sparkles,
};

const CATEGORIES = ["all", "landing", "saas", "dashboard", "ecommerce", "analytics", "chat", "blog"];

const TEMPLATE_GRADIENTS = [
  "from-violet-500/20 via-purple-500/10 to-blue-500/20",
  "from-blue-500/20 via-cyan-500/10 to-teal-500/20",
  "from-green-500/20 via-emerald-500/10 to-teal-500/20",
  "from-orange-500/20 via-amber-500/10 to-yellow-500/20",
  "from-pink-500/20 via-rose-500/10 to-red-500/20",
  "from-indigo-500/20 via-blue-500/10 to-cyan-500/20",
  "from-teal-500/20 via-green-500/10 to-emerald-500/20",
  "from-red-500/20 via-orange-500/10 to-amber-500/20",
];

export function TemplatesGrid() {
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("all");
  const [forkingId, setForkingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    fetch("/api/templates")
      .then((r) => r.json())
      .then((data) => setTemplates(Array.isArray(data) ? data : []))
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = templates.filter((t) => {
    const matchCat = activeCategory === "all" || t.category === activeCategory;
    const matchSearch = !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.description.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const featured = filtered.filter((t) => t.is_featured);
  const regular = filtered.filter((t) => !t.is_featured);

  async function forkTemplate(template: TemplateItem) {
    // Design-baseline starter (from the curated catalog): there are no files to
    // fork — instead send the user to the create box with this design preselected
    // so they describe their app and the build refines this template.
    const designId = starterIdForName(template.name);
    if (designId) {
      router.push(`/dashboard?template=${encodeURIComponent(designId)}`);
      return;
    }
    setForkingId(template.id);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: template.name,
          description: template.description,
          framework: "react",
          templateId: template.id,
        }),
      });

      if (res.status === 401) {
        router.push(`/signup?template=${template.id}`);
        return;
      }
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to fork template");
      }

      const project = await res.json();
      toast({ title: "Template forked!", description: `Opening ${template.name}…` });
      router.push(`/editor/${project.id}`);
    } catch (err) {
      toast({
        title: "Could not fork template",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setForkingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div>
      {/* Search + category filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-8">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search templates…"
          className="flex-1 px-4 py-2 rounded-xl bg-muted border border-border text-sm outline-none focus:border-violet-500 transition-colors"
        />
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => {
            const Icon = CATEGORY_ICONS[cat] ?? Sparkles;
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all capitalize ${
                  activeCategory === cat
                    ? "bg-violet-500/20 border-violet-500/40 text-violet-300"
                    : "bg-muted border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Sparkles className="w-8 h-8 mx-auto mb-3 opacity-30" />
          <p>No templates match your search.</p>
        </div>
      )}

      {/* Featured */}
      {featured.length > 0 && (
        <div className="mb-10">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
            ⭐ Featured
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {featured.map((template, i) => (
              <TemplateCard
                key={template.id}
                template={template}
                gradient={TEMPLATE_GRADIENTS[i % TEMPLATE_GRADIENTS.length]}
                onFork={() => forkTemplate(template)}
                forking={forkingId === template.id}
                delay={i * 0.05}
              />
            ))}
          </div>
        </div>
      )}

      {/* All */}
      {regular.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
            All Templates
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {regular.map((template, i) => (
              <TemplateCard
                key={template.id}
                template={template}
                gradient={TEMPLATE_GRADIENTS[(i + featured.length) % TEMPLATE_GRADIENTS.length]}
                onFork={() => forkTemplate(template)}
                forking={forkingId === template.id}
                delay={i * 0.04}
                compact
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TemplateCard({
  template, gradient, onFork, forking, delay = 0, compact = false,
}: {
  template: TemplateItem;
  gradient: string;
  onFork: () => void;
  forking: boolean;
  delay?: number;
  compact?: boolean;
}) {
  const Icon = CATEGORY_ICONS[template.category] ?? Sparkles;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
      className="group relative rounded-2xl bg-card border border-border hover:border-border/60 hover:shadow-xl transition-all duration-300 overflow-hidden"
    >
      {/* Preview area */}
      <div className={`${compact ? "h-28" : "h-40"} bg-gradient-to-br ${gradient} flex items-center justify-center relative`}>
        {template.preview_url ? (
          <img src={template.preview_url} alt={template.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-14 h-14 rounded-2xl bg-background/30 backdrop-blur-sm border border-white/10 flex items-center justify-center">
            <Icon className="w-7 h-7 text-white/80" />
          </div>
        )}
        {template.is_featured && (
          <div className="absolute top-3 left-3 flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-yellow-500/20 border border-yellow-500/30 text-yellow-300">
            <Star className="w-3 h-3" /> Featured
          </div>
        )}
        {template.source === "builtin" && (
          <div className="absolute top-3 right-3 text-[10px] px-1.5 py-0.5 rounded bg-violet-500/20 border border-violet-500/30 text-violet-300">
            Official
          </div>
        )}
      </div>

      <div className="p-4">
        <h3 className="font-semibold mb-1 truncate">{template.name}</h3>
        {!compact && (
          <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{template.description}</p>
        )}
        {template.tags && template.tags.length > 0 && !compact && (
          <div className="flex flex-wrap gap-1 mb-3">
            {template.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-muted border border-border text-muted-foreground">
                {tag}
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <GitFork className="w-3 h-3" />
            {template.fork_count.toLocaleString()}
          </div>
          <Button
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={onFork}
            disabled={forking}
          >
            {forking ? <Loader2 className="w-3 h-3 animate-spin" /> : <GitFork className="w-3 h-3" />}
            Use template
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
