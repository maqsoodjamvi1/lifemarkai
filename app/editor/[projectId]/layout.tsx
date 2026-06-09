import { EditorBootScript } from "@/components/editor/editor-boot-script";

export default function EditorProjectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <EditorBootScript />
      {children}
    </>
  );
}
