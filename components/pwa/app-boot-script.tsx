import Script from "next/script";
import { LM_BOOT_INLINE } from "@/lib/lm-boot-inline";

/**
 * Inline beforeInteractive boot — Next injects this ahead of webpack/app chunks
 * so ChunkLoadError recovery is registered before layout.js can time out.
 */
export function AppBootScript() {
  return (
    <Script
      id="lm-boot"
      strategy="beforeInteractive"
      dangerouslySetInnerHTML={{ __html: LM_BOOT_INLINE }}
    />
  );
}
