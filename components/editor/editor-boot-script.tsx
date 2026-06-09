"use client";

import { useEffect } from "react";
import { useServerInsertedHTML } from "next/navigation";
import { EDITOR_BOOT_SCRIPT, installEditorChunkRecovery } from "@/lib/sw-cleanup";

/**
 * Injects editor boot script into SSR HTML outside the React tree.
 * React 19 warns when <script> is rendered inside components (next/script included).
 */
export function EditorBootScript() {
  useServerInsertedHTML(() => (
    <script
      id="editor-chunk-recovery"
      dangerouslySetInnerHTML={{ __html: EDITOR_BOOT_SCRIPT }}
    />
  ));

  // Client navigations to /editor do not re-run useServerInsertedHTML.
  useEffect(() => {
    if (document.getElementById("editor-chunk-recovery")) return;
    installEditorChunkRecovery();
  }, []);

  return null;
}
