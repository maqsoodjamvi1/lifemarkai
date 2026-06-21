"use client";

import { useEffect, useState } from "react";
import { Loader2, Palette, X, Sparkles } from "lucide-react";
import type { DesignPreviewDirection } from "@/lib/ai/design-previews";
import { DesignPreviewCards } from "./design-preview-cards";

interface DesignPreviewPickerProps {
  open: boolean;
  prompt: string;
  projectId: string;
  fileCount: number;
  onSelect: (direction: DesignPreviewDirection) => void;
  onSkip: () => void;
  onClose: () => void;
}

export function DesignPreviewPicker({
  open,
  prompt,
  projectId,
  fileCount,
  onSelect,
  onSkip,
  onClose,
}: DesignPreviewPickerProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [directions, setDirections] = useState<DesignPreviewDirection[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    setDirections([]);
    setSelectedId(null);

    void fetch("/api/ai/design-previews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, projectId, fileCount }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load previews");
        if (data.skip) {
          onSkip();
          return;
        }
        setDirections(data.directions ?? []);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prompt, projectId, fileCount]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl border border-border bg-background shadow-2xl flex flex-col">
        <div className="flex items-start justify-between gap-3 p-4 border-b border-border">
          <div className="flex items-start gap-2">
            <Palette size={16} className="text-blue-500 mt-0.5 shrink-0" />
            <div>
              <h2 className="text-sm font-semibold">Choose a design direction</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5 max-w-lg">
                Three AI-generated previews for your app. Pick one to guide the build — or skip to let the AI decide.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
              <p className="text-xs">Generating three design previews…</p>
            </div>
          )}

          {error && (
            <div className="text-center py-12 space-y-3">
              <p className="text-sm text-destructive">{error}</p>
              <button
                type="button"
                onClick={onSkip}
                className="text-xs text-blue-500 hover:underline"
              >
                Skip and build anyway
              </button>
            </div>
          )}

          {!loading && !error && directions.length > 0 && (
            <DesignPreviewCards
              directions={directions}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          )}
        </div>

        <div className="flex items-center justify-between gap-2 p-4 border-t border-border bg-muted/20">
          <button
            type="button"
            onClick={onSkip}
            className="text-xs text-muted-foreground hover:text-foreground transition px-2 py-1.5"
          >
            Skip — AI picks for me
          </button>
          <button
            type="button"
            disabled={!selectedId || loading}
            onClick={() => {
              const dir = directions.find((d) => d.id === selectedId);
              if (dir) onSelect(dir);
            }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            <Sparkles size={13} />
            Build with this design
          </button>
        </div>
      </div>
    </div>
  );
}
