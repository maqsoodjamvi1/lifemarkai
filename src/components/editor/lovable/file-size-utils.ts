/** Human-readable size for generated file download cards. */
export function formatLovableFileSize(content: string, base64?: boolean): string {
  const bytes = base64
    ? Math.floor((content.length * 3) / 4)
    : new TextEncoder().encode(content).length;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Download a generated standalone file via a blob URL + download attribute. */
export function downloadLovableGeneratedFile(f: {
  filename: string;
  content: string;
  mimeType: string;
  base64?: boolean;
}) {
  const blob = f.base64
    ? (() => {
        const bin = atob(f.content);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)!;
        return new Blob([arr], { type: f.mimeType });
      })()
    : new Blob([f.content], { type: f.mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = f.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
