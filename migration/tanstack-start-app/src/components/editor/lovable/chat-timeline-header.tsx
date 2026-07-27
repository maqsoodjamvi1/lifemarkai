
import type { Message } from "@/types/database";
import { LovableBookmarksEmpty } from "./bookmarks-empty";
import { LovableChatEmptyState } from "./empty-state";
import { LovableChatLoadingSkeleton } from "./chat-loading-skeleton";
import { LovableLoadOlderButton } from "./load-older-button";
import { LovableLoadingOlderBanner } from "./loading-older-banner";
import { LovablePinnedMessageBanner } from "./pinned-message-banner";
import { LovableSearchEmpty } from "./search-empty";
import type { ChatSearchMode } from "@/lib/editor/search-chat-messages";

interface LovableChatTimelineHeaderProps {
  loadingOlderMessages: boolean;
  isMessagesLoading: boolean;
  messagesLength: number;
  streaming: boolean;
  contextualEmptyPrompts: string[];
  onSelectEmptyPrompt: (prompt: string) => void;
  onExploreDesignDirections?: () => void;
  pinnedMsgId: string | null;
  visibleMessages: Message[];
  onUnpin: () => void;
  onJumpToPinned?: () => void;
  showBookmarks: boolean;
  bookmarkCount: number;
  hasMoreMessages?: boolean;
  onLoadOlder?: () => void;
  showSearch?: boolean;
  searchQuery?: string;
  searchMode?: ChatSearchMode;
  searchLoading?: boolean;
  searchMatchCount?: number;
}

/** Loading, empty, pinned, and bookmarks chrome above the virtualized thread list. */
export function LovableChatTimelineHeader({
  loadingOlderMessages,
  isMessagesLoading,
  messagesLength,
  streaming,
  contextualEmptyPrompts,
  onSelectEmptyPrompt,
  onExploreDesignDirections,
  pinnedMsgId,
  visibleMessages,
  onUnpin,
  onJumpToPinned,
  showBookmarks,
  bookmarkCount,
  hasMoreMessages,
  onLoadOlder,
  showSearch,
  searchQuery,
  searchMode,
  searchLoading,
  searchMatchCount = 0,
}: LovableChatTimelineHeaderProps) {
  const pinned = pinnedMsgId ? visibleMessages.find((m) => m.id === pinnedMsgId) : null;
  const pinnedPreview = pinned
    ? pinned.content.replace(/\s+/g, " ").slice(0, 90) + (pinned.content.length > 90 ? "…" : "")
    : null;

  const showSearchEmpty =
    showSearch &&
    !!searchQuery?.trim() &&
    !searchLoading &&
    searchMatchCount === 0 &&
    messagesLength > 0;

  return (
    <>
      {hasMoreMessages && onLoadOlder && !loadingOlderMessages && (
        <LovableLoadOlderButton loading={loadingOlderMessages} onClick={onLoadOlder} />
      )}
      {loadingOlderMessages && <LovableLoadingOlderBanner />}
      {isMessagesLoading && <LovableChatLoadingSkeleton />}

      {!isMessagesLoading && messagesLength === 0 && !streaming && !showSearchEmpty && (
        <LovableChatEmptyState
          prompts={contextualEmptyPrompts}
          onSelectPrompt={onSelectEmptyPrompt}
          onExploreDesignDirections={onExploreDesignDirections}
        />
      )}

      {showSearchEmpty && (
        <LovableSearchEmpty query={searchQuery!.trim()} mode={searchMode} />
      )}

      {pinnedPreview && (
        <LovablePinnedMessageBanner
          preview={pinnedPreview}
          onUnpin={onUnpin}
          onJumpTo={onJumpToPinned}
        />
      )}

      {showBookmarks && bookmarkCount === 0 && !showSearchEmpty && <LovableBookmarksEmpty />}
    </>
  );
}
