export interface EditorSettings {
  fontSize: number;       // 10-24
  tabSize: number;        // 2 | 4
  lineHeight: number;     // 1.4-2.0
  wordWrap: boolean;
  minimap: boolean;
  lineNumbers: boolean;
  fontLigatures: boolean;
  formatOnSave: boolean;
  stickyScroll: boolean;
}

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  fontSize: 13,
  tabSize: 2,
  lineHeight: 1.7,
  wordWrap: true,
  minimap: false,
  lineNumbers: true,
  fontLigatures: true,
  formatOnSave: true,
  stickyScroll: true,
};

export const EDITOR_SETTINGS_KEY = "lifemark-editor-settings";

export function loadEditorSettings(): EditorSettings {
  if (typeof window === "undefined") return DEFAULT_EDITOR_SETTINGS;
  try {
    const raw = localStorage.getItem(EDITOR_SETTINGS_KEY);
    if (!raw) return DEFAULT_EDITOR_SETTINGS;
    return { ...DEFAULT_EDITOR_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_EDITOR_SETTINGS;
  }
}

export function saveEditorSettings(s: EditorSettings): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(EDITOR_SETTINGS_KEY, JSON.stringify(s));
}
