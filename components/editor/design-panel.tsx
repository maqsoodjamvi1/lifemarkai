"use client";

import { useState } from "react";
import {
  Palette, CheckCircle2, ChevronDown, ChevronUp, Check, Sparkles,
  RefreshCw, Type, Layout, Eye, BookOpen, HelpCircle, Lightbulb,
  Zap, TrendingUp, Layers, ArrowRight, XCircle, Info, Ban,
  AlignLeft, AlignCenter, AlignRight, AlertTriangle, Loader2,
} from "lucide-react";
import type { DesignPreviewDirection } from "@/lib/ai/design-previews";
import { buildDesignBrief } from "@/lib/ai/design-previews";
import { DesignPreviewCards } from "./design-preview-cards";

/* ─── Data ─────────────────────────────────────────────── */

type DesignDirection = { id: string; label: string; desc: string; colors: string[]; preview: string };

const DESIGN_DIRECTIONS: DesignDirection[] = [
  {
    id: "modern",
    label: "Clean & Modern",
    desc: "Minimalist, whitespace, sans-serif fonts, rounded corners",
    colors: ["#1A1A2E", "#E94560", "#FFFFFF", "#F5F5F5"],
    preview: "Clean layouts with generous whitespace, subtle shadows, and refined typography. Best for SaaS, portfolios, and landing pages.",
  },
  {
    id: "bold",
    label: "Bold & Vibrant",
    desc: "Strong colors, dramatic contrasts, impactful typography",
    colors: ["#0F0F0F", "#FF6B35", "#004E89", "#FFD23F"],
    preview: "High contrast with bold accent colors, large headings, and dynamic layouts. Best for marketing, startups, and creative sites.",
  },
  {
    id: "warm",
    label: "Warm & Elegant",
    desc: "Earth tones, serif fonts, generous spacing, organic feel",
    colors: ["#2C1810", "#D4A574", "#FDF6EC", "#8B6914"],
    preview: "Warm earth tones with elegant serif typography and organic shapes. Best for blogs, lifestyle brands, and editorial content.",
  },
];

const TYPOGRAPHY_OPTIONS = [
  { name: "Inter + Inter", heading: "Inter", body: "Inter", desc: "Modern geometric sans-serif. Clean and neutral.", category: "modern tech" },
  { name: "Playfair + Inter", heading: "Playfair Display", body: "Inter", desc: "Elegant serif headings with clean body text.", category: "editorial" },
  { name: "Geist + Geist Mono", heading: "Geist", body: "Geist Mono", desc: "Contemporary sans-serif with monospace accent.", category: "modern tech" },
  { name: "DM Serif + DM Sans", heading: "DM Serif Display", body: "DM Sans", desc: "Classic editorial serif with modern body.", category: "editorial" },
  { name: "Poppins + Open Sans", heading: "Poppins", body: "Open Sans", desc: "Friendly geometric heading with readable body.", category: "creative" },
  { name: "Crimson + Source Sans", heading: "Crimson Text", body: "Source Sans Pro", desc: "Traditional book-style serif with clean sans body.", category: "lifestyle" },
];

const COLOR_PRESETS = [
  { name: "Midnight", primary: "#1A1A2E", accent: "#E94560", bg: "#FFFFFF", mood: "professional" },
  { name: "Ocean",    primary: "#004E89", accent: "#1A936F", bg: "#F0F7FF", mood: "cool and calm" },
  { name: "Sunset",   primary: "#0F0F0F", accent: "#FF6B35", bg: "#FFF8F0", mood: "warm and earthy" },
  { name: "Forest",   primary: "#2D5016", accent: "#52B788", bg: "#F1F8F4", mood: "cool and calm" },
  { name: "Berry",    primary: "#5B2E48", accent: "#E83F6F", bg: "#FFF5F7", mood: "bold and vibrant" },
  { name: "Pastel",   primary: "#4A5568", accent: "#9F7AEA", bg: "#FAF5FF", mood: "soft pastels" },
];

const LAYOUT_OPTIONS = [
  { key: "hero-grid",      label: "Hero Grid",           desc: "Multi-column hero with featured content blocks" },
  { key: "single-column",  label: "Single Column",       desc: "Clean centered content flow" },
  { key: "split-screen",   label: "Split Screen",        desc: "Two-panel layout with visual/text divide" },
  { key: "sidebar",        label: "Sidebar",             desc: "Navigation sidebar with main content area" },
  { key: "masonry",        label: "Masonry",             desc: "Pinterest-style cascading grid layout" },
  { key: "bento",          label: "Bento Grid",          desc: "Mixed-size cards in an organized grid" },
  { key: "magazine",       label: "Magazine",            desc: "Editorial-style with featured hero and columns" },
  { key: "full-width",     label: "Full-width Sections", desc: "Edge-to-edge content bands" },
  { key: "zigzag",         label: "Zigzag",              desc: "Alternating left-right content blocks" },
  { key: "card-grid",      label: "Card Grid",           desc: "Uniform cards in a responsive grid" },
  { key: "asymmetric",     label: "Asymmetric",          desc: "Uneven visual weight for dynamic feel" },
  { key: "broken-grid",    label: "Broken Grid",         desc: "Overlapping elements that break the grid" },
];

const KEY_BENEFITS = [
  { icon: Eye,       label: "See before you build",    desc: "Compare three rendered previews side by side before committing to a direction." },
  { icon: Palette,   label: "Steer the visual identity", desc: "Choose typography, color palettes, and layouts when you want a specific look." },
  { icon: RefreshCw, label: "Refine without restarting", desc: "Iterate on a direction while keeping its overall design language consistent." },
  { icon: Layers,    label: "Explore variations later",  desc: "Generate alternatives for specific sections like hero, navbar, pricing, or footer." },
  { icon: Zap,       label: "Faster iteration",          desc: "Start with a stronger visual foundation and reduce back-and-forth revisions." },
];

const WHEN_DIRECTIONS_APPEAR = [
  "Ask for design options, directions, alternatives, concepts, or variations",
  "Ask for something beautiful, polished, well-designed, high-end, or visually impressive",
  "Ask to explore or draft designs, or see different concepts",
  "Describe an open-ended UI without specifying colors, fonts, or a brand reference",
];

const EXAMPLE_PROMPTS = [
  "Build me a beautiful landing page for a coffee subscription",
  "Design a polished portfolio site with a high-end feel",
  "Create a visually impressive marketing page for a new product",
  "Show me some design options for a portfolio site",
  "Give me a few directions for a travel blog",
  "Landing page for a trendy tech company",
  "Explore some concepts for a pricing page",
];

const EXISTING_PROJECT_PROMPTS = [
  "Show me three options for the hero section",
  "Three navbar variations",
  "Give me three pricing card designs",
  "Redesign the pricing page with three different concepts",
  "Three options for the footer with a darker theme",
];

const SKIP_CONDITIONS = [
  "Prompts that specify fonts, colors, or branding",
  "Prompts that reference another product or style directly",
  "Prompts that include a URL to clone",
  "Prompts that use a named design system",
  "Dashboards, admin panels, internal tools, and games",
  "Functional requests with little or no UI (auth, schema, RLS, edge functions)",
  "Projects created from a design template or connected to a design system",
];

const LIMITATIONS = [
  "Previews use generic copy and image placeholders. Full build replaces with tailored content.",
  "The three-direction step takes a few seconds before the full build starts.",
  "You can refine up to six times total before submitting.",
  "Design questions draw from a curated set. For custom tokens, use Design Systems.",
  "There is no off switch. To skip, write a specific design brief in your prompt.",
];

const REFINEMENT_EXAMPLES = ["Make it warmer", "Improve readability", "Use more whitespace", "Make it feel more premium"];

const FAQ = [
  { q: "Can I get three directions for an existing project?", a: 'Yes. Ask for variations of a specific part. For example: "Show me three options for the hero section" or "Show me three navbar variations." You can also attach a screenshot and ask for redesigns based on it.' },
  { q: "What if I don\'t like any of the three directions?", a: "Ask to generate new ones, or refine the closest direction using the Describe changes input." },
  { q: "Can I combine elements from different directions?", a: 'Yes. Pick the closest direction, then refine. For example: "Use this layout but the warmer palette from the second option." The AI keeps the visual language consistent.' },
  { q: "How many times can I refine a direction?", a: "Up to six refinements per round. Refinements can be on any of the three directions. After that, submit a direction or generate a fresh set." },
  { q: "Can I bring my own typeface or palette?", a: 'Not through the design questions flow, which uses a curated list. You can choose "Describe your own" to write a preference.' },
  { q: "Does this work for dashboards or internal tools?", a: "The design step focuses on surfaces where visual direction matters most: landing pages, marketing sites, blogs, and portfolios. Dashboards skip this step." },
  { q: "What happens if I\'m using a design system or template?", a: "Design guidance is skipped automatically and the AI builds using existing tokens and visual rules." },
  { q: "Does this cost extra credits?", a: "No. Design guidance uses standard chat messages and does not add additional credit costs." },
];

/* ─── Component ─────────────────────────────────────────── */

interface DesignPanelProps {
  projectId: string;
  onApply?: (prompt: string) => void;
}

export function DesignPanel({ projectId, onApply }: DesignPanelProps) {
  const [activeTab, setActiveTab] = useState<"editor" | "learn">("editor");
  const [selectedDir, setSelectedDir] = useState<string>("modern");
  const [previewPrompt, setPreviewPrompt] = useState("Build a modern landing page for a specialty coffee roastery");
  const [aiDirections, setAiDirections] = useState<DesignPreviewDirection[]>([]);
  const [aiSelectedId, setAiSelectedId] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [useAiPreviews, setUseAiPreviews] = useState(false);
  const [showCustomizer, setShowCustomizer] = useState(false);
  const [selectedFont, setSelectedFont] = useState(0);
  const [selectedColor, setSelectedColor] = useState(0);
  const [selectedLayout, setSelectedLayout] = useState(1);
  const [customPrimary, setCustomPrimary] = useState(COLOR_PRESETS[0].primary);
  const [customAccent, setCustomAccent] = useState(COLOR_PRESETS[0].accent);
  const [layoutDensity, setLayoutDensity] = useState<"compact" | "balanced" | "spacious">("balanced");
  const [saved, setSaved] = useState(false);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [showBenefits, setShowBenefits] = useState(true);
  const [showWhenAppear, setShowWhenAppear] = useState(false);
  const [showExamplePrompts, setShowExamplePrompts] = useState(false);
  const [showExistingProject, setShowExistingProject] = useState(false);
  const [showSkipConditions, setShowSkipConditions] = useState(false);
  const [showLimitations, setShowLimitations] = useState(false);
  const [showHowToUse, setShowHowToUse] = useState(false);

  const direction = DESIGN_DIRECTIONS.find((d) => d.id === selectedDir) || DESIGN_DIRECTIONS[0];
  const aiDirection = aiDirections.find((d) => d.id === aiSelectedId) ?? null;
  const colorPreset = COLOR_PRESETS[selectedColor];

  async function handleGenerateAiPreviews() {
    if (!previewPrompt.trim()) return;
    setAiLoading(true);
    setAiError(null);
    setAiDirections([]);
    setAiSelectedId(null);
    try {
      const res = await fetch("/api/ai/design-previews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: previewPrompt.trim(), projectId, fileCount: 0, force: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate previews");
      setAiDirections(data.directions ?? []);
      setUseAiPreviews(true);
      if (data.directions?.[0]?.id) setAiSelectedId(data.directions[0].id);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "Preview generation failed");
    } finally {
      setAiLoading(false);
    }
  }

  const handleApplyDesign = () => {
    const font = TYPOGRAPHY_OPTIONS[selectedFont];
    const layout = LAYOUT_OPTIONS[selectedLayout];
    if (useAiPreviews && aiDirection) {
      const buildPrompt = `${previewPrompt.trim()}\n\n${buildDesignBrief(aiDirection)}\n\nTypography: ${font.name}. Layout: ${layout.label}. Density: ${layoutDensity}.`;
      onApply?.(buildPrompt);
    } else {
      const prompt = `Apply design direction: ${direction.label}. Typography: ${font.name}. Color palette: ${colorPreset.name} (primary ${customPrimary}, accent ${customAccent}). Layout: ${layout.label}. Density: ${layoutDensity}.`;
      onApply?.(prompt);
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const tabs = [
    { key: "editor" as const, label: "Editor", icon: Palette },
    { key: "learn"  as const, label: "Learn",  icon: BookOpen },
  ];

  return (
    <div className="h-full flex flex-col text-foreground">
      {/* Header */}
      <div className="p-3 border-b border-border flex-shrink-0">
        <div className="flex items-start gap-2 mb-2">
          <Palette size={14} className="text-blue-500 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="text-[12px] font-semibold">Design Guidance</h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">Shape visual direction before building.</p>
          </div>
        </div>
        <p className="text-[9px] text-muted-foreground/70 leading-relaxed mb-2">
          Pick from three design previews or answer guided questions for typography,
          color, and layout. Land closer to your vision on the first build.
        </p>

        {/* Tabs */}
        <div className="flex gap-0.5 p-0.5 bg-muted rounded-lg">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`flex-1 py-1 px-0.5 rounded-md text-[9px] font-medium transition flex items-center justify-center gap-0.5 ${
                  activeTab === t.key
                    ? "bg-background text-blue-500 shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon size={9} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">

        {/* ═══ EDITOR TAB ═══ */}
        {activeTab === "editor" && (
          <div className="p-3 space-y-3">
            {/* AI-generated 3-preview flow (Lovable parity) */}
            <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-2.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold text-blue-500 uppercase tracking-wider">AI Design Previews</span>
                {aiDirections.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setUseAiPreviews(!useAiPreviews)}
                    className="text-[9px] text-muted-foreground hover:text-foreground"
                  >
                    {useAiPreviews ? "Use presets" : "Use AI previews"}
                  </button>
                )}
              </div>
              <textarea
                value={previewPrompt}
                onChange={(e) => setPreviewPrompt(e.target.value)}
                rows={2}
                className="w-full text-[10px] rounded-lg border border-border bg-background px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                placeholder="Describe the app you want to build…"
              />
              <button
                type="button"
                onClick={() => void handleGenerateAiPreviews()}
                disabled={aiLoading || !previewPrompt.trim()}
                className="flex items-center justify-center gap-1.5 w-full py-1.5 rounded-lg text-[10px] font-medium bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 transition"
              >
                {aiLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                {aiLoading ? "Generating 3 previews…" : "Generate 3 AI previews"}
              </button>
              {aiError && <p className="text-[9px] text-destructive">{aiError}</p>}
              {useAiPreviews && aiDirections.length > 0 && (
                <DesignPreviewCards
                  directions={aiDirections}
                  selectedId={aiSelectedId}
                  onSelect={setAiSelectedId}
                  compact
                />
              )}
            </div>

            {/* Design Direction Selection */}
            {(!useAiPreviews || aiDirections.length === 0) && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Design Direction</span>
                <span className="text-[9px] text-muted-foreground/60">Pick one to guide the AI</span>
              </div>

              <div className="space-y-2">
                {DESIGN_DIRECTIONS.map((dir) => (
                  <button
                    key={dir.id}
                    onClick={() => setSelectedDir(dir.id)}
                    className={`w-full text-left p-2.5 rounded-xl border-2 transition ${
                      selectedDir === dir.id
                        ? "border-blue-500 bg-blue-500/10"
                        : "border-border hover:border-border/80"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="flex items-center gap-0.5">
                        {dir.colors.map((c, i) => (
                          <div key={i} className="w-4 h-4 rounded-full border border-border" style={{ backgroundColor: c }} />
                        ))}
                      </div>
                      <span className={`text-[11px] font-semibold ${selectedDir === dir.id ? "text-blue-500" : "text-foreground"}`}>
                        {dir.label}
                      </span>
                      {selectedDir === dir.id && <CheckCircle2 size={12} className="text-blue-500 ml-auto" />}
                    </div>
                    <p className="text-[9px] text-muted-foreground leading-relaxed">{dir.preview}</p>
                  </button>
                ))}
              </div>
            </div>
            )}

            {/* Customizer Toggle */}
            <button
              onClick={() => setShowCustomizer(!showCustomizer)}
              className="flex items-center gap-1.5 text-[10px] text-blue-500 hover:text-blue-400 font-medium transition"
            >
              <Palette size={11} /> {showCustomizer ? "Hide" : "Customize"} Design Details
            </button>

            {showCustomizer && (
              <div className="space-y-4 border-t border-border pt-3">
                {/* Typography Picker */}
                <div>
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Typography</span>
                  <div className="space-y-1.5">
                    {TYPOGRAPHY_OPTIONS.map((font, i) => (
                      <button
                        key={i}
                        onClick={() => setSelectedFont(i)}
                        className={`flex items-center gap-2 w-full p-2 rounded-lg border transition text-left ${
                          selectedFont === i ? "border-blue-500/50 bg-blue-500/10" : "border-border hover:border-border/80"
                        }`}
                      >
                        <Type size={13} className={selectedFont === i ? "text-blue-500" : "text-muted-foreground"} />
                        <div className="flex-1 min-w-0">
                          <span className="text-[11px] font-medium text-foreground">{font.name}</span>
                          <p className="text-[9px] text-muted-foreground">{font.desc}</p>
                          <span className="text-[7px] text-muted-foreground/60 capitalize">{font.category}</span>
                        </div>
                        {selectedFont === i && <Check size={10} className="text-blue-500" />}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Color Palette Picker */}
                <div>
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Color Palette</span>
                  <div className="space-y-1.5">
                    {COLOR_PRESETS.map((preset, i) => (
                      <button
                        key={i}
                        onClick={() => { setSelectedColor(i); setCustomPrimary(preset.primary); setCustomAccent(preset.accent); }}
                        className={`flex items-center gap-2.5 w-full p-2 rounded-lg border transition text-left ${
                          selectedColor === i ? "border-blue-500/50 bg-blue-500/10" : "border-border hover:border-border/80"
                        }`}
                      >
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          <div className="w-5 h-5 rounded-md border border-border" style={{ backgroundColor: preset.primary }} />
                          <div className="w-5 h-5 rounded-md border border-border" style={{ backgroundColor: preset.accent }} />
                          <div className="w-5 h-5 rounded-md border border-border" style={{ backgroundColor: preset.bg }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-[11px] text-foreground">{preset.name}</span>
                          <span className="text-[8px] text-muted-foreground capitalize ml-1">{preset.mood}</span>
                        </div>
                        {selectedColor === i && <Check size={10} className="text-blue-500" />}
                      </button>
                    ))}
                  </div>

                  {/* Custom Colors */}
                  <div className="flex items-center gap-3 mt-2 px-2">
                    <div className="flex items-center gap-1.5">
                      <label className="text-[9px] text-muted-foreground">Primary</label>
                      <input
                        type="color"
                        value={customPrimary}
                        onChange={(e) => setCustomPrimary(e.target.value)}
                        className="w-6 h-6 rounded border border-border cursor-pointer bg-transparent"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <label className="text-[9px] text-muted-foreground">Accent</label>
                      <input
                        type="color"
                        value={customAccent}
                        onChange={(e) => setCustomAccent(e.target.value)}
                        className="w-6 h-6 rounded border border-border cursor-pointer bg-transparent"
                      />
                    </div>
                  </div>
                </div>

                {/* Layout Picker */}
                <div>
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Layout</span>
                  <div className="space-y-1">
                    {LAYOUT_OPTIONS.map((lo, i) => (
                      <button
                        key={lo.key}
                        onClick={() => setSelectedLayout(i)}
                        className={`flex items-center gap-2 w-full p-2 rounded-lg border transition text-left ${
                          selectedLayout === i ? "border-blue-500/50 bg-blue-500/10" : "border-border hover:border-border/80"
                        }`}
                      >
                        <Layout size={11} className={selectedLayout === i ? "text-blue-500" : "text-muted-foreground"} />
                        <div className="flex-1 min-w-0">
                          <span className="text-[10px] font-medium text-foreground">{lo.label}</span>
                          <p className="text-[8px] text-muted-foreground">{lo.desc}</p>
                        </div>
                        {selectedLayout === i && <Check size={10} className="text-blue-500" />}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Layout Density */}
                <div>
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Layout Density</span>
                  <div className="flex gap-1">
                    {(
                      [
                        { key: "compact"  as const, icon: AlignLeft,   label: "Compact"  },
                        { key: "balanced" as const, icon: AlignCenter, label: "Balanced" },
                        { key: "spacious" as const, icon: AlignRight,  label: "Spacious" },
                      ]
                    ).map((opt) => (
                      <button
                        key={opt.key}
                        onClick={() => setLayoutDensity(opt.key)}
                        className={`flex-1 flex flex-col items-center gap-1 p-2 rounded-lg border transition text-center ${
                          layoutDensity === opt.key ? "border-blue-500/50 bg-blue-500/10" : "border-border hover:border-border/80"
                        }`}
                      >
                        <opt.icon size={14} className={layoutDensity === opt.key ? "text-blue-500" : "text-muted-foreground"} />
                        <span className="text-[9px] text-foreground">{opt.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="pt-2 border-t border-border space-y-2">
              <button
                onClick={handleApplyDesign}
                className="w-full bg-foreground text-background text-[11px] font-medium py-2 rounded-lg hover:opacity-90 transition flex items-center justify-center gap-1.5"
              >
                {saved ? <Check size={12} /> : <Sparkles size={12} />}
                {saved ? "Design Applied!" : "Apply Design Direction"}
              </button>
              <button className="w-full text-[10px] text-muted-foreground hover:text-foreground py-1.5 transition flex items-center justify-center gap-1">
                <RefreshCw size={10} /> Request Redesign
              </button>
            </div>

            {/* Design Guidance Tip */}
            <div className="p-2.5 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <div className="flex items-start gap-1.5">
                <Sparkles size={11} className="text-blue-500 mt-0.5 flex-shrink-0" />
                <p className="text-[9px] text-blue-400 leading-relaxed">
                  <strong>Tip:</strong> Your selected direction ({direction.label}) with{" "}
                  {TYPOGRAPHY_OPTIONS[selectedFont].name} typography and {colorPreset.name} colors will
                  guide all AI-generated designs. Switch directions anytime.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ═══ LEARN TAB ═══ */}
        {activeTab === "learn" && (
          <div className="p-3 space-y-3">
            {/* Key benefits */}
            <div>
              <button onClick={() => setShowBenefits(!showBenefits)} className="flex items-center justify-between w-full">
                <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <Lightbulb size={10} /> Key Benefits
                </h4>
                {showBenefits ? <ChevronUp size={10} className="text-muted-foreground" /> : <ChevronDown size={10} className="text-muted-foreground" />}
              </button>
              {showBenefits && (
                <div className="mt-1.5 space-y-1.5">
                  {KEY_BENEFITS.map((b, i) => {
                    const Icon = b.icon;
                    return (
                      <div key={i} className="flex items-start gap-2 p-2 bg-muted/50 rounded-lg border border-border">
                        <Icon size={12} className="text-blue-500 mt-0.5 flex-shrink-0" />
                        <div>
                          <span className="text-[10px] font-medium text-foreground">{b.label}</span>
                          <p className="text-[9px] text-muted-foreground">{b.desc}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* When directions appear */}
            <div>
              <button onClick={() => setShowWhenAppear(!showWhenAppear)} className="flex items-center justify-between w-full">
                <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <Info size={10} /> When Directions Appear
                </h4>
                {showWhenAppear ? <ChevronUp size={10} className="text-muted-foreground" /> : <ChevronDown size={10} className="text-muted-foreground" />}
              </button>
              {showWhenAppear && (
                <div className="mt-1.5 space-y-1">
                  {WHEN_DIRECTIONS_APPEAR.map((item, i) => (
                    <div key={i} className="flex items-start gap-1.5 p-2 bg-muted/50 rounded-lg">
                      <CheckCircle2 size={9} className="text-blue-500 mt-0.5 flex-shrink-0" />
                      <span className="text-[9px] text-muted-foreground">{item}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Example prompts */}
            <div>
              <button onClick={() => setShowExamplePrompts(!showExamplePrompts)} className="flex items-center justify-between w-full">
                <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Example Prompts</h4>
                {showExamplePrompts ? <ChevronUp size={10} className="text-muted-foreground" /> : <ChevronDown size={10} className="text-muted-foreground" />}
              </button>
              {showExamplePrompts && (
                <div className="mt-1.5 space-y-1">
                  {EXAMPLE_PROMPTS.map((prompt, i) => (
                    <div key={i} className="p-2 bg-[#1e1e1e] rounded-lg">
                      <p className="text-[9px] text-green-400 font-mono">&quot;{prompt}&quot;</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* How to use */}
            <div>
              <button onClick={() => setShowHowToUse(!showHowToUse)} className="flex items-center justify-between w-full">
                <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <ArrowRight size={10} /> How to Use
                </h4>
                {showHowToUse ? <ChevronUp size={10} className="text-muted-foreground" /> : <ChevronDown size={10} className="text-muted-foreground" />}
              </button>
              {showHowToUse && (
                <div className="mt-1.5 space-y-1.5">
                  {[
                    { step: "1", title: "Describe your project",    desc: "Write a prompt for what you want to build. Keep it high-level for wider visual range." },
                    { step: "2", title: "Compare three directions", desc: "View side by side, open full-screen, switch using thumbnails. Ask for a new set if none feel right." },
                    { step: "3", title: "Refine a direction",       desc: "Use Describe changes + suggestions. Up to 6 refinements total across all 3 directions." },
                    { step: "4", title: "Submit",                   desc: "Click Submit to lock in the visual direction and start the full build." },
                  ].map((s) => (
                    <div key={s.step} className="flex items-start gap-2 p-2 bg-muted/50 rounded-lg">
                      <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-[9px] font-bold flex-shrink-0 mt-0.5">
                        {s.step}
                      </span>
                      <div>
                        <span className="text-[10px] font-medium text-foreground">{s.title}</span>
                        <p className="text-[8px] text-muted-foreground">{s.desc}</p>
                      </div>
                    </div>
                  ))}
                  {/* Refinement examples */}
                  <div className="p-2 bg-blue-500/10 rounded border border-blue-500/20">
                    <p className="text-[8px] text-blue-400 mb-1 font-medium">Refinement prompts:</p>
                    <div className="flex flex-wrap gap-1">
                      {REFINEMENT_EXAMPLES.map((ex, i) => (
                        <code key={i} className="text-[8px] px-1.5 py-0.5 bg-background text-blue-400 rounded font-mono border border-blue-500/30">
                          {ex}
                        </code>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Existing project */}
            <div>
              <button onClick={() => setShowExistingProject(!showExistingProject)} className="flex items-center justify-between w-full">
                <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <Layers size={10} /> For Existing Projects
                </h4>
                {showExistingProject ? <ChevronUp size={10} className="text-muted-foreground" /> : <ChevronDown size={10} className="text-muted-foreground" />}
              </button>
              {showExistingProject && (
                <div className="mt-1.5 space-y-1">
                  {EXISTING_PROJECT_PROMPTS.map((prompt, i) => (
                    <div key={i} className="p-2 bg-[#1e1e1e] rounded-lg">
                      <p className="text-[9px] text-green-400 font-mono">&quot;{prompt}&quot;</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Skip conditions */}
            <div>
              <button onClick={() => setShowSkipConditions(!showSkipConditions)} className="flex items-center justify-between w-full">
                <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <Ban size={10} /> When Guidance Skips
                </h4>
                {showSkipConditions ? <ChevronUp size={10} className="text-muted-foreground" /> : <ChevronDown size={10} className="text-muted-foreground" />}
              </button>
              {showSkipConditions && (
                <div className="mt-1.5 space-y-1">
                  {SKIP_CONDITIONS.map((item, i) => (
                    <div key={i} className="flex items-start gap-1.5 p-2 bg-muted/50 rounded-lg">
                      <XCircle size={9} className="text-muted-foreground mt-0.5 flex-shrink-0" />
                      <span className="text-[9px] text-muted-foreground">{item}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Limitations */}
            <div>
              <button onClick={() => setShowLimitations(!showLimitations)} className="flex items-center justify-between w-full">
                <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <Info size={10} /> Limitations
                </h4>
                {showLimitations ? <ChevronUp size={10} className="text-muted-foreground" /> : <ChevronDown size={10} className="text-muted-foreground" />}
              </button>
              {showLimitations && (
                <div className="mt-1.5 space-y-1">
                  {LIMITATIONS.map((item, i) => (
                    <div key={i} className="flex items-start gap-1.5 p-2 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
                      <AlertTriangle size={9} className="text-yellow-500 mt-0.5 flex-shrink-0" />
                      <span className="text-[9px] text-yellow-400">{item}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* FAQ */}
            <div>
              <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                <HelpCircle size={10} /> FAQ
              </h4>
              <div className="space-y-1">
                {FAQ.map((faq, i) => (
                  <div key={i}>
                    <button
                      onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
                      className="flex items-center justify-between w-full py-1.5 hover:bg-muted/50 rounded px-1 transition"
                    >
                      <span className="text-[10px] text-foreground text-left">{faq.q}</span>
                      {expandedFaq === i
                        ? <ChevronUp size={10} className="text-muted-foreground flex-shrink-0" />
                        : <ChevronDown size={10} className="text-muted-foreground flex-shrink-0" />
                      }
                    </button>
                    {expandedFaq === i && (
                      <p className="text-[10px] text-muted-foreground px-1 pb-1.5 leading-relaxed">{faq.a}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
