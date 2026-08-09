
import { useEffect,useState } from "react";
import type { EditorMode } from "@/components/editor/editor-layout";
import { estimateMessageCredits } from "@/lib/ai/estimate-message-credits";
import { LovableChatHeaderPreviewChip } from "./chat-header-extras";

interface LovableChatHeaderStatusProps {
  queuePaused?: boolean;
}

/** Listens for preview boot status below the chat header. */
export function LovableChatHeaderStatus(_props: LovableChatHeaderStatusProps) {
  const [previewStatus, setPreviewStatus] = useState<string | null>(null);

  useEffect(() => {
    function onStatus(e: Event) {
      const text = (e as CustomEvent<{ text?: string }>).detail?.text ?? null;
      setPreviewStatus(text);
    }
    window.addEventListener("lifemark-preview-status", onStatus);
    return () => window.removeEventListener("lifemark-preview-status", onStatus);
  }, []);

  if (!previewStatus) return null;

  return (
    <div className="flex items-center gap-1.5 px-3 pb-1 -mt-1 shrink-0 flex-wrap">
      <LovableChatHeaderPreviewChip statusText={previewStatus} />
    </div>
  );
}

interface LovableComposerEstimatedCreditsProps {
  mode: EditorMode;
  inputLength: number;
  hasAttachments?: boolean;
  fileCount?: number;
}

/** Pre-send credit estimate below the composer textarea. */
export function LovableComposerEstimatedCredits({
  mode,
  inputLength,
  hasAttachments,
  fileCount,
}: LovableComposerEstimatedCreditsProps) {
  const label = estimateMessageCredits(mode, { inputLength, hasAttachments, fileCount });
  return (
    <p className="px-3 pb-0.5 text-[10px] text-[var(--fg-quaternary)] tabular-nums text-right">
      Est. {label}
    </p>
  );
}
