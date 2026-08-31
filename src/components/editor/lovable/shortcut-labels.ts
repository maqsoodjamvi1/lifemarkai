/** Platform-aware modifier key label for menu shortcut hints. */
export function modKeyLabel(): string {
  if (typeof navigator === "undefined") return "⌘";
  return /Mac|iPhone|iPad/i.test(navigator.userAgent) ? "⌘" : "Ctrl";
}

export function chatSearchShortcutLabel(): string {
  return `${modKeyLabel()}F`;
}

export function chatClearShortcutLabel(): string {
  return `${modKeyLabel()}⇧K`;
}

export function chatBookmarksShortcutLabel(): string {
  return `Alt+B`;
}

export function chatVoiceShortcutLabel(): string {
  return `Alt+V`;
}
