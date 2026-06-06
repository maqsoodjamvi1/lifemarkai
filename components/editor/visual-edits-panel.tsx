"use client";

import { useState } from "react";
import {
  PenTool, CheckCircle2, ChevronDown, ChevronUp, Copy, Zap,
  MousePointer, Type, Palette, Image, Layout, Move, Maximize2,
  Command, Grid3x3, Sparkles, Clock, Infinity,
  MousePointer2, AlignLeft, AlignCenter, AlignRight, Plus,
  Code2, Info, Lightbulb, X, Users,
} from "lucide-react";

/* ─── Data ─────────────────────────────────────────────── */

const KEY_BENEFITS = [
  { icon: MousePointer2, label: "Edit anything",       desc: "Update any UI element without restrictions" },
  { icon: Zap,           label: "No-code editing",     desc: "Make changes without writing any code" },
  { icon: Sparkles,      label: "Agent-powered",       desc: "All updates happen through the AI agent" },
  { icon: CheckCircle2,  label: "Free to use",         desc: "No credits required, within the daily edit limit" },
  { icon: Infinity,      label: "Faster iteration",    desc: "Update and preview changes instantly" },
  { icon: Users,         label: "Accessible editing",  desc: "Designers, marketers, and product teams can all contribute" },
];

const CAPABILITIES = [
  { icon: MousePointer, label: "Select any element",      desc: "Click on any UI element in the live preview to select it" },
  { icon: Grid3x3,      label: "Multi-select",            desc: "Use ⌘ Command (Mac) or ⊞ Win (Windows) to select multiple elements" },
  { icon: Layout,       label: "Layout controls",         desc: "Alignment and positioning controls for precise layout" },
  { icon: Move,         label: "Margins & padding",       desc: "Adjust spacing on individual sides of containers" },
  { icon: Palette,      label: "Colors & fonts",          desc: "Edit text content, colors, and font properties" },
  { icon: Type,         label: "Advanced text formatting", desc: "Line breaks, styling, and rich text formatting" },
  { icon: Image,        label: "Replace images",          desc: "Upload files or add image URLs to replace existing images" },
  { icon: Sparkles,     label: "AI image generation",     desc: "Generate new images by editing with text prompts" },
];

const QUICK_START_STEPS = [
  { label: "Click Visual edits", desc: "Find the Visual edits button in the prompt box area" },
  { label: "Select an element",  desc: "Click any element in the live preview to select it" },
  { label: "Make changes",       desc: "Use the visual editing panel to adjust properties" },
  { label: "Preview updates",    desc: "See your changes reflected in real time" },
  { label: "Click Send",         desc: "Submit your visual edit to be applied by the agent" },
];

const USAGE_LIMITS = [
  { label: "Per user",       value: "100",     period: "every 24 hours" },
  { label: "Per IP address", value: "500",     period: "every 24 hours" },
  { label: "After limit",    value: "Credits", period: "required for additional edits" },
  { label: "Reset",          value: "Auto",    period: "resets every 24 hours" },
];

const VISUAL_PROPERTIES = [
  "color", "background-color", "font-size", "font-weight", "font-family",
  "margin", "margin-top", "margin-right", "margin-bottom", "margin-left",
  "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
  "border-radius", "border-width", "border-color", "border-style",
  "width", "height", "min-width", "min-height", "max-width", "max-height",
  "display", "opacity", "box-shadow", "text-align", "line-height",
  "letter-spacing", "text-transform", "cursor", "overflow",
];

const PRESETS = [
  { label: "Hero Title",    element: ".hero h1",     property: "color",            value: "#E94560", desc: "Make the hero title pop" },
  { label: "Button Style",  element: ".btn-primary", property: "border-radius",    value: "8px",     desc: "Rounded primary buttons" },
  { label: "Card Padding",  element: ".card",        property: "padding",          value: "24px",    desc: "Comfortable card spacing" },
  { label: "Nav Background",element: "nav",          property: "background-color", value: "#0A0A0A", desc: "Dark navigation bar" },
  { label: "Body Font Size",element: "body",         property: "font-size",        value: "16px",    desc: "Base font scaling" },
  { label: "Link Hover",    element: "a:hover",      property: "color",            value: "#3B82F6", desc: "Interactive link color" },
  { label: "Section Spacing",element: "section",     property: "margin-bottom",    value: "48px",    desc: "Section separation" },
  { label: "Image Radius",  element: "img",          property: "border-radius",    value: "12px",    desc: "Rounded image corners" },
];

/* ─── Types ─────────────────────────────────────────────── */

interface VisualEdit {
  id: string;
  element: string;
  property: string;
  newValue: string;
}

interface VisualEditsPanelProps {
  projectId: string;
  onApply?: (prompt: string) => void;
}

/* ─── Component ─────────────────────────────────────────── */

export function VisualEditsPanel({ projectId: _projectId, onApply }: VisualEditsPanelProps) {
  const [edits, setEdits] = useState<VisualEdit[]>([]);
  const [element, setElement] = useState("");
  const [property, setProperty] = useState("");
  const [newValue, setNewValue] = useState("");
  const [showPreview, setShowPreview] = useState(true);
  const [showPresets, setShowPresets] = useState(false);
  const [showBenefits, setShowBenefits] = useState(false);
  const [showCapabilities, setShowCapabilities] = useState(true);
  const [showLimits, setShowLimits] = useState(false);
  const [showQuickStart, setShowQuickStart] = useState(true);
  const [pickedColor, setPickedColor] = useState("#E94560");
  const [activeTab, setActiveTab] = useState<"edit" | "learn">("edit");

  const handleAdd = () => {
    if (!element || !property) return;
    setEdits((prev) => [
      ...prev,
      { id: crypto.randomUUID(), element, property, newValue },
    ]);
    setElement("");
    setProperty("");
    setNewValue("");
  };

  const handleRemove = (id: string) => {
    setEdits((prev) => prev.filter((e) => e.id !== id));
  };

  const cssPreview = edits.map((e) => `${e.element} { ${e.property}: ${e.newValue}; }`).join("\n");

  const handleApply = () => {
    if (!edits.length) return;
    const cssBlock = edits.map((e) => `${e.element} { ${e.property}: ${e.newValue}; }`).join(" ");
    onApply?.(`Apply these CSS visual edits to the project: ${cssBlock}`);
  };

  const tabs = [
    { key: "edit"  as const, label: "Editor", icon: PenTool },
    { key: "learn" as const, label: "Learn",  icon: Lightbulb },
  ];

  const editCount = edits.length;
  const limitPercent = Math.min((editCount / 100) * 100, 100);

  return (
    <div className="h-full flex flex-col text-foreground">
      {/* Header */}
      <div className="p-3 border-b border-border flex-shrink-0">
        <div className="flex items-start gap-2 mb-2">
          <PenTool size={14} className="text-pink-500 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="text-[12px] font-semibold">Visual Edits</h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">No-code visual editor for UI changes.</p>
          </div>
        </div>
        <p className="text-[9px] text-muted-foreground/70 leading-relaxed mb-2">
          Customize your project visually. Make fast, targeted changes to layouts,
          text, colors, and images without writing code.
        </p>

        {/* Usage indicator */}
        <div className="flex items-center gap-2 mb-2 p-1.5 bg-muted/50 rounded-lg">
          <span className="text-[9px] text-muted-foreground">Edits this session:</span>
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${limitPercent > 80 ? "bg-orange-400" : "bg-pink-400"}`}
              style={{ width: `${Math.max(limitPercent, 2)}%` }}
            />
          </div>
          <span className={`text-[9px] font-medium ${limitPercent > 80 ? "text-orange-400" : "text-muted-foreground"}`}>
            {editCount}/100
          </span>
        </div>

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
                    ? "bg-background text-pink-500 shadow-sm"
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
        {activeTab === "edit" && (
          <div className="p-3 space-y-3">
            {/* Quick start */}
            <div>
              <button onClick={() => setShowQuickStart(!showQuickStart)} className="flex items-center justify-between w-full">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <Zap size={10} /> Quick Start
                </span>
                {showQuickStart
                  ? <ChevronUp size={10} className="text-muted-foreground" />
                  : <ChevronDown size={10} className="text-muted-foreground" />
                }
              </button>
              {showQuickStart && (
                <div className="mt-1.5 space-y-1.5">
                  {QUICK_START_STEPS.map((step, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-pink-500/20 text-pink-400 flex items-center justify-center text-[9px] font-bold flex-shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <div>
                        <span className="text-[10px] font-medium text-foreground">{step.label}</span>
                        <p className="text-[8px] text-muted-foreground">{step.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Capabilities */}
            <div>
              <button onClick={() => setShowCapabilities(!showCapabilities)} className="flex items-center justify-between w-full">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <Layout size={10} /> Capabilities
                </span>
                {showCapabilities
                  ? <ChevronUp size={10} className="text-muted-foreground" />
                  : <ChevronDown size={10} className="text-muted-foreground" />
                }
              </button>
              {showCapabilities && (
                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                  {CAPABILITIES.map((cap, i) => {
                    const Icon = cap.icon;
                    return (
                      <div key={i} className="flex items-start gap-1.5 p-2 bg-muted/50 rounded-lg border border-border">
                        <Icon size={11} className="text-pink-500 mt-0.5 flex-shrink-0" />
                        <div>
                          <span className="text-[9px] font-medium text-foreground block">{cap.label}</span>
                          <span className="text-[8px] text-muted-foreground">{cap.desc}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Presets */}
            <div>
              <button onClick={() => setShowPresets(!showPresets)} className="flex items-center justify-between w-full">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Quick Presets</span>
                {showPresets
                  ? <ChevronUp size={10} className="text-muted-foreground" />
                  : <ChevronDown size={10} className="text-muted-foreground" />
                }
              </button>
              {showPresets && (
                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                  {PRESETS.map((p, i) => (
                    <button
                      key={i}
                      onClick={() => { setElement(p.element); setProperty(p.property); setNewValue(p.value); }}
                      className="p-2 bg-muted/50 rounded-lg text-left hover:bg-muted transition border border-border"
                    >
                      <p className="text-[10px] font-medium text-foreground">{p.label}</p>
                      <p className="text-[8px] text-muted-foreground">{p.element}</p>
                      <p className="text-[8px] text-pink-400">{p.property}: {p.value}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Form */}
            <div className="space-y-1.5 pt-2 border-t border-border">
              <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Custom Edit</h4>
              <div>
                <label className="text-[10px] font-medium text-muted-foreground mb-0.5 block">CSS Selector</label>
                <input
                  value={element}
                  onChange={(e) => setElement(e.target.value)}
                  placeholder=".hero-section h1"
                  className="w-full text-[11px] border border-border rounded-lg px-2.5 py-1.5 bg-background text-foreground outline-none focus:ring-1 focus:ring-pink-500/30"
                />
              </div>
              <div>
                <label className="text-[10px] font-medium text-muted-foreground mb-0.5 block">Property</label>
                <select
                  value={property}
                  onChange={(e) => setProperty(e.target.value)}
                  className="w-full text-[11px] border border-border rounded-lg px-2.5 py-1.5 bg-background text-foreground outline-none focus:ring-1 focus:ring-pink-500/30"
                >
                  <option value="">Select property...</option>
                  {VISUAL_PROPERTIES.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-medium text-muted-foreground mb-0.5 block">Value</label>
                <div className="flex gap-1.5">
                  <input
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    placeholder="#E94560 or 24px"
                    className="flex-1 text-[11px] border border-border rounded-lg px-2.5 py-1.5 bg-background text-foreground outline-none focus:ring-1 focus:ring-pink-500/30"
                  />
                  <input
                    type="color"
                    value={pickedColor}
                    onChange={(e) => { setPickedColor(e.target.value); setNewValue(e.target.value); }}
                    className="w-8 h-8 rounded-lg border border-border cursor-pointer flex-shrink-0 bg-transparent"
                    title="Pick color"
                  />
                </div>
              </div>
              <button
                onClick={handleAdd}
                disabled={!element || !property}
                className="w-full bg-foreground text-background text-[11px] font-medium py-1.5 rounded-lg hover:opacity-90 transition flex items-center justify-center gap-1.5 disabled:opacity-40"
              >
                <Plus size={11} /> Add Visual Edit
              </button>
            </div>

            {/* Edit list + CSS preview */}
            {edits.length > 0 && (
              <>
                <button onClick={() => setShowPreview(!showPreview)} className="flex items-center justify-between w-full">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Generated CSS ({edits.length})
                  </span>
                  {showPreview
                    ? <ChevronUp size={10} className="text-muted-foreground" />
                    : <ChevronDown size={10} className="text-muted-foreground" />
                  }
                </button>
                {showPreview && (
                  <div className="p-2.5 bg-[#1e1e1e] rounded-lg">
                    <pre className="text-[10px] text-green-400 whitespace-pre-wrap leading-relaxed font-mono">{cssPreview}</pre>
                    <button
                      onClick={() => navigator.clipboard.writeText(cssPreview)}
                      className="mt-1.5 text-[8px] text-muted-foreground hover:text-foreground flex items-center gap-0.5"
                    >
                      <Copy size={8} /> Copy CSS
                    </button>
                  </div>
                )}

                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {edits.map((e) => (
                    <div key={e.id} className="p-2 bg-muted/50 rounded-lg text-[10px] border border-border hover:border-border/80 transition group">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Code2 size={10} className="text-pink-400" />
                          <span className="font-medium text-foreground font-mono">{e.element}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          {e.newValue?.startsWith("#") && (
                            <div className="w-3 h-3 rounded-sm border border-border" style={{ backgroundColor: e.newValue }} />
                          )}
                          <span className="text-muted-foreground">{e.property}</span>
                          <button
                            onClick={() => handleRemove(e.id)}
                            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition ml-1"
                          >
                            <X size={9} />
                          </button>
                        </div>
                      </div>
                      <div className="text-muted-foreground mt-0.5 font-mono pl-4">{e.newValue || "—"}</div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleApply}
                  className="w-full bg-pink-500 text-white text-[11px] font-medium py-2 rounded-lg hover:bg-pink-600 transition flex items-center justify-center gap-1.5"
                >
                  <Sparkles size={12} /> Apply {edits.length} Edit{edits.length !== 1 ? "s" : ""} via AI
                </button>
              </>
            )}
          </div>
        )}

        {/* ═══ LEARN TAB ═══ */}
        {activeTab === "learn" && (
          <div className="p-3 space-y-3">
            {/* Key benefits */}
            <div>
              <button onClick={() => setShowBenefits(!showBenefits)} className="flex items-center justify-between w-full">
                <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <Sparkles size={10} /> Key Benefits
                </h4>
                {showBenefits
                  ? <ChevronUp size={10} className="text-muted-foreground" />
                  : <ChevronDown size={10} className="text-muted-foreground" />
                }
              </button>
              {showBenefits && (
                <div className="mt-1.5 space-y-1.5">
                  {KEY_BENEFITS.map((b, i) => {
                    const Icon = b.icon;
                    return (
                      <div key={i} className="flex items-start gap-2 p-2 bg-muted/50 rounded-lg border border-border">
                        <Icon size={12} className="text-pink-500 mt-0.5 flex-shrink-0" />
                        <div>
                          <span className="text-[10px] font-medium text-foreground">{b.label}</span>
                          <p className="text-[8px] text-muted-foreground">{b.desc}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Usage limits */}
            <div>
              <button onClick={() => setShowLimits(!showLimits)} className="flex items-center justify-between w-full">
                <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <Clock size={10} /> Usage Limits
                </h4>
                {showLimits
                  ? <ChevronUp size={10} className="text-muted-foreground" />
                  : <ChevronDown size={10} className="text-muted-foreground" />
                }
              </button>
              {showLimits && (
                <div className="mt-1.5">
                  <div className="grid grid-cols-2 gap-1.5">
                    {USAGE_LIMITS.map((lim, i) => (
                      <div key={i} className="p-2 bg-muted/50 rounded-lg border border-border text-center">
                        <span className="text-[13px] font-bold text-foreground block">{lim.value}</span>
                        <span className="text-[8px] text-muted-foreground block">{lim.label}</span>
                        <span className="text-[7px] text-muted-foreground/60">{lim.period}</span>
                      </div>
                    ))}
                  </div>
                  <div className="p-2 bg-yellow-500/10 rounded border border-yellow-500/20 mt-1.5">
                    <p className="text-[9px] text-yellow-400">
                      Limits reset automatically every 24 hours. Additional edits beyond the limit require credits.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Capabilities detail */}
            <div className="p-2.5 bg-pink-500/10 rounded-lg border border-pink-500/20">
              <h4 className="text-[10px] font-semibold text-pink-400 mb-2">Visual Editing Capabilities</h4>
              <div className="space-y-1.5">
                {CAPABILITIES.map((cap, i) => {
                  const Icon = cap.icon;
                  return (
                    <div key={i} className="flex items-start gap-1.5">
                      <Icon size={10} className="text-pink-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <span className="text-[9px] font-medium text-pink-300">{cap.label}</span>
                        <span className="text-[9px] text-pink-400/80"> — {cap.desc}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Keyboard shortcuts */}
            <div className="p-2.5 bg-muted/50 rounded-lg border border-border">
              <h4 className="text-[10px] font-semibold text-muted-foreground mb-2">Keyboard Shortcuts</h4>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-muted-foreground">Multi-select elements</span>
                  <div className="flex gap-0.5">
                    <kbd className="px-1 py-0.5 bg-background border border-border rounded text-[8px] font-mono text-muted-foreground">⌘</kbd>
                    <span className="text-[8px] text-muted-foreground/60">+ Click (Mac)</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-muted-foreground">Multi-select elements</span>
                  <div className="flex gap-0.5">
                    <kbd className="px-1 py-0.5 bg-background border border-border rounded text-[8px] font-mono text-muted-foreground">⊞</kbd>
                    <span className="text-[8px] text-muted-foreground/60">+ Click (Win)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Tips */}
            <div className="p-2.5 bg-blue-500/10 rounded-lg border border-blue-500/20">
              <div className="flex items-start gap-2">
                <Info size={12} className="text-blue-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[10px] font-medium text-blue-400">Pro Tips</p>
                  <ul className="mt-1 space-y-1 text-[9px] text-blue-400/80">
                    <li>• Select nested elements for precise targeting</li>
                    <li>• Use multi-select to edit similar elements at once</li>
                    <li>• Preview changes in real time before sending</li>
                    <li>• Combine with AI image generation for custom visuals</li>
                    <li>• All edits go through the agent for safe application</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
