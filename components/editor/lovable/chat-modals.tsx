"use client";

import { PreviewAnnotateModal } from "@/components/editor/preview-annotate-modal";
import { DesignPreviewPicker } from "@/components/editor/design-preview-picker";
import type { DesignPreviewDirection } from "@/lib/ai/design-previews";

interface LovableChatModalsProps {
  annotateOpen: boolean;
  attachedImage: string | null;
  onCloseAnnotate: () => void;
  onSendAnnotate: (annotated: string, note?: string) => void;
  designPreviewOpen: boolean;
  pendingDesignPrompt: string | null;
  projectId: string;
  fileCount: number;
  onDesignSelect: (direction: DesignPreviewDirection) => void;
  onDesignSkip: () => void;
  onDesignClose: () => void;
}

/** Annotate + design-preview modals anchored to the chat column. */
export function LovableChatModals({
  annotateOpen,
  attachedImage,
  onCloseAnnotate,
  onSendAnnotate,
  designPreviewOpen,
  pendingDesignPrompt,
  projectId,
  fileCount,
  onDesignSelect,
  onDesignSkip,
  onDesignClose,
}: LovableChatModalsProps) {
  return (
    <>
      {annotateOpen && attachedImage && (
        <PreviewAnnotateModal
          screenshotDataUrl={attachedImage}
          onClose={onCloseAnnotate}
          onSend={onSendAnnotate}
        />
      )}

      {designPreviewOpen && pendingDesignPrompt && (
        <DesignPreviewPicker
          open={designPreviewOpen}
          prompt={pendingDesignPrompt}
          projectId={projectId}
          fileCount={fileCount}
          onSelect={onDesignSelect}
          onSkip={onDesignSkip}
          onClose={onDesignClose}
        />
      )}
    </>
  );
}
