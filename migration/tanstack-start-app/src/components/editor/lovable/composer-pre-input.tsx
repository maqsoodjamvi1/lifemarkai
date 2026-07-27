
import type { Ref } from "react";
import type { ProjectFile } from "@/types/database";
import { LovableComposerApprovalSlot } from "./composer-approval-slot";
import type { ConnectorApprovalRequest } from "./connector-approval-card";
import type { CloudActionRequest } from "./cloud-ops-card";
import { LovableComposerFollowUpChips } from "./composer-follow-up-chips";
import { LovableAttachedMockupCard } from "./attached-mockup-card";
import { LovableComposerAttachedTextChip } from "./composer-attached-text-chip";
import {
  LovableComposerUrlScrapeBanner,
  type LovableUrlScrapeMeta,
} from "./composer-url-scrape-banner";
import { LovableComposerContextChips } from "./composer-context-chips";
import { LovableComposerLineRefChips } from "./composer-line-ref-chips";
import {
  LovableComposerSecretBanner,
  type LovableSecretBannerState,
} from "./composer-secret-banner";
import type { ParsedLineRef } from "@/lib/editor/parse-line-refs";

export interface LovableComposerPreInputProps {
  /** Kept for API compat — drop overlay now mounts on form#chat-input. */
  isDragging?: boolean;
  projectId: string;
  connectorApproval: ConnectorApprovalRequest | null;
  onConnectorApprovalClear: () => void;
  cloudAction: CloudActionRequest | null;
  onCloudActionClear: () => void;
  cloudTierPick: string;
  onCloudTierPick: (tier: string) => void;
  onRetryAgent: (prompt: string) => void;
  streaming: boolean;
  followUpChips: string[];
  onSelectFollowUp: (chip: string) => void;
  attachedImage: string | null;
  attachedImageName: string | null;
  onRemoveAttachedImage: () => void;
  onAnnotateAttachedImage: () => void;
  onAttachedImagePreset: (prompt: string) => void;
  attachedText: { name: string; content: string } | null;
  onRemoveAttachedText: () => void;
  detectedUrl: string | null;
  isScraping: boolean;
  scrapedMeta: LovableUrlScrapeMeta | null;
  onDismissUrlScrape: () => void;
  onUrlQuickAction: (prompt: string) => void;
  /** @deprecated Attach input lives in composer bottom row (dump order). */
  fileInputRef?: Ref<HTMLInputElement>;
  onImageAttach?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  contextFiles: ProjectFile[];
  onRemoveContextFile: (id: string) => void;
  lineRefs?: ParsedLineRef[];
  onRemoveLineRef?: (raw: string) => void;
  onOpenLineRefAtLine?: (path: string, line: number) => void;
  secretBanner?: LovableSecretBannerState | null;
  onDismissSecretBanner?: () => void;
  onOpenSecrets?: () => void;
}

/** Attachments, approvals, and contextual chips above the composer input card. */
export function LovableComposerPreInput({
  projectId,
  connectorApproval,
  onConnectorApprovalClear,
  cloudAction,
  onCloudActionClear,
  cloudTierPick,
  onCloudTierPick,
  onRetryAgent,
  streaming,
  followUpChips,
  onSelectFollowUp,
  attachedImage,
  attachedImageName,
  onRemoveAttachedImage,
  onAnnotateAttachedImage,
  onAttachedImagePreset,
  attachedText,
  onRemoveAttachedText,
  detectedUrl,
  isScraping,
  scrapedMeta,
  onDismissUrlScrape,
  onUrlQuickAction,
  contextFiles,
  onRemoveContextFile,
  lineRefs = [],
  onRemoveLineRef,
  onOpenLineRefAtLine,
  secretBanner,
  onDismissSecretBanner,
  onOpenSecrets,
}: LovableComposerPreInputProps) {
  return (
    <>
      <LovableComposerApprovalSlot
        projectId={projectId}
        connectorApproval={connectorApproval}
        onConnectorApprovalClear={onConnectorApprovalClear}
        cloudAction={cloudAction}
        onCloudActionClear={onCloudActionClear}
        cloudTierPick={cloudTierPick}
        onCloudTierPick={onCloudTierPick}
        onRetryAgent={onRetryAgent}
      />

      {!streaming && followUpChips.length > 0 && (
        <LovableComposerFollowUpChips chips={followUpChips} onSelect={onSelectFollowUp} />
      )}

      {attachedImage && (
        <LovableAttachedMockupCard
          imageSrc={attachedImage}
          fileName={attachedImageName}
          onRemove={onRemoveAttachedImage}
          onAnnotate={onAnnotateAttachedImage}
          onPreset={onAttachedImagePreset}
        />
      )}

      {attachedText && (
        <LovableComposerAttachedTextChip
          name={attachedText.name}
          lineCount={attachedText.content.split("\n").length}
          onRemove={onRemoveAttachedText}
        />
      )}

      {detectedUrl && (
        <LovableComposerUrlScrapeBanner
          url={detectedUrl}
          isScraping={isScraping}
          meta={scrapedMeta}
          onDismiss={onDismissUrlScrape}
          onQuickAction={onUrlQuickAction}
        />
      )}

      <LovableComposerContextChips
        files={contextFiles}
        onRemove={onRemoveContextFile}
      />

      {lineRefs.length > 0 && onRemoveLineRef && (
        <LovableComposerLineRefChips
          refs={lineRefs}
          onRemove={onRemoveLineRef}
          onOpenAtLine={onOpenLineRefAtLine}
        />
      )}

      {secretBanner && onDismissSecretBanner && (
        <LovableComposerSecretBanner
          state={secretBanner}
          onDismiss={onDismissSecretBanner}
          onOpenSecrets={onOpenSecrets}
        />
      )}
    </>
  );
}
