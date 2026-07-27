
import { useState } from "react";
import { Globe, X, ZoomIn } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface LovablePreviewSnapshotCardProps {
  messageId: string;
  src: string;
}

export function LovablePreviewSnapshotCard({ messageId, src }: LovablePreviewSnapshotCardProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);

  return (
    <>
      <div className="w-full mt-1.5 rounded-lg overflow-hidden border border-border/50 bg-muted/10 group/thumb">
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/30">
          <span className="text-[10px] text-muted-foreground/60 flex items-center gap-1.5">
            <Globe className="w-3 h-3" />
            Preview snapshot
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setLightboxOpen(true)}
              className="text-[10px] text-muted-foreground/40 hover:text-foreground transition-colors px-1.5 py-0.5 rounded hover:bg-white/10 inline-flex items-center gap-1"
              title="View full size"
            >
              <ZoomIn className="w-3 h-3" />
              Expand
            </button>
            <button
              type="button"
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent("lifemark-request-screenshot", { detail: { messageId } }),
                )
              }
              className="text-[10px] text-muted-foreground/40 hover:text-foreground transition-colors px-1.5 py-0.5 rounded hover:bg-white/10"
              title="Re-capture current preview"
            >
              Refresh
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setLightboxOpen(true)}
          className="relative overflow-hidden max-h-36 group-hover/thumb:max-h-64 transition-all duration-300 w-full text-left"
          title="Click to expand"
        >
          <img
            src={src}
            alt="App preview at this point in time"
            className="w-full h-auto object-cover object-top"
            style={{ imageRendering: "crisp-edges" }}
          />
          <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-background/80 to-transparent group-hover/thumb:opacity-0 transition-opacity pointer-events-none" />
        </button>
      </div>

      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-w-[min(96vw,1200px)] p-0 overflow-hidden bg-background/95 border-border/60">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border/40">
            <span className="text-xs text-muted-foreground">Preview snapshot</span>
            <button
              type="button"
              onClick={() => setLightboxOpen(false)}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="max-h-[85vh] overflow-auto p-2">
            <img
              src={src}
              alt="App preview at this point in time"
              className="w-full h-auto rounded-md"
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
