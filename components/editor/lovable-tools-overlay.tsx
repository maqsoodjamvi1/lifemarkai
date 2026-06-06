"use client";

import { BarChart2, Cloud, CreditCard, Search, Shield, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LeftPanel } from "./editor-layout";

export const LOVABLE_TOOL_IDS = new Set<LeftPanel>([
  "analytics",
  "cloud",
  "payments",
  "security",
  "seo",
]);

export function isLovableToolPanel(panel: LeftPanel | null): panel is LeftPanel {
  return panel !== null && LOVABLE_TOOL_IDS.has(panel);
}

export const LOVABLE_TOOL_TABS: {
  id: LeftPanel;
  label: string;
  icon: React.ElementType;
}[] = [
  { id: "analytics", label: "Analytics", icon: BarChart2 },
  { id: "cloud", label: "Cloud", icon: Cloud },
  { id: "payments", label: "Payments", icon: CreditCard },
  { id: "security", label: "Security", icon: Shield },
  { id: "seo", label: "SEO & AI search", icon: Search },
];

interface LovableToolsOverlayProps {
  activeTab: LeftPanel;
  onTabChange: (tab: LeftPanel) => void;
  onClose: () => void;
  children: React.ReactNode;
}

/** Lovable-style "More" overlay — left nav + full content area */
export function LovableToolsOverlay({
  activeTab,
  onTabChange,
  onClose,
  children,
}: LovableToolsOverlayProps) {
  return (
    <div className="absolute inset-0 z-20 flex bg-background">
      <nav className="w-52 shrink-0 border-r border-border bg-muted/20 flex flex-col py-3">
        {LOVABLE_TOOL_TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onTabChange(id)}
            className={`flex items-center gap-2.5 px-4 py-2.5 text-sm text-left transition-colors ${
              activeTab === id
                ? "bg-background text-foreground font-medium border-r-2 border-[#0066FF] -mr-px"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0 opacity-70" />
            {label}
          </button>
        ))}
      </nav>
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between h-11 px-4 border-b border-border shrink-0">
          <span className="text-sm font-medium text-foreground">More</span>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="flex-1 overflow-hidden">{children}</div>
      </div>
    </div>
  );
}

/** Header for history overlay on the chat side */
export function LovableOverlayHeader({
  title,
  onClose,
}: {
  title: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center justify-between h-11 px-4 border-b border-border shrink-0 bg-background">
      <span className="text-sm font-semibold">{title}</span>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
