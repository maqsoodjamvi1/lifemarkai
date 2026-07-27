import type * as Monaco from "monaco-editor";

export interface EditorTheme {
  id: string;
  label: string;
  swatch: string; // CSS colour for the picker dot
  data: Monaco.editor.IStandaloneThemeData;
}

// ── Dracula ───────────────────────────────────────────────────────────────────
const dracula: Monaco.editor.IStandaloneThemeData = {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "comment", foreground: "6272a4", fontStyle: "italic" },
    { token: "keyword", foreground: "ff79c6" },
    { token: "string", foreground: "f1fa8c" },
    { token: "number", foreground: "bd93f9" },
    { token: "type", foreground: "8be9fd", fontStyle: "italic" },
    { token: "function", foreground: "50fa7b" },
    { token: "variable", foreground: "f8f8f2" },
    { token: "constant", foreground: "bd93f9" },
    { token: "class", foreground: "8be9fd" },
    { token: "interface", foreground: "8be9fd" },
    { token: "operator", foreground: "ff79c6" },
    { token: "tag", foreground: "ff79c6" },
    { token: "attribute.name", foreground: "50fa7b" },
    { token: "attribute.value", foreground: "f1fa8c" },
    { token: "regexp", foreground: "f1fa8c" },
  ],
  colors: {
    "editor.background": "#282a36",
    "editor.foreground": "#f8f8f2",
    "editor.lineHighlightBackground": "#44475a",
    "editor.selectionBackground": "#44475a",
    "editorCursor.foreground": "#f8f8f2",
    "editorLineNumber.foreground": "#6272a4",
    "editorLineNumber.activeForeground": "#f8f8f2",
    "editorIndentGuide.background": "#44475a",
    "editorBracketMatch.background": "#44475a",
    "editorBracketMatch.border": "#ff79c6",
  },
};

// ── One Dark Pro ──────────────────────────────────────────────────────────────
const oneDarkPro: Monaco.editor.IStandaloneThemeData = {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "comment", foreground: "5c6370", fontStyle: "italic" },
    { token: "keyword", foreground: "c678dd" },
    { token: "string", foreground: "98c379" },
    { token: "number", foreground: "d19a66" },
    { token: "type", foreground: "e5c07b" },
    { token: "function", foreground: "61afef" },
    { token: "variable", foreground: "e06c75" },
    { token: "constant", foreground: "d19a66" },
    { token: "class", foreground: "e5c07b" },
    { token: "interface", foreground: "e5c07b" },
    { token: "operator", foreground: "56b6c2" },
    { token: "tag", foreground: "e06c75" },
    { token: "attribute.name", foreground: "d19a66" },
    { token: "attribute.value", foreground: "98c379" },
  ],
  colors: {
    "editor.background": "#282c34",
    "editor.foreground": "#abb2bf",
    "editor.lineHighlightBackground": "#2c313c",
    "editor.selectionBackground": "#3e4451",
    "editorCursor.foreground": "#528bff",
    "editorLineNumber.foreground": "#4b5263",
    "editorLineNumber.activeForeground": "#abb2bf",
    "editorIndentGuide.background": "#3b4048",
    "editorBracketMatch.background": "#3e4451",
    "editorBracketMatch.border": "#528bff",
  },
};

// ── Tokyo Night ───────────────────────────────────────────────────────────────
const tokyoNight: Monaco.editor.IStandaloneThemeData = {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "comment", foreground: "565f89", fontStyle: "italic" },
    { token: "keyword", foreground: "bb9af7" },
    { token: "string", foreground: "9ece6a" },
    { token: "number", foreground: "ff9e64" },
    { token: "type", foreground: "2ac3de" },
    { token: "function", foreground: "7aa2f7" },
    { token: "variable", foreground: "c0caf5" },
    { token: "constant", foreground: "ff9e64" },
    { token: "class", foreground: "2ac3de" },
    { token: "interface", foreground: "2ac3de" },
    { token: "operator", foreground: "89ddff" },
    { token: "tag", foreground: "f7768e" },
    { token: "attribute.name", foreground: "bb9af7" },
    { token: "attribute.value", foreground: "9ece6a" },
  ],
  colors: {
    "editor.background": "#1a1b2e",
    "editor.foreground": "#c0caf5",
    "editor.lineHighlightBackground": "#1f2335",
    "editor.selectionBackground": "#283457",
    "editorCursor.foreground": "#c0caf5",
    "editorLineNumber.foreground": "#3b4261",
    "editorLineNumber.activeForeground": "#737aa2",
    "editorIndentGuide.background": "#1f2335",
    "editorBracketMatch.background": "#283457",
    "editorBracketMatch.border": "#bb9af7",
  },
};

// ── Monokai ───────────────────────────────────────────────────────────────────
const monokai: Monaco.editor.IStandaloneThemeData = {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "comment", foreground: "75715e", fontStyle: "italic" },
    { token: "keyword", foreground: "f92672" },
    { token: "string", foreground: "e6db74" },
    { token: "number", foreground: "ae81ff" },
    { token: "type", foreground: "66d9e8" },
    { token: "function", foreground: "a6e22e" },
    { token: "variable", foreground: "f8f8f2" },
    { token: "constant", foreground: "ae81ff" },
    { token: "class", foreground: "a6e22e" },
    { token: "interface", foreground: "66d9e8" },
    { token: "operator", foreground: "f92672" },
    { token: "tag", foreground: "f92672" },
    { token: "attribute.name", foreground: "a6e22e" },
    { token: "attribute.value", foreground: "e6db74" },
  ],
  colors: {
    "editor.background": "#272822",
    "editor.foreground": "#f8f8f2",
    "editor.lineHighlightBackground": "#3e3d32",
    "editor.selectionBackground": "#49483e",
    "editorCursor.foreground": "#f8f8f0",
    "editorLineNumber.foreground": "#75715e",
    "editorLineNumber.activeForeground": "#f8f8f2",
    "editorIndentGuide.background": "#3b3a32",
    "editorBracketMatch.background": "#49483e",
    "editorBracketMatch.border": "#a6e22e",
  },
};

// ── Catppuccin Mocha ──────────────────────────────────────────────────────────
const catppuccinMocha: Monaco.editor.IStandaloneThemeData = {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "comment", foreground: "585b70", fontStyle: "italic" },
    { token: "keyword", foreground: "cba6f7" },
    { token: "string", foreground: "a6e3a1" },
    { token: "number", foreground: "fab387" },
    { token: "type", foreground: "89dceb" },
    { token: "function", foreground: "89b4fa" },
    { token: "variable", foreground: "cdd6f4" },
    { token: "constant", foreground: "fab387" },
    { token: "class", foreground: "f38ba8" },
    { token: "interface", foreground: "89dceb" },
    { token: "operator", foreground: "89dceb" },
    { token: "tag", foreground: "f38ba8" },
    { token: "attribute.name", foreground: "cba6f7" },
    { token: "attribute.value", foreground: "a6e3a1" },
  ],
  colors: {
    "editor.background": "#1e1e2e",
    "editor.foreground": "#cdd6f4",
    "editor.lineHighlightBackground": "#313244",
    "editor.selectionBackground": "#45475a",
    "editorCursor.foreground": "#f5e0dc",
    "editorLineNumber.foreground": "#45475a",
    "editorLineNumber.activeForeground": "#cdd6f4",
    "editorIndentGuide.background": "#313244",
    "editorBracketMatch.background": "#45475a",
    "editorBracketMatch.border": "#cba6f7",
  },
};

// ── Theme registry ────────────────────────────────────────────────────────────

export const EDITOR_THEMES: EditorTheme[] = [
  {
    id: "vs-dark",
    label: "VS Dark",
    swatch: "#1e1e1e",
    data: { base: "vs-dark", inherit: true, rules: [], colors: {} },
  },
  { id: "dracula",         label: "Dracula",          swatch: "#282a36", data: dracula },
  { id: "one-dark-pro",   label: "One Dark Pro",      swatch: "#282c34", data: oneDarkPro },
  { id: "tokyo-night",    label: "Tokyo Night",       swatch: "#1a1b2e", data: tokyoNight },
  { id: "monokai",        label: "Monokai",           swatch: "#272822", data: monokai },
  { id: "catppuccin-mocha", label: "Catppuccin Mocha", swatch: "#1e1e2e", data: catppuccinMocha },
];

export const DEFAULT_THEME_ID = "catppuccin-mocha";
export const THEME_STORAGE_KEY = "lifemark-editor-theme";
