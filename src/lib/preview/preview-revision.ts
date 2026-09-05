export const PREVIEW_REVISION_PATH = "__lifemark_preview_revision.js";

export function attachPreviewRevision<T extends { path: string; content: string }>(files: T[], revision: string) {
  const vite = files.some((f) => /(^|\/)vite\.config\./.test(f.path));
  const marker = 'data-lifemark-revision="true"';
  const tag = `<script type="module" ${marker} src="/${PREVIEW_REVISION_PATH}"></script>`;
  const next = files.map((file) => {
    if (file.content.includes(marker)) return file;
    if (file.path === "index.html") return { ...file, content: file.content.replace(/<\/body>/i, () => `${tag}</body>`) };
    if (/(?:^|\/)(?:layout|__root)\.[jt]sx$/.test(file.path) && /<\/body>/i.test(file.content)) {
      const jsx = `<script type="module" ${marker} src="/${PREVIEW_REVISION_PATH}" />`;
      return { ...file, content: file.content.replace(/<\/body>/i, () => `${jsx}</body>`) };
    }
    return file;
  });
  const path = vite ? PREVIEW_REVISION_PATH : `public/${PREVIEW_REVISION_PATH}`;
  return {
    files: [...next.filter((f) => f.path !== path), { path, content: previewRevisionModule(revision) }],
    requiresReload: !vite,
  };
}

/** Self-accepting Vite module; afterUpdate fires after the entire update batch. */
export function previewRevisionModule(revision: string): string {
  return `window.dispatchEvent(new CustomEvent('lifemark-preview-revision', { detail: ${JSON.stringify(revision)} }));
if (import.meta.hot) {
  import.meta.hot.accept();
  const before = (payload) => window.dispatchEvent(new CustomEvent('lifemark-preview-update-start', { detail: { application: payload.updates.some((update) => !update.path.includes('__lifemark_preview_revision.js')) } }));
  const after = () => window.dispatchEvent(new Event('lifemark-preview-update-end'));
  const error = () => window.dispatchEvent(new Event('lifemark-preview-update-error'));
  import.meta.hot.on('vite:beforeUpdate', before);
  import.meta.hot.on('vite:afterUpdate', after);
  import.meta.hot.on('vite:error', error);
  import.meta.hot.dispose(() => {
    import.meta.hot.off('vite:beforeUpdate', before);
    import.meta.hot.off('vite:afterUpdate', after);
    import.meta.hot.off('vite:error', error);
  });
}
`;
}

export function isPreviewFrameMessage(
  event: Pick<MessageEvent, "source" | "origin">,
  frame: Window | null,
  url: string | null,
): boolean {
  if (!frame || event.source !== frame || !url) return false;
  try { return event.origin === new URL(url).origin; } catch { return false; }
}
