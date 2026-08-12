/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_APP_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// NOTE: the editor is now internal (src/components/editor) and fully typed —
// the former "@lifemark/editor/editor-layout" ambient module is no longer needed.
