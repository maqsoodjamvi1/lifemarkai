import { attachPreviewRevision, PREVIEW_REVISION_PATH } from "./preview-revision.ts";
import { injectVebBridgeIntoHtml, injectVebBridgeIntoJsxDocument } from "./veb-bridge.ts";

/** Background saves must not remove the bridge installed by editor sync. */
export function preservePreviewDocuments(files: Array<{ path: string; content: string }>) {
  const documents = files.map((file) => {
    if (file.path === "index.html") return { ...file, content: injectVebBridgeIntoHtml(file.content) };
    if (/(?:^|\/)(?:layout|__root)\.[jt]sx$/.test(file.path) && /<\/body>/i.test(file.content)) {
      return { ...file, content: injectVebBridgeIntoJsxDocument(file.content) };
    }
    return file;
  });
  // Preserve the document tag but leave revision ownership to the serialized
  // editor sync. A background save must never invent a competing revision.
  return attachPreviewRevision(documents, "unused").files.filter((file) =>
    file.path !== PREVIEW_REVISION_PATH && file.path !== `public/${PREVIEW_REVISION_PATH}`,
  );
}
