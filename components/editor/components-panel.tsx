"use client";

import { useState, useMemo } from "react";
import { Search, ChevronRight, Sparkles } from "lucide-react";

interface ComponentDef {
  name: string;
  description: string;
  category: string;
  emoji: string;
  prompt: string;
  tags: string[];
}

// Complete shadcn/ui component catalog with insert prompts
const COMPONENTS: ComponentDef[] = [
  // Layout
  { name: "Accordion", description: "Collapsible content sections", category: "Layout", emoji: "📂", tags: ["collapse", "faq", "toggle"], prompt: "Add an Accordion component to display collapsible FAQ sections" },
  { name: "Card", description: "Contained content block with optional header/footer", category: "Layout", emoji: "🃏", tags: ["container", "block", "panel"], prompt: "Add a Card component to display structured content" },
  { name: "Separator", description: "Horizontal or vertical divider line", category: "Layout", emoji: "➖", tags: ["divider", "hr", "line"], prompt: "Add a Separator component as a divider" },
  { name: "Tabs", description: "Segmented content panels with tab navigation", category: "Layout", emoji: "🗂", tags: ["navigation", "sections", "panels"], prompt: "Add a Tabs component to organize content into sections" },
  { name: "Resizable", description: "Resizable panel groups with drag handles", category: "Layout", emoji: "↔️", tags: ["split", "panel", "drag"], prompt: "Add a Resizable panel layout with drag handles" },
  { name: "ScrollArea", description: "Custom-styled scrollable container", category: "Layout", emoji: "📜", tags: ["scroll", "overflow", "container"], prompt: "Add a ScrollArea component for a scrollable content region" },
  { name: "AspectRatio", description: "Maintain consistent width/height ratio", category: "Layout", emoji: "📐", tags: ["ratio", "image", "video"], prompt: "Add an AspectRatio component to maintain 16:9 ratio" },

  // Forms
  { name: "Button", description: "Clickable action element with multiple variants", category: "Forms", emoji: "🔘", tags: ["action", "click", "cta"], prompt: "Add a Button component with primary and secondary variants" },
  { name: "Input", description: "Text input field with label and validation", category: "Forms", emoji: "✏️", tags: ["text", "field", "form"], prompt: "Add an Input field with label and placeholder" },
  { name: "Textarea", description: "Multi-line text input", category: "Forms", emoji: "📝", tags: ["text", "multiline", "field"], prompt: "Add a Textarea for multi-line text input" },
  { name: "Checkbox", description: "Binary selection control", category: "Forms", emoji: "☑️", tags: ["toggle", "selection", "boolean"], prompt: "Add a Checkbox with label for boolean selection" },
  { name: "Radio Group", description: "Mutually exclusive option selector", category: "Forms", emoji: "🔵", tags: ["options", "select", "choice"], prompt: "Add a RadioGroup component for single-choice selection" },
  { name: "Select", description: "Dropdown option picker", category: "Forms", emoji: "🔽", tags: ["dropdown", "picker", "option"], prompt: "Add a Select dropdown to choose from a list of options" },
  { name: "Switch", description: "Toggle switch for on/off states", category: "Forms", emoji: "🔀", tags: ["toggle", "boolean", "on/off"], prompt: "Add a Switch toggle component" },
  { name: "Slider", description: "Range input control", category: "Forms", emoji: "🎚", tags: ["range", "value", "slider"], prompt: "Add a Slider component for numeric range input" },
  { name: "Label", description: "Accessible form label element", category: "Forms", emoji: "🏷", tags: ["label", "form", "accessible"], prompt: "Add a Label component for form field accessibility" },
  { name: "Form", description: "Validated form with react-hook-form integration", category: "Forms", emoji: "📋", tags: ["validation", "submit", "fields"], prompt: "Add a Form component with validation using react-hook-form and zod" },
  { name: "Calendar", description: "Date picker calendar view", category: "Forms", emoji: "📅", tags: ["date", "picker", "calendar"], prompt: "Add a Calendar component for date selection" },
  { name: "Date Picker", description: "Popover date selection with calendar", category: "Forms", emoji: "📆", tags: ["date", "input", "popover"], prompt: "Add a DatePicker component that shows a calendar popover" },
  { name: "Combobox", description: "Searchable select with autocomplete", category: "Forms", emoji: "🔍", tags: ["search", "autocomplete", "select"], prompt: "Add a Combobox component with searchable dropdown" },

  // Navigation
  { name: "Navigation Menu", description: "Horizontal main nav with dropdowns", category: "Navigation", emoji: "🧭", tags: ["nav", "menu", "links"], prompt: "Add a NavigationMenu component as the main site navigation" },
  { name: "Breadcrumb", description: "Page hierarchy trail", category: "Navigation", emoji: "🍞", tags: ["path", "hierarchy", "trail"], prompt: "Add a Breadcrumb component to show the current page path" },
  { name: "Pagination", description: "Page number navigation", category: "Navigation", emoji: "📖", tags: ["pages", "navigation", "list"], prompt: "Add a Pagination component for navigating between pages" },
  { name: "Command", description: "Command palette / spotlight search", category: "Navigation", emoji: "⌨️", tags: ["search", "palette", "shortcuts"], prompt: "Add a Command palette component for quick navigation and actions" },

  // Feedback
  { name: "Alert", description: "Info/warning/error message banner", category: "Feedback", emoji: "⚠️", tags: ["message", "warning", "info"], prompt: "Add an Alert component for info and error messages" },
  { name: "Alert Dialog", description: "Confirmation dialog before destructive actions", category: "Feedback", emoji: "🚨", tags: ["confirm", "dialog", "modal"], prompt: "Add an AlertDialog for confirming destructive actions" },
  { name: "Toast", description: "Ephemeral notification messages", category: "Feedback", emoji: "🍞", tags: ["notification", "snackbar", "message"], prompt: "Add Toast notifications for success/error feedback" },
  { name: "Progress", description: "Progress bar indicator", category: "Feedback", emoji: "📊", tags: ["loading", "percent", "bar"], prompt: "Add a Progress bar component showing completion percentage" },
  { name: "Skeleton", description: "Loading placeholder animation", category: "Feedback", emoji: "💀", tags: ["loading", "placeholder", "shimmer"], prompt: "Add Skeleton loading placeholders for the content area" },
  { name: "Badge", description: "Small status/count indicator chip", category: "Feedback", emoji: "🏅", tags: ["tag", "chip", "status"], prompt: "Add Badge components for status and count indicators" },

  // Overlay
  { name: "Dialog", description: "Modal dialog overlay", category: "Overlay", emoji: "💬", tags: ["modal", "popup", "overlay"], prompt: "Add a Dialog modal component" },
  { name: "Sheet", description: "Slide-in side panel overlay", category: "Overlay", emoji: "📄", tags: ["drawer", "sidebar", "slide"], prompt: "Add a Sheet component that slides in from the side" },
  { name: "Drawer", description: "Bottom sheet drawer (mobile-friendly)", category: "Overlay", emoji: "⬆️", tags: ["bottom", "mobile", "slide"], prompt: "Add a Drawer component that slides up from the bottom" },
  { name: "Popover", description: "Floating content attached to a trigger", category: "Overlay", emoji: "💭", tags: ["tooltip", "floating", "popup"], prompt: "Add a Popover component attached to a button trigger" },
  { name: "Tooltip", description: "Hover hint label on any element", category: "Overlay", emoji: "💡", tags: ["hint", "hover", "label"], prompt: "Add Tooltip hints to explain button and icon actions" },
  { name: "Context Menu", description: "Right-click context menu", category: "Overlay", emoji: "🖱", tags: ["right-click", "menu", "context"], prompt: "Add a ContextMenu that appears on right-click" },
  { name: "Dropdown Menu", description: "Button-triggered dropdown with actions", category: "Overlay", emoji: "⬇️", tags: ["menu", "actions", "dropdown"], prompt: "Add a DropdownMenu component with a list of actions" },
  { name: "Hover Card", description: "Rich preview card on hover", category: "Overlay", emoji: "🃏", tags: ["preview", "hover", "card"], prompt: "Add a HoverCard component for rich preview on hover" },

  // Data Display
  { name: "Table", description: "Data grid with sortable columns", category: "Data Display", emoji: "📊", tags: ["grid", "data", "rows"], prompt: "Add a Table component to display tabular data with headers" },
  { name: "Avatar", description: "User profile image with fallback initials", category: "Data Display", emoji: "👤", tags: ["profile", "image", "user"], prompt: "Add an Avatar component for user profile pictures" },
  { name: "Chart", description: "Recharts-based data visualizations", category: "Data Display", emoji: "📈", tags: ["graph", "data", "recharts"], prompt: "Add a Chart component using recharts to visualize data" },
  { name: "Carousel", description: "Swipeable image/content carousel", category: "Data Display", emoji: "🎠", tags: ["slider", "swipe", "images"], prompt: "Add a Carousel component for sliding through images" },
  { name: "Collapsible", description: "Show/hide content toggle", category: "Data Display", emoji: "🗜", tags: ["toggle", "hide", "expand"], prompt: "Add a Collapsible component to show/hide content" },
  { name: "Data Table", description: "Advanced table with filtering/sorting/pagination", category: "Data Display", emoji: "🗃", tags: ["filter", "sort", "paginate"], prompt: "Add a full-featured DataTable with sorting, filtering, and pagination using TanStack Table" },

  // Typography
  { name: "Typography", description: "Consistent heading and body text styles", category: "Typography", emoji: "✍️", tags: ["text", "heading", "body"], prompt: "Add consistent Typography styles for headings and body text" },
  { name: "Code Block", description: "Syntax-highlighted code display", category: "Typography", emoji: "💻", tags: ["code", "syntax", "highlight"], prompt: "Add a syntax-highlighted CodeBlock component using react-syntax-highlighter" },
];

const CATEGORIES = ["All", ...Array.from(new Set(COMPONENTS.map((c) => c.category)))];

interface ComponentsPanelProps {
  onInsertPrompt?: (prompt: string) => void;
}

export function ComponentsPanel({ onInsertPrompt }: ComponentsPanelProps) {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [hoveredComponent, setHoveredComponent] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return COMPONENTS.filter((c) => {
      const matchesCategory = activeCategory === "All" || c.category === activeCategory;
      const matchesSearch =
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.tags.some((t) => t.includes(q));
      return matchesCategory && matchesSearch;
    });
  }, [search, activeCategory]);

  // Group by category for display
  const grouped = useMemo(() => {
    if (activeCategory !== "All") return { [activeCategory]: filtered };
    const g: Record<string, ComponentDef[]> = {};
    for (const c of filtered) {
      if (!g[c.category]) g[c.category] = [];
      g[c.category].push(c);
    }
    return g;
  }, [filtered, activeCategory]);

  return (
    <div className="flex flex-col h-full bg-[#0d0d14] text-[#cdd6f4] text-sm">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-[#1e1e2e] shrink-0">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-violet-400" />
          <h2 className="font-semibold text-[#cdd6f4]">Components</h2>
          <span className="ml-auto text-[11px] text-[#585b70] bg-[#1e1e2e] px-2 py-0.5 rounded-full">
            shadcn/ui
          </span>
        </div>
        <p className="text-[11px] text-[#585b70] mb-3">
          Click any component to add it to your app via AI.
        </p>
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#585b70]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search components…"
            className="w-full bg-[#1e1e2e] border border-[#313244] rounded-lg pl-8 pr-3 py-1.5 text-xs text-[#cdd6f4] placeholder-[#45475a] focus:outline-none focus:ring-1 focus:ring-violet-500/50"
          />
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex gap-1 px-3 py-2 overflow-x-auto scrollbar-none border-b border-[#1e1e2e] shrink-0">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`shrink-0 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
              activeCategory === cat
                ? "bg-violet-600 text-white"
                : "text-[#585b70] hover:text-[#a6adc8] hover:bg-[#1e1e2e]"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Component grid */}
      <div className="flex-1 overflow-y-auto">
        {Object.entries(grouped).map(([category, items]) => (
          <div key={category}>
            {activeCategory === "All" && (
              <div className="px-4 py-2 text-[10px] font-semibold text-[#45475a] uppercase tracking-wider sticky top-0 bg-[#0d0d14] z-10">
                {category}
              </div>
            )}
            <div className="px-3 pb-2 grid grid-cols-2 gap-1.5">
              {items.map((component) => (
                <button
                  key={component.name}
                  onClick={() => onInsertPrompt?.(component.prompt)}
                  onMouseEnter={() => setHoveredComponent(component.name)}
                  onMouseLeave={() => setHoveredComponent(null)}
                  className="relative group flex flex-col items-start gap-1.5 p-2.5 rounded-lg bg-[#1e1e2e] border border-[#313244] hover:border-violet-500/50 hover:bg-[#1e1e2e]/80 transition-all text-left cursor-pointer"
                >
                  {/* Hover glow */}
                  {hoveredComponent === component.name && (
                    <div className="absolute inset-0 rounded-lg bg-violet-500/5 pointer-events-none" />
                  )}
                  <span className="text-base leading-none">{component.emoji}</span>
                  <div>
                    <p className="text-[11px] font-medium text-[#cdd6f4] leading-tight">
                      {component.name}
                    </p>
                    <p className="text-[10px] text-[#585b70] mt-0.5 leading-tight line-clamp-2">
                      {component.description}
                    </p>
                  </div>
                  {/* Insert arrow */}
                  <ChevronRight className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-violet-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 text-[#45475a] text-sm">
            <Search className="w-8 h-8 mb-2 opacity-30" />
            <p>No components match &ldquo;{search}&rdquo;</p>
          </div>
        )}

        {/* Bottom padding */}
        <div className="h-4" />
      </div>
    </div>
  );
}
