/** Cross-panel chat settings (Lovable: utilities live in `#main-menu`, not an in-chat header). */

export const LIFEMARK_CHAT_SETTINGS_EVENT = "lifemark-chat-settings";

export type LifemarkChatSettingsAction =
  | "search"
  | "bookmarks"
  | "export-markdown"
  | "export-json"
  | "print"
  | "copy-all"
  | "clear"
  | "toggle-code-blocks"
  | "collapse-threads"
  | "expand-threads"
  | "toggle-density";

export function dispatchChatSettings(action: LifemarkChatSettingsAction): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(LIFEMARK_CHAT_SETTINGS_EVENT, { detail: { action } }),
  );
}

export function isChatSettingsEvent(
  e: Event,
): e is CustomEvent<{ action: LifemarkChatSettingsAction }> {
  return e.type === LIFEMARK_CHAT_SETTINGS_EVENT;
}
