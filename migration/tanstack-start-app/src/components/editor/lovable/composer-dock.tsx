
import { AnimatePresence } from "framer-motion";
import { LovableAutofixBanner } from "./composer-banners";
import { LovableLoopRecoveryBanner } from "./loop-recovery-banner";
import { LovableNoCreditsBanner } from "./composer-banners";
import { LovableFileGenResultCards,type LovableFileGenResult } from "./file-gen-result-cards";
import { downloadLovableGeneratedFile,formatLovableFileSize } from "./file-size-utils";
import {
LovableClarifySessionCard,
type ClarifySession,
type ClarifyQuestion,
} from "./clarify-session-card";
import { LovableQuestionsAnsweredCard } from "./questions-answered-card";
import { LovablePromptQueue,type LovableQueueItem } from "./prompt-queue";
import { LovableSuggestionChips } from "./suggestion-chips";
import { LovableRecoveryChips,LOVABLE_RECOVERY_CHIPS } from "./recovery-chips";
import { LovablePostBuildPublishBanner } from "./post-build-publish-banner";
import { LovableComposerGuestCommentsBanner } from "./composer-guest-comments-banner";
import { LovableComposerRuntimeErrorsBanner } from "./composer-runtime-errors-banner";
import type { PreviewRuntimeError } from "@/lib/preview/preview-error-bridge";

interface LovableComposerDockProps {
  autoFixing: boolean;
  autoFixAttempts: number;
  maxAutoFixAttempts: number;
  freeFixesRemaining?: number | null;
  previewError: string | null | undefined;
  previewRuntimeErrors?: PreviewRuntimeError[];
  runtimeErrorsDismissed?: boolean;
  onFixRuntimeErrors?: () => void;
  onDismissRuntimeErrors?: () => void;
  noCredits: boolean;
  onSwitchToPlan: () => void;
  onRestoreSnapshot: () => void;
  onSuggestWays: () => void;
  onDismissLoopRecovery: () => void;
  fileGenResults: LovableFileGenResult[];
  onDismissFileGen: (id: string) => void;
  activeClarifySession: ClarifySession | null;
  onDismissClarify: () => void;
  onUpdateClarifyQuestion: (questionId: string, answer: string) => void;
  onClarifyBuildNow: (enrichedPrompt: string) => void;
  onClarifySkipAndBuild: (originalPrompt: string) => void;
  /** Lovable dump: collapsed “Questions answered” after clarify completes */
  answeredClarifyQuestions?: ClarifyQuestion[] | null;
  onDismissAnsweredClarify?: () => void;
  promptQueue: LovableQueueItem[];
  streaming: boolean;
  queuePaused: boolean;
  editingQueueId: string | null;
  editingQueueText: string;
  onToggleQueuePause: () => void;
  onClearQueue: () => void;
  onMoveQueueUp: (idx: number) => void;
  onMoveQueueDown: (idx: number) => void;
  onStartQueueEdit: (id: string, text: string) => void;
  onEditingQueueTextChange: (text: string) => void;
  onSaveQueueEdit: (id: string) => void;
  onCancelQueueEdit: () => void;
  onCycleQueueRepeat: (id: string) => void;
  onRemoveQueueItem: (id: string) => void;
  showEmptySuggestions: boolean;
  emptySuggestionChips: string[];
  onSelectEmptySuggestion: (label: string) => void;
  showRecoveryChips: boolean;
  onSelectRecoveryChip: (prompt: string) => void;
  projectId?: string;
  showSharePreview?: boolean;
  showPublishBanner?: boolean;
  deployedUrl?: string | null;
  publishBusy?: boolean;
  onPublish?: () => void;
  onOpenPublishPanel?: () => void;
  onDismissPublishBanner?: () => void;
  guestCommentCount?: number;
  showGuestCommentsBanner?: boolean;
  onOpenCommentsPanel?: () => void;
  onFixGuestComments?: () => void;
  onDismissGuestCommentsBanner?: () => void;
}

/** Banners, clarify flow, prompt queue, and suggestion chips above the composer. */
export function LovableComposerDock({
  autoFixing,
  autoFixAttempts,
  maxAutoFixAttempts,
  freeFixesRemaining,
  previewError,
  previewRuntimeErrors = [],
  runtimeErrorsDismissed,
  onFixRuntimeErrors,
  onDismissRuntimeErrors,
  noCredits,
  onSwitchToPlan,
  onRestoreSnapshot,
  onSuggestWays,
  onDismissLoopRecovery,
  fileGenResults,
  onDismissFileGen,
  activeClarifySession,
  onDismissClarify,
  onUpdateClarifyQuestion,
  onClarifyBuildNow,
  onClarifySkipAndBuild,
  answeredClarifyQuestions = null,
  promptQueue,
  streaming,
  queuePaused,
  editingQueueId,
  editingQueueText,
  onToggleQueuePause,
  onClearQueue,
  onMoveQueueUp,
  onMoveQueueDown,
  onStartQueueEdit,
  onEditingQueueTextChange,
  onSaveQueueEdit,
  onCancelQueueEdit,
  onCycleQueueRepeat,
  onRemoveQueueItem,
  showEmptySuggestions,
  emptySuggestionChips,
  onSelectEmptySuggestion,
  showRecoveryChips,
  onSelectRecoveryChip,
  projectId,
  showSharePreview,
  showPublishBanner,
  deployedUrl,
  publishBusy,
  onPublish,
  onOpenPublishPanel,
  onDismissPublishBanner,
  guestCommentCount = 0,
  showGuestCommentsBanner,
  onOpenCommentsPanel,
  onFixGuestComments,
  onDismissGuestCommentsBanner,
}: LovableComposerDockProps) {
  return (
    <>
      {autoFixing && (
        <LovableAutofixBanner
          attempt={autoFixAttempts}
          maxAttempts={maxAutoFixAttempts}
          freeRemaining={freeFixesRemaining}
        />
      )}

      {previewError && !noCredits && autoFixAttempts >= maxAutoFixAttempts && !autoFixing && (
        <LovableLoopRecoveryBanner
          previewError={previewError}
          onSwitchToPlan={onSwitchToPlan}
          onRestoreSnapshot={onRestoreSnapshot}
          onSuggestWays={onSuggestWays}
          onDismiss={onDismissLoopRecovery}
        />
      )}

      {noCredits && <LovableNoCreditsBanner />}

      {!runtimeErrorsDismissed && previewRuntimeErrors.length > 0 && onFixRuntimeErrors && (
        <LovableComposerRuntimeErrorsBanner
          errors={previewRuntimeErrors}
          visible
          onFixWithAI={onFixRuntimeErrors}
          onDismiss={onDismissRuntimeErrors}
        />
      )}

      {showPublishBanner && onPublish && onDismissPublishBanner && (
        <LovablePostBuildPublishBanner
          visible
          deployedUrl={deployedUrl}
          publishing={publishBusy}
          onPublish={onPublish}
          onOpenPublishPanel={onOpenPublishPanel}
          onDismiss={onDismissPublishBanner}
        />
      )}

      {/* Preview share link removed from the chat panel per product decision —
          sharing lives in the top-bar Share menu. Component kept for reuse:
          {showSharePreview && projectId && <LovableComposerSharePreview projectId={projectId} />} */}

      {showGuestCommentsBanner && guestCommentCount > 0 && onDismissGuestCommentsBanner && (
        <LovableComposerGuestCommentsBanner
          visible
          count={guestCommentCount}
          onOpenComments={onOpenCommentsPanel}
          onFixWithAI={onFixGuestComments}
          onDismiss={onDismissGuestCommentsBanner}
        />
      )}

      <LovableFileGenResultCards
        results={fileGenResults}
        formatSize={formatLovableFileSize}
        onDownload={(f) =>
          downloadLovableGeneratedFile({
            filename: f.filename,
            content: f.content,
            mimeType: f.mimeType ?? "text/plain",
            base64: f.base64,
          })
        }
        onDismiss={onDismissFileGen}
      />

      <AnimatePresence>
        {activeClarifySession && (
          <LovableClarifySessionCard
            session={activeClarifySession}
            onDismiss={onDismissClarify}
            onUpdateQuestion={onUpdateClarifyQuestion}
            onBuildNow={onClarifyBuildNow}
            onSkipAndBuild={onClarifySkipAndBuild}
          />
        )}

        {!activeClarifySession && answeredClarifyQuestions && answeredClarifyQuestions.length > 0 && (
          <LovableQuestionsAnsweredCard questions={answeredClarifyQuestions} />
        )}

        <LovablePromptQueue
          items={promptQueue}
          streaming={streaming}
          paused={queuePaused}
          editingId={editingQueueId}
          editingText={editingQueueText}
          onTogglePause={onToggleQueuePause}
          onClearAll={onClearQueue}
          onMoveUp={onMoveQueueUp}
          onMoveDown={onMoveQueueDown}
          onStartEdit={onStartQueueEdit}
          onEditingTextChange={onEditingQueueTextChange}
          onSaveEdit={onSaveQueueEdit}
          onCancelEdit={onCancelQueueEdit}
          onCycleRepeat={onCycleQueueRepeat}
          onRemove={onRemoveQueueItem}
        />
      </AnimatePresence>

      {showEmptySuggestions && (
        <LovableSuggestionChips
          className="px-3 pt-2 pb-1 shrink-0"
          chips={emptySuggestionChips.slice(0, 4)}
          icon={<span className="text-[var(--fg-accent)]">→</span>}
          onSelect={onSelectEmptySuggestion}
        />
      )}

      {showRecoveryChips && (
        <LovableRecoveryChips chips={LOVABLE_RECOVERY_CHIPS} onSelect={onSelectRecoveryChip} />
      )}
    </>
  );
}
