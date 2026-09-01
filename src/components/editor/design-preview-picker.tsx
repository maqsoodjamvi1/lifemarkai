
import { useCallback,useEffect,useState,useRef } from "react";
import { Loader2,Palette,X,Sparkles } from "lucide-react";
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
  const [surfaceLabel, setSurfaceLabel] = useState<string | null>(null);
  const recommendedId = directions[0]?.id ?? null;
  const selectedIsRecommended = !selectedId || selectedId === recommendedId;

  const requestControllerRef = useRef<AbortController | null>(null);

  const loadPreviews = useCallback((force: boolean) => {
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    setLoading(true);
    setError(null);
    void fetch("/api/ai/design-previews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(force ? { prompt, projectId, fileCount, force: true } : { prompt, projectId, fileCount }),
      signal: controller.signal,
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({ error: `Preview request failed (${res.status})` }));
        if (controller.signal.aborted) return;
        if (!res.ok) throw new Error(data.error ?? "Failed to load previews");
        if (data.skip) {
          onSkip();
          return;
        }
        const nextDirections = data.directions ?? [];
        setSurfaceLabel(typeof data.surfaceLabel === "string" ? data.surfaceLabel : null);
        setDirections(nextDirections);
        setSelectedId((current) =>
          current && nextDirections.some((dir: DesignPreviewDirection) => dir.id === current)
            ? current
            : (nextDirections[0]?.id ?? null),
        );
      })
      .catch((e: Error) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (requestControllerRef.current === controller) {
          requestControllerRef.current = null;
          setLoading(false);
        }
      });
  }, [fileCount, onSkip, projectId, prompt]);

  useEffect(() => {
    if (!open) return;
    setDirections([]);
    setSelectedId(null);
    setSurfaceLabel(null);
    loadPreviews(false);
    return () => {
      requestControllerRef.current?.abort();
      requestControllerRef.current = null;
    };
  }, [loadPreviews, open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
      <div
        className="w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl border border-border bg-background shadow-2xl flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="design-preview-title"
      >
        <div className="flex items-start justify-between gap-3 p-4 border-b border-border">
          <div className="flex items-start gap-2">
            <Palette size={16} className="text-blue-500 mt-0.5 shrink-0" />
            <div>
              <h2 id="design-preview-title" className="text-sm font-semibold">
                Choose {surfaceLabel ? `a ${surfaceLabel} direction` : "a design direction"}
              </h2>
              <p className="text-[11px] text-muted-foreground mt-0.5 max-w-lg">
                I auto-pick the strongest fit for your prompt. You can build with it immediately, choose another, or skip.
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
              <div className="flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => loadPreviews(true)}
                  className="text-xs text-foreground hover:underline"
                >
                  Try again
                </button>
                <button
                  type="button"
                  onClick={onSkip}
                  className="text-xs text-blue-500 hover:underline"
                >
                  Skip and build anyway
                </button>
              </div>
            </div>
          )}

          {!loading && !error && directions.length > 0 && (
            <DesignPreviewCards
              directions={directions}
              selectedId={selectedId}
              onSelect={setSelectedId}
              recommendedId={recommendedId}
            />
          )}
        </div>

        <div className="flex items-center justify-between gap-2 p-4 border-t border-border bg-muted/20">
          <button
            type="button"
            onClick={onSkip}
            className="text-xs text-muted-foreground hover:text-foreground transition px-2 py-1.5"
          >
            Skip design choice
          </button>
          <button
            type="button"
            disabled={directions.length === 0 || loading}
            onClick={() => {
              const dir = directions.find((d) => d.id === selectedId) ?? directions[0];
              if (dir) onSelect(dir);
            }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            <Sparkles size={13} />
            {selectedIsRecommended ? "Build with auto-picked design" : "Build with selected design"}
          </button>
        </div>
      </div>
    </div>
  );
}
