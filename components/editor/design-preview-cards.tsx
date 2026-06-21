"use client";

import type { DesignPreviewDirection } from "@/lib/ai/design-previews";

interface DesignPreviewCardsProps {
  directions: DesignPreviewDirection[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  compact?: boolean;
}

export function DesignPreviewCards({
  directions,
  selectedId,
  onSelect,
  compact = false,
}: DesignPreviewCardsProps) {
  return (
    <div className={`grid gap-2 ${compact ? "grid-cols-1" : "grid-cols-1 md:grid-cols-3"}`}>
      {directions.map((dir) => (
        <button
          key={dir.id}
          type="button"
          onClick={() => onSelect(dir.id)}
          className={`text-left rounded-xl border-2 overflow-hidden transition ${
            selectedId === dir.id
              ? "border-blue-500 ring-2 ring-blue-500/20"
              : "border-border hover:border-border/80"
          }`}
        >
          <div className={`${compact ? "h-28" : "h-36"} bg-muted/30 overflow-hidden border-b border-border`}>
            <iframe
              title={dir.label}
              sandbox=""
              srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;overflow:hidden;}</style></head><body>${dir.previewHtml}</body></html>`}
              className="w-full h-full pointer-events-none scale-[0.85] origin-top-left"
              style={{ width: "118%", height: "118%" }}
            />
          </div>
          <div className="p-2.5 space-y-1.5">
            <div className="flex items-center gap-1.5">
              {dir.colors.map((c, i) => (
                <div
                  key={i}
                  className="w-3.5 h-3.5 rounded-full border border-border shrink-0"
                  style={{ backgroundColor: c }}
                />
              ))}
              <span className="text-[11px] font-semibold ml-0.5">{dir.label}</span>
            </div>
            <p className="text-[10px] text-muted-foreground leading-snug">{dir.desc}</p>
          </div>
        </button>
      ))}
    </div>
  );
}
