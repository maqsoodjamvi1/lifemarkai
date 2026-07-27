"use client";

import { useState, useMemo } from "react";
import { Package, Search, X, Download, Check, Star, ExternalLink, Loader2, Code2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";

interface ComponentMarketplacePanelProps {
  projectId: string;
  onInstall?: (prompt: string) => void;
}

interface MarketplaceComponent {
  id: string;
  name: string;
  emoji: string;
  description: string;
  category: string;
  badge?: "Popular" | "New" | "Pro";
  dependencies: string[];
  useCases: string[];
  previewCode: string;
  installPrompt: string;
}

// ─── Component catalogue ──────────────────────────────────────────────────────

const COMPONENTS: MarketplaceComponent[] = [
  // Auth
  {
    id: "auth-form",       name: "Auth Form",           emoji: "🔐", category: "Auth",
    badge: "Popular",
    description: "Complete sign-in / sign-up form with Supabase Auth, email + password, social OAuth buttons, and error handling.",
    dependencies: ["@supabase/supabase-js"],
    useCases: ["User authentication", "OAuth social login", "Email magic link"],
    previewCode: `<AuthForm mode="signin" onSuccess={() => router.push("/dashboard")} />`,
    installPrompt: "Add a complete Supabase authentication form component (sign-in + sign-up + OAuth) to my project with proper error handling and redirect after login",
  },
  {
    id: "user-avatar-menu", name: "User Avatar Menu",   emoji: "👤", category: "Auth",
    description: "Dropdown avatar menu with user info, profile link, settings, and sign-out button.",
    dependencies: [],
    useCases: ["Navbar user menu", "Account dropdown"],
    previewCode: `<UserAvatarMenu user={user} onSignOut={signOut} />`,
    installPrompt: "Add a user avatar dropdown menu component with profile info, settings link, and sign out button using shadcn/ui DropdownMenu",
  },
  // Data display
  {
    id: "data-table",      name: "Data Table",           emoji: "📊", category: "Data",
    badge: "Popular",
    description: "Full-featured sortable, filterable, paginated data table with column resizing and row selection.",
    dependencies: ["@tanstack/react-table"],
    useCases: ["Admin dashboards", "List views", "CRM records"],
    previewCode: `<DataTable columns={columns} data={rows} searchKey="email" />`,
    installPrompt: "Add a full-featured data table component with sorting, filtering, pagination, and row selection using TanStack Table and shadcn/ui",
  },
  {
    id: "kanban-board",    name: "Kanban Board",         emoji: "📋", category: "Data",
    badge: "New",
    description: "Drag-and-drop Kanban board with columns, cards, and status transitions.",
    dependencies: ["@dnd-kit/core", "@dnd-kit/sortable"],
    useCases: ["Task management", "Project boards", "Pipeline views"],
    previewCode: `<KanbanBoard columns={["Todo","In Progress","Done"]} cards={tasks} />`,
    installPrompt: "Add a drag-and-drop Kanban board component with columns and cards using @dnd-kit, with status column configuration",
  },
  {
    id: "stats-grid",      name: "Stats Grid",           emoji: "📈", category: "Data",
    description: "A grid of metric cards with value, label, trend indicator, and sparkline chart.",
    dependencies: ["recharts"],
    useCases: ["Dashboard KPIs", "Analytics summaries"],
    previewCode: `<StatsGrid metrics={[{ label: "Revenue", value: "$12,400", trend: +12.5 }]} />`,
    installPrompt: "Add a stats grid component with KPI cards showing value, label, percentage trend, and mini sparkline chart using recharts",
  },
  // UI
  {
    id: "pricing-table",   name: "Pricing Table",        emoji: "💰", category: "UI",
    badge: "Popular",
    description: "Three-tier pricing table with feature comparison, recommended badge, and Stripe checkout CTA.",
    dependencies: [],
    useCases: ["SaaS pricing page", "Plan comparison", "Upsell flows"],
    previewCode: `<PricingTable plans={plans} onSelectPlan={handleCheckout} />`,
    installPrompt: "Add a three-column pricing table component with feature lists, highlighted recommended plan, and checkout button. Use Tailwind and shadcn/ui",
  },
  {
    id: "command-palette",  name: "Command Palette",     emoji: "⌨️", category: "UI",
    description: "⌘K command palette with fuzzy search, keyboard navigation, and categorised commands.",
    dependencies: ["cmdk"],
    useCases: ["App-wide search", "Quick actions", "Power user navigation"],
    previewCode: `<CommandPalette commands={commands} open={open} onClose={() => setOpen(false)} />`,
    installPrompt: "Add a command palette component (⌘K shortcut) with fuzzy search and categorised commands using the cmdk library and shadcn/ui Command",
  },
  {
    id: "toast-system",    name: "Toast Notifications",  emoji: "🔔", category: "UI",
    description: "Animated toast notification system with success, error, warning, and info variants.",
    dependencies: ["sonner"],
    useCases: ["Action feedback", "Error notifications", "Success confirmations"],
    previewCode: `import { toast } from "sonner"; toast.success("Saved!")`,
    installPrompt: "Add Sonner toast notifications to my project — install the package, wrap my layout with Toaster, and update existing toast() calls to use sonner",
  },
  {
    id: "multi-step-form",  name: "Multi-step Form",     emoji: "📝", category: "UI",
    badge: "New",
    description: "Wizard-style multi-step form with progress indicator, validation per step, and animated transitions.",
    dependencies: ["react-hook-form", "zod"],
    useCases: ["Onboarding flows", "Checkout", "Survey forms"],
    previewCode: `<MultiStepForm steps={steps} onComplete={handleSubmit} />`,
    installPrompt: "Add a multi-step wizard form component with step progress indicator, per-step validation using react-hook-form + zod, and smooth animated transitions",
  },
  // Charts
  {
    id: "line-chart",      name: "Line Chart",           emoji: "📉", category: "Charts",
    badge: "Popular",
    description: "Responsive line chart with tooltip, legend, and gradient fill using Recharts.",
    dependencies: ["recharts"],
    useCases: ["Revenue over time", "User growth", "Analytics trends"],
    previewCode: `<LineChart data={data} xKey="date" yKey="value" color="#8b5cf6" />`,
    installPrompt: "Add a reusable responsive line chart component using Recharts with tooltip, legend, and configurable gradient fill",
  },
  {
    id: "bar-chart",       name: "Bar Chart",            emoji: "📊", category: "Charts",
    description: "Grouped or stacked bar chart with tooltip and legend.",
    dependencies: ["recharts"],
    useCases: ["Comparison views", "Category breakdowns"],
    previewCode: `<BarChart data={data} keys={["a","b"]} indexBy="month" />`,
    installPrompt: "Add a reusable bar chart component using Recharts that supports both grouped and stacked modes with tooltip and legend",
  },
  // Commerce
  {
    id: "stripe-checkout",  name: "Stripe Checkout",     emoji: "💳", category: "Commerce",
    badge: "Popular",
    description: "One-click Stripe Checkout button that creates a checkout session and redirects.",
    dependencies: ["@stripe/stripe-js"],
    useCases: ["SaaS subscriptions", "One-time payments", "Credit packs"],
    previewCode: `<StripeCheckoutButton priceId="price_xxx" label="Upgrade to Pro" />`,
    installPrompt: "Add a Stripe Checkout button component that POSTs to /api/billing/checkout and redirects to Stripe. Include loading and error states",
  },
  {
    id: "product-card",    name: "Product Card",         emoji: "🛍️", category: "Commerce",
    description: "Ecommerce product card with image, title, price, rating, and add-to-cart button.",
    dependencies: [],
    useCases: ["Product listings", "Marketplace items", "Shop page"],
    previewCode: `<ProductCard product={product} onAddToCart={addToCart} />`,
    installPrompt: "Add a product card component with image, title, price, star rating display, and add-to-cart button with quantity state",
  },
  // Comms
  {
    id: "chat-bubble",     name: "Chat Bubble UI",       emoji: "💬", category: "Comms",
    description: "Chat message thread UI with user/assistant bubbles, timestamps, and typing indicator.",
    dependencies: [],
    useCases: ["AI chatbots", "Support chat", "Messaging apps"],
    previewCode: `<ChatThread messages={messages} onSend={sendMessage} />`,
    installPrompt: "Add a chat thread UI component with message bubbles (user/assistant), timestamps, typing indicator, and a send input",
  },
  {
    id: "notification-bell", name: "Notification Bell",   emoji: "🔔", category: "Comms",
    description: "Bell icon with unread count badge, dropdown notification feed, and mark-all-read.",
    dependencies: [],
    useCases: ["In-app notifications", "Alert feeds", "Activity log"],
    previewCode: `<NotificationBell notifications={notifications} onMarkRead={markAllRead} />`,
    installPrompt: "Add a notification bell icon with dropdown feed showing recent notifications, unread count badge, and mark all read button",
  },
  // Layout
  {
    id: "sidebar-layout",  name: "Sidebar Layout",       emoji: "🗂️", category: "Layout",
    badge: "Popular",
    description: "App shell with collapsible sidebar, top nav, breadcrumbs, and main content area.",
    dependencies: [],
    useCases: ["Dashboard layouts", "Admin panels", "SaaS apps"],
    previewCode: `<SidebarLayout sidebar={<Nav />}>{children}</SidebarLayout>`,
    installPrompt: "Add a sidebar app layout component with collapsible side navigation, top bar with breadcrumbs, and main content area using shadcn/ui",
  },
  {
    id: "empty-state",     name: "Empty State",          emoji: "🫙", category: "Layout",
    description: "Consistent empty state component with icon, title, description, and optional CTA.",
    dependencies: [],
    useCases: ["Empty lists", "Zero data states", "First-run experience"],
    previewCode: `<EmptyState icon={Inbox} title="No messages" description="Start a conversation" action={<Button>New message</Button>} />`,
    installPrompt: "Add a reusable empty state component with configurable icon, title, description text, and optional action button",
  },
  {
    id: "file-upload",     name: "File Upload Zone",     emoji: "📁", category: "Layout",
    description: "Drag-and-drop file upload zone with file type validation, progress bar, and preview.",
    dependencies: [],
    useCases: ["Document upload", "Image picker", "CSV import"],
    previewCode: `<FileUploadZone accept="image/*" maxMb={5} onUpload={handleFile} />`,
    installPrompt: "Add a drag-and-drop file upload zone component with file type filtering, size limit validation, upload progress bar, and file preview thumbnails",
  },
  // Maps
  {
    id: "map-embed",       name: "Map Embed",            emoji: "🗺️", category: "Maps",
    description: "Interactive map with markers, popups, and geolocation using Leaflet.",
    dependencies: ["leaflet", "react-leaflet"],
    useCases: ["Store locators", "Event maps", "Delivery tracking"],
    previewCode: `<MapEmbed center={[51.5, -0.09]} markers={locations} />`,
    installPrompt: "Add an interactive map component with markers and popups using react-leaflet. Include dynamic import with SSR disabled",
  },
  {
    id: "calendar-view",   name: "Calendar / Scheduler", emoji: "📅", category: "Scheduling",
    badge: "New",
    description: "Month/week/day calendar view with event creation and drag-to-reschedule.",
    dependencies: ["@fullcalendar/react", "@fullcalendar/daygrid"],
    useCases: ["Booking systems", "Event scheduling", "Task calendars"],
    previewCode: `<CalendarView events={events} onEventClick={handleEvent} onDateSelect={createEvent} />`,
    installPrompt: "Add a calendar component with month/week/day views and event creation using FullCalendar React. Include dynamic import for SSR compatibility",
  },
];

const CATEGORIES = ["All", "Auth", "Data", "UI", "Charts", "Commerce", "Comms", "Layout", "Maps", "Scheduling"];

function ComponentCard({
  comp,
  onInstall,
  installing,
}: {
  comp: MarketplaceComponent;
  onInstall: () => void;
  installing: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-border bg-muted/20 overflow-hidden">
      <div className="p-3">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-muted/40 flex items-center justify-center text-xl shrink-0">
              {comp.emoji}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-xs font-semibold text-foreground">{comp.name}</h3>
                {comp.badge && (
                  <Badge variant="outline" className={`text-[9px] h-4 px-1 ${
                    comp.badge === "Popular" ? "border-violet-500/40 text-violet-400" :
                    comp.badge === "New"     ? "border-emerald-500/40 text-emerald-400" :
                    "border-amber-500/40 text-amber-400"
                  }`}>{comp.badge}</Badge>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground">{comp.category}</p>
            </div>
          </div>
          <Button
            size="sm"
            className="h-7 text-[11px] gap-1 shrink-0"
            onClick={onInstall}
            disabled={installing}
          >
            {installing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
            Install
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground leading-relaxed">{comp.description}</p>

        {comp.dependencies.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {comp.dependencies.map((dep) => (
              <span key={dep} className="text-[9px] font-mono bg-muted/40 text-muted-foreground px-1.5 py-0.5 rounded">
                {dep}
              </span>
            ))}
          </div>
        )}

        <button
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground mt-2 transition-colors"
          onClick={() => setExpanded((v) => !v)}
        >
          <Code2 className="w-3 h-3" />
          {expanded ? "Hide" : "Show"} usage
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-border bg-muted/30 px-3 py-2">
          <pre className="text-[10px] font-mono text-foreground whitespace-pre-wrap">{comp.previewCode}</pre>
        </div>
      )}
    </div>
  );
}

export function ComponentMarketplacePanel({ projectId, onInstall }: ComponentMarketplacePanelProps) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set());
  // 21st.dev paste-URL state
  const [twentyFirstUrl, setTwentyFirstUrl] = useState("");
  const [importing21, setImporting21] = useState(false);

  const filtered = useMemo(() => {
    return COMPONENTS.filter((c) => {
      const matchCat = category === "All" || c.category === category;
      const q = search.toLowerCase();
      const matchSearch = !q || c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q) || c.category.toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }, [search, category]);

  async function installComponent(comp: MarketplaceComponent) {
    if (installingId) return;
    setInstallingId(comp.id);
    try {
      // Fire install prompt to AI chat
      if (onInstall) {
        onInstall(comp.installPrompt);
        toast({ title: `Installing ${comp.name}`, description: "Sent to AI — check the chat panel." });
      }
      setInstalledIds((prev) => new Set([...prev, comp.id]));
    } finally {
      setInstallingId(null);
    }
  }

  return (
    <div className="flex flex-col h-full text-sm">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 mb-1">
          <Package className="w-4 h-4 text-sky-400" />
          <h2 className="font-semibold text-foreground">Component Marketplace</h2>
          <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-border text-muted-foreground">
            {COMPONENTS.length} components
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">Browse and install pre-built components into your project</p>
      </div>

      {/* Search */}
      <div className="p-3 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search components…"
            className="pl-8 h-8 text-xs bg-muted/30 border-border"
          />
          {search && (
            <button className="absolute right-2.5 top-1/2 -translate-y-1/2" onClick={() => setSearch("")}>
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* 21st.dev paste-URL — drop any 21st.dev component directly into project files */}
      <div className="p-3 border-b border-border space-y-1.5">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
          Import from 21st.dev
        </p>
        <div className="flex items-center gap-1.5">
          <Input
            value={twentyFirstUrl}
            onChange={(e) => setTwentyFirstUrl(e.target.value)}
            placeholder="https://21st.dev/components/hero-1"
            className="h-8 text-[11px] bg-muted/30 border-border font-mono"
            onKeyDown={async (e) => {
              if (e.key === "Enter" && twentyFirstUrl.trim() && !importing21) {
                (e.currentTarget.nextElementSibling as HTMLButtonElement | null)?.click();
              }
            }}
          />
          <Button
            size="sm"
            className="h-8 text-[11px] bg-violet-600 hover:bg-violet-500 text-white"
            disabled={!twentyFirstUrl.trim() || importing21}
            onClick={async () => {
              setImporting21(true);
              try {
                const res = await fetch("/api/components/21st", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ projectId, url: twentyFirstUrl.trim() }),
                });
                const body = await res.json();
                if (!res.ok) throw new Error(body.error ?? body.hint ?? "Import failed");
                toast({
                  title: "21st.dev component imported",
                  description: body.path ?? body.targetPath ?? "Dropped into src/components/",
                });
                setTwentyFirstUrl("");
              } catch (err) {
                toast({
                  title: "Couldn't import",
                  description: err instanceof Error ? err.message : "Check the URL and try again.",
                  variant: "destructive",
                });
              } finally {
                setImporting21(false);
              }
            }}
          >
            {importing21 ? "Importing…" : "Import"}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground/70">
          Paste any 21st.dev URL — the component source is fetched and saved as a project file.
        </p>
      </div>

      {/* Category chips */}
      <div className="flex gap-1 px-3 py-2 border-b border-border overflow-x-auto no-scrollbar">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-medium transition-all ${
              category === cat ? "bg-violet-500/20 text-violet-300 border border-violet-500/30" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <Package className="w-7 h-7 text-muted-foreground/40" />
            <p className="text-sm font-medium text-foreground">No components found</p>
            <Button size="sm" variant="outline" onClick={() => { setSearch(""); setCategory("All"); }}>Clear filters</Button>
          </div>
        ) : (
          filtered.map((comp) => (
            <ComponentCard
              key={comp.id}
              comp={comp}
              installing={installingId === comp.id}
              onInstall={() => installComponent(comp)}
            />
          ))
        )}
      </div>
    </div>
  );
}
