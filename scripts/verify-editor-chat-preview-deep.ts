/**
 * Deep integration audit: editor intelligence + chat stream + preview wiring.
 * Run: npx tsx scripts/verify-editor-chat-preview-deep.ts
 * Optional live: NEXT_PUBLIC_APP_URL=http://localhost:3000 (needs dev server + .env.local)
 */
import { readFileSync } from "fs";
import {
  resolvePromptMode,
  shouldFocusPreviewAfterGeneration,
} from "../lib/ai/editor-intelligence";
import { buildHealingPrompt, formatErrorsForHealing } from "../lib/preview/preview-error-bridge";
import { resolvePreviewEngine } from "../lib/preview/resolve-preview-engine";
import { PREVIEW_ENGINE_REV } from "../lib/preview/build-fallback-html";

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

type Check = { name: string; ok: boolean; detail?: unknown };

const checks: Check[] = [];
function check(name: string, ok: boolean, detail?: unknown) {
  checks.push({ name, ok, detail });
  console.log(JSON.stringify({ ok, name, detail }));
}

// ── Intelligence routing ────────────────────────────────────────────────────

const emptyCtx = { fileCount: 0, hasPreviewError: false, hasCredits: true, currentMode: "chat" as const };
const appCtx = {
  fileCount: 12,
  hasPreviewError: false,
  hasCredits: true,
  currentMode: "build" as const,
  files: [
    { path: "src/App.tsx", content: "export default function App(){}" },
    { path: "src/main.tsx", content: "import App from './App'" },
    { path: "src/pages/Home.tsx", content: "" },
    { path: "src/pages/About.tsx", content: "" },
    { path: "src/components/Header.tsx", content: "" },
    { path: "src/components/Footer.tsx", content: "" },
    { path: "package.json", content: '{"devDependencies":{"vite":"5"}}' },
    { path: "vite.config.ts", content: "" },
  ],
};

check(
  "chat tab: plain build prompt stays chat",
  resolvePromptMode("Build a coffee shop", emptyCtx) === "chat",
);
check(
  "chat tab: /build escapes to build",
  resolvePromptMode("/build add hero", emptyCtx) === "build",
);
check(
  "build tab on app: short surgical edit → patch",
  resolvePromptMode("add menu items in header", appCtx) === "patch",
);
check(
  "build tab on app: larger feature → agent",
  resolvePromptMode("Add a full pricing page with Stripe checkout and FAQ accordion", appCtx) === "agent",
);
check(
  "chat tab on app: add menu items → patch",
  resolvePromptMode("add menu items in header", { ...appCtx, currentMode: "chat" }) === "patch",
);
check(
  "preview error + fix keyword → patch/build",
  ["patch", "build"].includes(
    resolvePromptMode("fix the preview error", { ...appCtx, hasPreviewError: true }),
  ),
);

// ── Source-level invariants (grep audit) ────────────────────────────────────

const chatSrc = readFileSync("components/editor/chat-panel.tsx", "utf8");
const fixSrc = readFileSync("app/api/ai/fix/route.ts", "utf8");
const agentSrc = readFileSync("app/api/ai/agent/route.ts", "utf8");
const streamHookSrc = readFileSync("hooks/use-ai-stream-chat.ts", "utf8");
const previewSrc = readFileSync("components/editor/preview-panel.tsx", "utf8");
const layoutSrc = readFileSync("components/editor/editor-layout.tsx", "utf8");
const topBarSrc = readFileSync("components/editor/editor-top-bar.tsx", "utf8");

check(
  "lovable: virtual chat timeline",
  chatSrc.includes("LovableChatTimeline"),
);
check(
  "lovable: files view pane",
  layoutSrc.includes("LovableFilesViewPane") && layoutSrc.includes('viewMode === "files"'),
);
check(
  "lovable: upgrade dialog rendered",
  topBarSrc.includes("LovableUpgradeDialog") && topBarSrc.includes("showUpgradeDialog"),
);
check(
  "lovable: unified preview chrome",
  previewSrc.includes("hideTopChrome") && previewSrc.includes("LovablePreviewInteractionToolbar"),
);
const lovableIndexSrc = readFileSync("components/editor/lovable/index.ts", "utf8");
const messageRowSrc = readFileSync("components/editor/lovable/message-row.tsx", "utf8");
const composerDockSrc = readFileSync("components/editor/lovable/composer-dock.tsx", "utf8");
const composerBottomRowSrc = readFileSync("components/editor/lovable/composer-bottom-row.tsx", "utf8");
const composerPreInputSrc = readFileSync("components/editor/lovable/composer-pre-input.tsx", "utf8");
const composerOverlaysSrc = readFileSync("components/editor/lovable/composer-overlays.tsx", "utf8");
const composerInputAreaSrc = readFileSync("components/editor/lovable/composer-input-area.tsx", "utf8");
const streamingFooterSrc = readFileSync("components/editor/lovable/streaming-footer.tsx", "utf8");

check(
  "lovable: extracted chat primitives",
  chatSrc.includes("LovableScrollToBottom") &&
    chatSrc.includes("LovableComposerDock") &&
    lovableIndexSrc.includes("LovableAgentTrace") &&
    lovableIndexSrc.includes("LovableMessageActions") &&
    lovableIndexSrc.includes("LovableChatEmptyState") &&
    lovableIndexSrc.includes("LovableRecoveryChips") &&
    lovableIndexSrc.includes("formatLovableDateSeparator") &&
    lovableIndexSrc.includes("LovablePinnedMessageBanner") &&
    lovableIndexSrc.includes("LovableLoopRecoveryBanner") &&
    readFileSync("components/editor/lovable/message-timestamp.tsx", "utf8").includes("formatLovableMessageTime"),
);
check(
  "lovable: version preview banner",
  previewSrc.includes("LovableVersionPreviewBanner"),
);
check(
  "layout: file tree redirects to files view",
  layoutSrc.includes('viewMode !== "files"') && layoutSrc.includes('setViewMode("files")'),
);
check(
  "sandbox: cloud status API",
  readFileSync("app/api/sandbox/status/route.ts", "utf8").includes("isSandboxEnabled"),
);
check(
  "preview: skip WebContainer when cloud sandbox enabled",
  previewSrc.includes("sandboxEnabled") && previewSrc.includes("if (sandboxEnabled) return"),
);
check(
  "lovable: composer Plan|Build row",
  chatSrc.includes("LovableComposerInputArea") &&
    composerBottomRowSrc.includes("LovableComposerModeRow"),
);
check(
  "lovable: clarify session card",
  chatSrc.includes("LovableComposerDock") &&
    composerDockSrc.includes("LovableClarifySessionCard"),
);
check(
  "lovable: composer context menu wired",
  chatSrc.includes("LovableComposerInputArea") &&
    composerBottomRowSrc.includes("LovableComposerContextMenu") &&
    composerBottomRowSrc.includes("LovableVisualEditsButton"),
);
check(
  "lovable: composer send controls wired",
  chatSrc.includes("LovableComposerInputArea") &&
    composerBottomRowSrc.includes("LovableComposerSendControls"),
);
check(
  "lovable: connector + cloud approval cards",
  chatSrc.includes("LovableComposerPreInput") &&
    composerPreInputSrc.includes("LovableComposerApprovalSlot"),
);
check(
  "lovable: streaming footer + message utils extracted",
  chatSrc.includes("LovableChatStreamingFooter") &&
    chatSrc.includes("getDisplayMessageContent") &&
    chatSrc.includes("mergeAgentStep") &&
    readFileSync("components/editor/lovable/message-utils.ts", "utf8").includes("groupIntoThreads"),
);
check(
  "lovable: composer input stack extracted",
  chatSrc.includes("LovableComposerPreInput") &&
    chatSrc.includes("LovableComposerInputArea") &&
    lovableIndexSrc.includes("LovableComposerBottomRow"),
);
check(
  "lovable: composer dock controller + keyboard shortcuts",
  chatSrc.includes("useComposerDockController") &&
    chatSrc.includes("useChatKeyboardShortcuts") &&
    chatSrc.includes("LovableChatModals") &&
    lovableIndexSrc.includes("use-composer-dock-controller"),
);
check(
  "lovable: new composer UX (line refs, secret banner, publish, share)",
  chatSrc.includes("composerLineRefs") &&
    chatSrc.includes("secretBanner") &&
    chatSrc.includes("handlePublishFromChat") &&
    readFileSync("components/editor/lovable/composer-line-ref-chips.tsx", "utf8").includes("onOpenAtLine") &&
    readFileSync("components/editor/lovable/composer-line-ref-chips.tsx", "utf8").includes("LovableComposerLineRefChips") &&
    readFileSync("components/editor/lovable/post-build-publish-banner.tsx", "utf8").includes("LovablePostBuildPublishBanner") &&
    readFileSync("components/editor/lovable/composer-share-preview.tsx", "utf8").includes("LovableComposerSharePreview"),
);
check(
  "sandbox: VEB bridge patched into sync + preview boot",
  readFileSync("app/api/projects/[id]/sandbox-preview/sync/route.ts", "utf8").includes("patchSandboxPreviewFiles") &&
    readFileSync("app/api/projects/[id]/sandbox-preview/route.ts", "utf8").includes("patchSandboxPreviewFiles") &&
    previewSrc.includes("previewEngine === \"sandbox\"") &&
    previewSrc.includes("VebBridgePopover"),
);
check(
  "lovable: guest comments banner + reasoning stream",
  chatSrc.includes("useGuestCommentCount") &&
    chatSrc.includes("showGuestCommentsBanner") &&
    chatSrc.includes("handleFixGuestComments") &&
    chatSrc.includes("formatGuestCommentsForAi") &&
    chatSrc.includes("extractStreamingReasoning") &&
    readFileSync("components/editor/lovable/composer-dock.tsx", "utf8").includes("onFixGuestComments") &&
    readFileSync("components/editor/lovable/composer-dock.tsx", "utf8").includes("LovableComposerGuestCommentsBanner") &&
    readFileSync("hooks/use-guest-comment-count.ts", "utf8").includes("useGuestCommentCount"),
);
check(
  "lovable: header status + credit estimate + add to knowledge",
  chatSrc.includes("LovableChatHeaderStatus") &&
    chatSrc.includes("handleAddToKnowledge") &&
    chatSrc.includes("handleOpenLineRefAtLine") &&
    readFileSync("components/editor/lovable/composer-input-area.tsx", "utf8").includes("LovableComposerEstimatedCredits") &&
    readFileSync("components/editor/lovable/message-actions.tsx", "utf8").includes("onAddToKnowledge") &&
    readFileSync("lib/ai/estimate-message-credits.ts", "utf8").includes("estimateMessageCredits"),
);
check(
  "preview: guest comments injected for public sandbox",
  readFileSync("lib/preview/inject-guest-comments.ts", "utf8").includes("injectGuestCommentsIntoHtml") &&
    readFileSync("app/api/projects/[id]/sandbox-preview/route.ts", "utf8").includes("is_public"),
);
check(
  "lovable: composer dock + timeline header extracted",
  chatSrc.includes("LovableComposerDock") &&
    chatSrc.includes("LovableChatTimelineHeader") &&
    chatSrc.includes("useThreadMessageProps") &&
    readFileSync("components/editor/lovable/composer-dock.tsx", "utf8").includes("LovablePromptQueue"),
);
check(
  "lovable: message content + search + model menu",
  chatSrc.includes("LovableChatSearchBar") &&
    composerBottomRowSrc.includes("LovableComposerModelMenu") &&
    messageRowSrc.includes("LovableMessageContent") &&
    readFileSync("components/editor/lovable/message-content.tsx", "utf8").includes("LovableHighlightedText"),
);
check(
  "lovable: message row + thread item",
  chatSrc.includes("LovableThreadItem") &&
    chatSrc.includes("useThreadMessageProps") &&
    messageRowSrc.includes("LovableVerificationCard"),
);
check(
  "lovable: composer overlays wired",
  chatSrc.includes("LovableComposerInputArea") &&
    composerOverlaysSrc.includes("LovableComposerContextFilePicker") &&
    composerOverlaysSrc.includes("LovableComposerSaveSkillModal") &&
    composerOverlaysSrc.includes("LovableComposerAnalyzeModal") &&
    composerOverlaysSrc.includes("LovableComposerTemplatePicker"),
);
check(
  "lovable: runtime errors banner + header queue pill",
  chatSrc.includes("handleFixRuntimeErrors") &&
    chatSrc.includes("formatErrorsForHealing") &&
    composerDockSrc.includes("LovableComposerRuntimeErrorsBanner") &&
    readFileSync("components/editor/lovable/chat-header.tsx", "utf8").includes("LovableChatHeaderQueuePill") &&
    readFileSync("components/editor/lovable/use-chat-keyboard-shortcuts.ts", "utf8").includes("onStopGeneration"),
);
check(
  "lovable: plan approve persists plan.md + preview bridges",
  layoutSrc.includes("saveApprovedPlan") &&
    layoutSrc.includes("handleApprovePlan") &&
    readFileSync("lib/preview/veb-bridge.ts", "utf8").includes("lifemark-comment-pin-mode") &&
    readFileSync("lib/preview/veb-bridge.ts", "utf8").includes("lifemark-capture") &&
    readFileSync("components/editor/lovable/preview-interaction-toolbar.tsx", "utf8").includes("onCaptureAnnotate") &&
    readFileSync("components/editor/preview-annotations.tsx", "utf8").includes("formatAnnotationsForAi") &&
    previewSrc.includes("onSendToChat={onSendPromptToChat}"),
);
check(
  "sandbox: Modal provider (Lovable parity)",
  readFileSync("lib/sandbox/modal.ts", "utf8").includes("ModalSandboxProvider") &&
    readFileSync("lib/sandbox/index.ts", "utf8").includes("modal.isEnabled()"),
);
check(
  "sandbox: warm reconnect API",
  readFileSync("app/api/projects/[id]/sandbox-preview/route.ts", "utf8").includes("export async function GET") &&
    readFileSync("lib/sandbox/index.ts", "utf8").includes("reconnect(sandboxId"),
);
check(
  "preview: soft refresh avoids remount on warm engines",
  previewSrc.includes("sandbox file sync") && previewSrc.includes("webcontainer file sync"),
);
check(
  "lovable: message pagination API",
  readFileSync("app/api/projects/[id]/messages/route.ts", "utf8").includes("hasMore"),
);
check(
  "layout: auto deploy wired",
  layoutSrc.includes("autoDeploy") && layoutSrc.includes("/api/deploy"),
);

check(
  "chat: consumeAIStream uses effectiveMode for applyFileUpdates",
  chatSrc.includes('(["build", "agent", "patch"] as EditorMode[]).includes(effectiveMode)'),
);
check(
  "chat: handleSend does not force mode override",
  /void sendMessage\(text\);/.test(chatSrc) && !/void sendMessage\(text, mode\);/.test(chatSrc),
);
check(
  "chat: agent done dispatches preview refresh",
  chatSrc.includes('lifemark-refresh-preview') && chatSrc.includes("onFilesUpdate(updatedFiles)"),
);
check(
  "fix route: live environment lock",
  fixSrc.includes('environment === "live"') && fixSrc.includes("423"),
);
check(
  "stream hook: per-request applyFileUpdates override",
  streamHookSrc.includes("opts?.applyFileUpdates"),
);
check(
  "chat: heal coordination events",
  chatSrc.includes("lifemark-preview-heal-start") && chatSrc.includes("healActiveRef"),
);
check(
  "agent min credits constant",
  agentSrc.includes("AGENT_MIN_CREDITS") && chatSrc.includes("AGENT_MIN_CREDITS"),
);
check(
  "preview: filters non-rendered files before rebuild",
  previewSrc.includes("previewRelevantFiles") &&
    previewSrc.includes("isPreviewRelevantFile") &&
    previewSrc.includes("supabase|docs|outputs|scripts"),
);
check(
  "preview: calmer debounce while generating",
  previewSrc.includes("isGenerating ? 180 : 120"),
);
check(
  "lovable: streaming build card wired",
  streamingFooterSrc.includes("LovableStreamingMessageShell") &&
    lovableIndexSrc.includes("LovableStreamingBuildCard"),
);
check(
  "lovable: prompt queue extracted",
  composerDockSrc.includes("LovablePromptQueue") &&
    readFileSync("components/editor/lovable/prompt-queue.tsx", "utf8").includes("LovablePromptQueue"),
);
check(
  "layout: mobile files nav",
  layoutSrc.includes('"files"') && layoutSrc.includes('mobilePaneActive === "files"'),
);
check(
  "layout: wider chat column",
  layoutSrc.includes("defaultSize={28}"),
);
check(
  "top bar: preview status listener",
  topBarSrc.includes("lifemark-preview-status") && topBarSrc.includes("previewStatusText"),
);
check(
  "preview: recovery overlay actions",
  previewSrc.includes("showRecoveryOverlay") &&
    previewSrc.includes("Preview paused after a runtime error") &&
    previewSrc.includes("Fix with AI"),
);
check(
  "chat: compact streaming file event",
  readFileSync("components/editor/lovable/streaming-files-card.tsx", "utf8").includes("Editing {paths.length} file") &&
    !chatSrc.includes("Edited {fileName}"),
);
check(
  "chat/fix: structured preview runtime errors",
  chatSrc.includes("previewRuntimeErrors") &&
    fixSrc.includes("normalizeRuntimeErrors") &&
    fixSrc.includes("runtimeErrors"),
);
check(
  "preview: stable hostname label helper",
  readFileSync("lib/preview/preview-url.ts", "utf8").includes("getPreviewBarLabel") &&
    previewSrc.includes("getPreviewBarLabel"),
);
check(
  "preview engine rev present",
  Number.parseInt(PREVIEW_ENGINE_REV, 10) >= 17,
  { rev: PREVIEW_ENGINE_REV },
);

check(
  "lovable: semantic chat search API + UI",
  chatSrc.includes("messages/search") &&
    chatSrc.includes("searchMode") &&
    chatSrc.includes("searchHitIds") &&
    readFileSync("app/api/projects/[id]/messages/search/route.ts", "utf8").includes("rankMessagesByEmbedding") &&
    readFileSync("components/editor/lovable/chat-search-bar.tsx", "utf8").includes("semantic") &&
    readFileSync("lib/editor/search-chat-messages.ts", "utf8").includes("rankMessagesByKeyword"),
);
check(
  "lovable: binary file-gen (pdf/xlsx/pptx)",
  chatSrc.includes("/api/ai/analyze") &&
    readFileSync("components/editor/lovable/composer-file-gen-picker.tsx", "utf8").includes('"pdf"') &&
    composerDockSrc.includes("base64: f.base64"),
);
check(
  "chat: build work_seconds persisted on assistant metadata",
  readFileSync("app/api/ai/chat/route.ts", "utf8").includes("turnStartedAt") &&
    readFileSync("app/api/ai/chat/route.ts", "utf8").includes("work_seconds"),
);
check(
  "preview: network panel bridge + UI",
  readFileSync("lib/preview/veb-bridge.ts", "utf8").includes("lifemark-preview-network") &&
    readFileSync("lib/preview/build-fallback-html.ts", "utf8").includes("lifemark-preview-network") &&
    readFileSync("lib/preview/preview-perf-bridge.ts", "utf8").includes("lifemark-preview-perf") &&
    readFileSync("lib/preview/preview-perf-bridge.ts", "utf8").includes("lifemark-preview-perf-request") &&
    previewSrc.includes("networkLines") &&
    previewSrc.includes("perfSnapshot") &&
    previewSrc.includes("refreshPreviewPerf") &&
    previewSrc.includes("previewBottomTab"),
);
check(
  "preview: cross-origin dblclick inline edit + live tasks dock",
  readFileSync("lib/preview/veb-bridge.ts", "utf8").includes("lifemark-veb-inline") &&
    previewSrc.includes("lifemark-veb-inline") &&
    layoutSrc.includes("LovableLiveTasksDock") &&
    chatSrc.includes("lifemark-live-tasks") &&
    chatSrc.includes("liveTaskSteps") &&
    chatSrc.includes("buildActivitySteps") &&
    readFileSync("components/editor/lovable/live-tasks-dock.tsx", "utf8").includes("Tasks complete"),
);
check(
  "lovable: chat search hit navigation + design empty state",
  chatSrc.includes("activeSearchHitIndex") &&
    chatSrc.includes("navigateSearchHit") &&
    chatSrc.includes("openDesignDirections") &&
    chatSrc.includes("onJumpToPinned") &&
    chatSrc.includes("lifemark-pinned-") &&
    chatSrc.includes("metadata.reactions") &&
    readFileSync("components/editor/lovable/chat-search-bar.tsx", "utf8").includes("onNavigate") &&
    readFileSync("components/editor/lovable/use-chat-keyboard-shortcuts.ts", "utf8").includes("F3") &&
    readFileSync("components/editor/lovable/empty-state.tsx", "utf8").includes("Explore 3 design directions") &&
    readFileSync("components/editor/lovable/message-row.tsx", "utf8").includes("data-message-id") &&
    readFileSync("components/editor/lovable/composer-toolbar.tsx", "utf8").includes("Design directions") &&
    readFileSync("components/editor/lovable/live-tasks-dock.tsx", "utf8").includes("lifemark-open-file-at-line"),
);
check(
  "lovable: virtual scroll + thread session + copy link + header shortcuts",
  chatSrc.includes("timelineRef") &&
    chatSrc.includes("scrollToThreadIndex") &&
    chatSrc.includes("lifemark-collapsed-threads-") &&
    chatSrc.includes("copyMessageLink") &&
    chatSrc.includes("exportMessage") &&
    chatSrc.includes("onCollapseAllThreads") &&
    chatSrc.includes("onExpandAllThreads") &&
    chatSrc.includes('params.get("message")') &&
    readFileSync("components/editor/lovable/chat-timeline.tsx", "utf8").includes("LovableChatTimelineHandle") &&
    readFileSync("components/editor/lovable/chat-header.tsx", "utf8").includes("chatSearchShortcutLabel") &&
    readFileSync("components/editor/lovable/chat-header.tsx", "utf8").includes("chatBookmarksShortcutLabel") &&
    readFileSync("components/editor/lovable/message-actions.tsx", "utf8").includes("onCopyLink") &&
    readFileSync("components/editor/lovable/message-actions.tsx", "utf8").includes("onToggleBookmark") &&
    readFileSync("components/editor/lovable/use-chat-keyboard-shortcuts.ts", "utf8").includes("onBookmarksShortcut") &&
    readFileSync("components/editor/lovable/use-chat-keyboard-shortcuts.ts", "utf8").includes("onScrollToBottom") &&
    readFileSync("components/editor/lovable/scroll-to-bottom.tsx", "utf8").includes("newCount") &&
    readFileSync("components/editor/lovable/message-actions.tsx", "utf8").includes("onUseInComposer") &&
    readFileSync("components/editor/lovable/message-timestamp.tsx", "utf8").includes("onCopyLink") &&
    readFileSync("components/editor/shortcuts-modal.tsx", "utf8").includes('title: "Chat"') &&
    readFileSync("app/api/projects/[id]/messages/[messageId]/route.ts", "utf8").includes(".delete()") &&
    readFileSync("components/editor/lovable/search-empty.tsx", "utf8").includes("LovableSearchEmpty") &&
    readFileSync("components/editor/lovable/load-older-button.tsx", "utf8").includes("Load earlier messages") &&
    readFileSync("components/editor/lovable/chat-search-bar.tsx", "utf8").includes("onClearQuery") &&
    readFileSync("components/editor/lovable/message-actions.tsx", "utf8").includes("onDelete") &&
    readFileSync("components/editor/lovable/use-chat-keyboard-shortcuts.ts", "utf8").includes("onScrollToTop") &&
    readFileSync("components/editor/lovable/thread-divider.tsx", "utf8").includes("searchMatchCount") &&
    readFileSync("components/editor/lovable/preview-snapshot-card.tsx", "utf8").includes("lightboxOpen") &&
    readFileSync("components/editor/lovable/prompt-templates.ts", "utf8").includes("LOVABLE_DESIGN_DIRECTIONS_SLASH_KEY") &&
    readFileSync("components/editor/lovable/chat-search-bar.tsx", "utf8").includes("roleFilter") &&
    readFileSync("components/editor/lovable/chat-search-bar.tsx", "utf8").includes("recentQueries") &&
    readFileSync("components/editor/lovable/message-edit-inline.tsx", "utf8").includes("metaKey") &&
    readFileSync("components/editor/lovable/agent-trace.tsx", "utf8").includes("lifemark-open-file-at-line") &&
    readFileSync("components/editor/lovable/chat-header.tsx", "utf8").includes("messageCount") &&
    chatSrc.includes("searchRoleFilter") &&
    chatSrc.includes("rememberSearchQuery") &&
    chatSrc.includes("stoppedDraft") &&
    chatSrc.includes("continueAfterStop") &&
    chatSrc.includes("compactDensity") &&
    chatSrc.includes("onCopyThread") &&
    readFileSync("components/editor/lovable/collapsible-text.tsx", "utf8").includes("Show more") &&
    readFileSync("components/editor/lovable/continue-banner.tsx", "utf8").includes("Continue") &&
    readFileSync("components/editor/lovable/chat-search-bar.tsx", "utf8").includes("onJumpFirst") &&
    readFileSync("components/editor/lovable/message-timestamp.tsx", "utf8").includes("formatLovableAbsoluteTime") &&
    readFileSync("components/editor/lovable/thread-divider.tsx", "utf8").includes("onCopyThread") &&
    chatSrc.includes("composerDraftKey") &&
    chatSrc.includes("exportChatAsJson") &&
    chatSrc.includes("searchMsgModeFilter") &&
    chatSrc.includes("focusedMessageId") &&
    chatSrc.includes("printChatConversation") &&
    chatSrc.includes("onClearRecent") &&
    readFileSync("components/editor/lovable/draft-restore-banner.tsx", "utf8").includes("Draft restored") &&
    readFileSync("components/editor/lovable/chat-search-bar.tsx", "utf8").includes("onMsgModeFilterChange") &&
    readFileSync("components/editor/lovable/chat-search-bar.tsx", "utf8").includes("onClearRecent") &&
    readFileSync("components/editor/lovable/chat-header.tsx", "utf8").includes("onExportJson") &&
    readFileSync("components/editor/lovable/chat-header.tsx", "utf8").includes("onPrintChat") &&
    readFileSync("components/editor/lovable/message-stats.tsx", "utf8").includes("LovableMessageStats") &&
    readFileSync("components/editor/lovable/message-actions.tsx", "utf8").includes("statsText") &&
    readFileSync("lib/editor/print-chat.ts", "utf8").includes("printChatConversation") &&
    readFileSync("components/editor/lovable/use-chat-keyboard-shortcuts.ts", "utf8").includes("onNavigateMessage") &&
    readFileSync("components/editor/lovable/use-chat-keyboard-shortcuts.ts", "utf8").includes("onFocusComposer") &&
    readFileSync("components/editor/lovable/message-actions.tsx", "utf8").includes("onReadAloud") &&
    readFileSync("components/editor/lovable/chat-day-utils.ts", "utf8").includes("buildLovableChatDayJumps") &&
    readFileSync("components/editor/lovable/chat-header.tsx", "utf8").includes("onJumpToDay") &&
    chatSrc.includes("restore: true") &&
    chatSrc.includes("toggleReadAloud") &&
    chatSrc.includes("undoClearChat") &&
    chatSrc.includes("undoDeleteMessage") &&
    readFileSync("app/api/projects/[id]/messages/route.ts", "utf8").includes("restore === true"),
);
check(
  "lovable: durable edit-past + collab chat APIs + chat-state",
  chatSrc.includes("truncateChatFromMessage") &&
    chatSrc.includes("pendingBranchRef") &&
    chatSrc.includes("project-messages:") &&
    chatSrc.includes("/chat-state") &&
    chatSrc.includes("chatStateReadyRef") &&
    readFileSync("app/api/projects/[id]/messages/route.ts", "utf8").includes("truncate === true") &&
    readFileSync("app/api/projects/[id]/messages/route.ts", "utf8").includes("assertChatAccess") &&
    readFileSync("app/api/projects/[id]/messages/search/route.ts", "utf8").includes("assertChatAccess") &&
    readFileSync("app/api/projects/[id]/messages/[messageId]/route.ts", "utf8").includes("export async function PATCH") &&
    readFileSync("app/api/projects/[id]/chat-state/route.ts", "utf8").includes("prompt_queue") &&
    readFileSync("lib/project/chat-access.ts", "utf8").includes("canWriteChat") &&
    readFileSync("supabase/migrations/091_project_chat_state.sql", "utf8").includes("project_chat_state") &&
    readFileSync("components/editor/lovable/branch-chip.tsx", "utf8").includes("LovableBranchChip") &&
    readFileSync("components/editor/lovable/message-row.tsx", "utf8").includes("LovableBranchChip"),
);
check(
  "preview: visual-edit multi/spacing/image + console/network/perf depth",
  readFileSync("components/editor/visual-edit-overlay.tsx", "utf8").includes("selectedList") &&
    readFileSync("components/editor/visual-edit-overlay.tsx", "utf8").includes("applySpacingToken") &&
    readFileSync("components/editor/visual-edit-overlay.tsx", "utf8").includes("imageSrc") &&
    readFileSync("components/editor/visual-edit-overlay.tsx", "utf8").includes("onRequestAiImage") &&
    readFileSync("lib/editor/apply-visual-edit.ts", "utf8").includes("imageSrc") &&
    readFileSync("lib/editor/apply-visual-edit.ts", "utf8").includes("applySpacingToken") &&
    readFileSync("lib/preview/veb-bridge.ts", "utf8").includes("additive") &&
    readFileSync("lib/preview/veb-bridge.ts", "utf8").includes("console.warn") &&
    readFileSync("lib/preview/veb-bridge.ts", "utf8").includes("console.log") &&
    readFileSync("lib/preview/veb-bridge.ts", "utf8").includes("XMLHttpRequest") &&
    readFileSync("lib/preview/veb-bridge.ts", "utf8").includes("contentType") &&
    readFileSync("lib/preview/preview-perf-bridge.ts", "utf8").includes("largest-contentful-paint") &&
    readFileSync("lib/preview/preview-perf-bridge.ts", "utf8").includes("layout-shift") &&
    previewSrc.includes("contentType") &&
    previewSrc.includes("lcp") &&
    previewSrc.includes('"cls"'),
);
check(
  "lovable: free try-to-fix + VEB multi-select + annotations sync + cross-chat",
  chatSrc.includes("freeFixesRemaining") &&
    chatSrc.includes("Free Try-to-fix applied") &&
    chatSrc.includes("Allow at 0 credits") &&
    chatSrc.includes('kind: "xchat"') &&
    chatSrc.includes("@chat:") &&
    chatSrc.includes("Chat history from @chat:") &&
    previewSrc.includes("vebSelectedList") &&
    previewSrc.includes("d.additive === true") &&
    readFileSync("components/editor/visual-edit-overlay.tsx", "utf8").includes("selections?: SelectedElement[]") &&
    readFileSync("components/editor/preview-annotations.tsx", "utf8").includes("preview_annotations") &&
    readFileSync("app/api/projects/[id]/chat-state/route.ts", "utf8").includes("preview_annotations") &&
    readFileSync("supabase/migrations/092_preview_annotations.sql", "utf8").includes("preview_annotations") &&
    readFileSync("components/editor/lovable/composer-banners.tsx", "utf8").includes("freeRemaining") &&
    readFileSync("components/editor/lovable/composer-mention-autocomplete.tsx", "utf8").includes('kind: "xchat"'),
);
check(
  "lovable: embeddings cache + paste unify + publish dirty seed + mobile sheet + VEB clear",
  readFileSync("supabase/migrations/093_message_embeddings.sql", "utf8").includes("message_embeddings") &&
    readFileSync("lib/editor/message-embeddings.ts", "utf8").includes("getOrCreateMessageEmbeddings") &&
    readFileSync("app/api/projects/[id]/messages/search/route.ts", "utf8").includes("getOrCreateMessageEmbeddings") &&
    readFileSync("lib/ai/persist-chat-turn.ts", "utf8").includes("upsertMessageEmbedding") &&
    chatSrc.includes("detectPastedSecret(text)") &&
    chatSrc.includes("LovableComposerMobileSheet") &&
    chatSrc.includes("isMobile") &&
    readFileSync("components/editor/lovable/composer-mobile-sheet.tsx", "utf8").includes("data-composer-mobile-sheet") &&
    readFileSync("components/editor/editor-layout.tsx", "utf8").includes("Publish dirty-dot") &&
    previewSrc.includes("clearVebSelection") &&
    readFileSync("components/editor/lovable/composer-mention-autocomplete.tsx", "utf8").includes(
      "file, connector, or collaborator",
    ),
);
check(
  "platform: domain buy modal + interface language picker",
  readFileSync("components/editor/domains-panel.tsx", "utf8").includes("DomainBuyModal") &&
    readFileSync("components/editor/domain-buy-modal.tsx", "utf8").includes("/api/domains/search") &&
    readFileSync("lib/platform-locale.ts", "utf8").includes("PLATFORM_LOCALES") &&
    readFileSync("components/dashboard/settings-page.tsx", "utf8").includes("platform-locale") &&
    readFileSync("hooks/use-platform-locale.ts", "utf8").includes("lifemark-platform-locale"),
);
check(
  "enterprise: workspace SSO/SCIM API + domain Stripe checkout",
  readFileSync("app/api/workspace/identity/route.ts", "utf8").includes("workspace_identity_settings") &&
    readFileSync("app/api/scim/v2/Users/route.ts", "utf8").includes("workspace_scim_users") &&
    readFileSync("app/api/domains/checkout/route.ts", "utf8").includes("domain_purchase") &&
    readFileSync("app/api/billing/webhook/route.ts", "utf8").includes("completeDomainPurchase") &&
    readFileSync("hooks/use-workspace-identity.ts", "utf8").includes("/api/workspace/identity"),
);

// ── Preview engine matrix ───────────────────────────────────────────────────

check(
  "vite project → webcontainer when isolated",
  resolvePreviewEngine(
    [{ path: "package.json", content: '{"devDependencies":{"vite":"5"}}' }, { path: "vite.config.ts", content: "" }],
    { preferWebContainers: true, crossOriginIsolated: true },
  ) === "webcontainer",
);
check(
  "vite project → fallback when not isolated",
  resolvePreviewEngine(
    [{ path: "package.json", content: '{"devDependencies":{"vite":"5"}}' }],
    { preferWebContainers: true, crossOriginIsolated: false },
  ) === "fallback",
);

// ── Error healing prompt ──────────────────────────────────────────────────────

const healing = buildHealingPrompt([
  { kind: "bundler", message: "SyntaxError: unexpected token", timestamp: Date.now() },
]);
check("healing prompt includes error log", healing.includes("SyntaxError") && healing.includes("file_update"));
check(
  "formatErrorsForHealing is non-empty",
  formatErrorsForHealing([{ kind: "runtime", message: "boom", timestamp: 1 }]).length > 0,
);

check(
  "shouldFocusPreviewAfterGeneration(build)",
  shouldFocusPreviewAfterGeneration("build", 3) === true,
);

// ── Optional live smoke ───────────────────────────────────────────────────────

async function main() {
  try {
    const health = await fetch(`${BASE}/`, { signal: AbortSignal.timeout(5000) });
    if (!health.ok) {
      check("live: dev server reachable", false, { status: health.status });
    } else {
      check("live: dev server reachable", true, { url: BASE });

      let env: Record<string, string> = {};
      try {
        env = Object.fromEntries(
          readFileSync(".env.local", "utf8")
            .split("\n")
            .filter((l) => l && !l.startsWith("#") && l.includes("="))
            .map((l) => {
              const i = l.indexOf("=");
              return [l.slice(0, i), l.slice(i + 1)];
            }),
        );
        const { createClient } = await import("@supabase/supabase-js");
        const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
        const { data: auth, error } = await sb.auth.signInWithPassword({
          email: env.DEMO_EMAIL ?? "demo@lifemark.ai",
          password: env.DEMO_PASSWORD ?? "demo123456",
        });
        if (error || !auth.session) {
          check("live: demo auth", false, error?.message);
        } else {
          const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(".")[0];
          const cookie = `sb-${ref}-auth-token=${encodeURIComponent(JSON.stringify({
            access_token: auth.session.access_token,
            refresh_token: auth.session.refresh_token,
            expires_at: auth.session.expires_at,
            expires_in: auth.session.expires_in,
            token_type: "bearer",
            user: auth.session.user,
          }))}`;
          const { data: projects } = await sb.from("projects").select("id").limit(1);
          const projectId = projects?.[0]?.id;
          if (!projectId) {
            check("live: project exists", false);
          } else {
            const chatRes = await fetch(`${BASE}/api/ai/chat`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Cookie: cookie },
              body: JSON.stringify({
                projectId,
                message: "What files are in this project? One sentence only.",
                mode: "chat",
                files: [],
                history: [],
              }),
            });
            check("live: chat SSE 200", chatRes.ok, { status: chatRes.status });
          }
        }
      } catch (e) {
        check("live: auth smoke", false, String(e));
      }
    }
  } catch (e) {
    check("live: dev server reachable (optional)", true, { skipped: true, reason: String(e), url: BASE });
  }

  const failed = checks.filter((c) => !c.ok).length;
  const passed = checks.length - failed;
  console.log(JSON.stringify({ summary: { passed, failed, total: checks.length, ok: failed === 0 } }));
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
