import { Github, CreditCard, Figma, Database } from "lucide-react";
import type { LeftPanel } from "@/components/editor/editor-layout";

const COMPOSER_CONNECTORS: Array<{
  label: string;
  panel: LeftPanel;
  icon: typeof Github;
}> = [
  { label: "GitHub", panel: "github", icon: Github },
  { label: "Supabase", panel: "cloud", icon: Database },
  { label: "Stripe", panel: "payments", icon: CreditCard },
  { label: "Figma", panel: "figma", icon: Figma },
];

/** Compact connector shortcuts in the chat composer — open existing panels. */
export function LovableComposerConnectorChips({
  onOpenPanel,
}: {
  onOpenPanel?: (panel: LeftPanel) => void;
}) {
  if (!onOpenPanel) return null;
  return (
    <div className="flex items-center gap-1 overflow-x-auto" aria-label="Connectors">
      {COMPOSER_CONNECTORS.map(({ label, panel, icon: Icon }) => (
        <button
          key={panel}
          type="button"
          title={`Connect ${label}`}
          onClick={() => onOpenPanel(panel)}
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-border/60 bg-background px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:border-border hover:bg-muted/70 hover:text-foreground"
        >
          <Icon className="h-3 w-3" />
          {label}
        </button>
      ))}
    </div>
  );
}
