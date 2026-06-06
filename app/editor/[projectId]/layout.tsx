import Script from "next/script";
import { EDITOR_BOOT_SCRIPT } from "@/lib/sw-cleanup";

export default function EditorProjectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Script id="editor-chunk-recovery" strategy="beforeInteractive">
        {EDITOR_BOOT_SCRIPT}
      </Script>
      {children}
    </>
  );
}
