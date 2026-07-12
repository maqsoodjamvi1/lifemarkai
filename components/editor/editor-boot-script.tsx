"use client";

import { useEffect } from "react";
import { installEditorChunkRecovery } from "@/lib/sw-cleanup";

/**
 * Fallback chunk recovery for client-side navigations to /editor.
 * Full page loads use lm-boot.js via AppBootScript in root layout.
 */
export function EditorBootScript() {
  useEffect(() => {
    if (document.getElementById("lm-boot")) return;
    installEditorChunkRecovery();
  }, []);

  return null;
}
