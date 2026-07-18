"use client";

import type { Message } from "@/types/database";
import { LovableBookmarksEmpty } from "./bookmarks-empty";
import { LovableChatEmptyState } from "./empty-state";
import { LovableChatLoadingSkeleton } from "./chat-loading-skeleton";
import { LovableLoadingOlderBanner } from "./loading-older-banner";
import { LovablePinnedMessageBanner } from "./pinned-message-banner";

interface LovableChatTimelineHeaderProps {
  loadingOlderMessages: boolean;
  isMessagesLoading: boolean;
  messagesLength: number;
  streaming: boolean;
  contextualEmptyPrompts: string[];
  onSelectEmptyPrompt: (prompt: string) => void;
  pinnedMsgId: string | null;
  visibleMessages: Message[];
  onUnpin: () => void;
  showBookmarks: boolean;
  bookmarkCount: number;
}

/** Loading, empty, pinned, and bookmarks chrome above the virtualized thread list. */
export function LovableChatTimelineHeader({
  loadingOlderMessages,
  isMessagesLoading,
  messagesLength,
  streaming,
  contextualEmptyPrompts,
  onSelectEmptyPrompt,
  pinnedMsgId,
  visibleMessages,
  onUnpin,
  showBookmarks,
  bookmarkCount,
}: LovableChatTimelineHeaderProps) {
  const pinned = pinnedMsgId ? visibleMessages.find((m) => m.id === pinnedMsgId) : null;
  const pinnedPreview = pinned
    ? pinned.content.replace(/\s+/g, " ").slice(0, 90) + (pinned.content.length > 90 ? "…" : "")
    : null;

  return (
    <>
      {loadingOlderMessages && <LovableLoadingOlderBanner />}
      {isMessagesLoading && <LovableChatLoadingSkeleton />}

      {!isMessagesLoading && messagesLength === 0 && !streaming && (
        <LovableChatEmptyState prompts={contextualEmptyPrompts} onSelectPrompt={onSelectEmptyPrompt} />
      )}

      {pinnedPreview && (
        <LovablePinnedMessageBanner preview={pinnedPreview} onUnpin={onUnpin} />
      )}

      {showBookmarks && bookmarkCount === 0 && <LovableBookmarksEmpty />}
    </>
  );
}
