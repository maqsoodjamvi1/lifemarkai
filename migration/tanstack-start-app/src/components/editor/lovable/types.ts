/** File diff persisted on assistant messages for change cards. */
export interface LovableFileDiffEntry {
  path: string;
  fileId?: string;
  oldContent: string;
  newContent: string;
}

export const LOVABLE_QUICK_EMOJI = ["👍", "❤️", "🚀", "😂", "😮", "👎"] as const;

export function computeLovableChangeCardMeta(diffs: LovableFileDiffEntry[]): { title: string; statStr: string } {
  const added = diffs.filter((d) => !d.oldContent.trim()).length;
  const modified = diffs.length - added;
  let linesAdded = 0;
  let linesRemoved = 0;
  for (const d of diffs) {
    const oldLines = d.oldContent ? d.oldContent.split("\n").length : 0;
    const newLines = d.newContent ? d.newContent.split("\n").length : 0;
    if (newLines > oldLines) linesAdded += newLines - oldLines;
    else linesRemoved += oldLines - newLines;
  }
  const parts: string[] = [];
  if (added > 0) parts.push(`${added} new`);
  if (modified > 0) parts.push(`${modified} updated`);
  const title =
    diffs.length === 1
      ? added
        ? `Created ${diffs[0].path.split("/").pop()}`
        : `Updated ${diffs[0].path.split("/").pop()}`
      : `${parts.join(", ")} file${diffs.length !== 1 ? "s" : ""}`;
  const statParts: string[] = [];
  if (linesAdded > 0) statParts.push(`+${linesAdded}`);
  if (linesRemoved > 0) statParts.push(`-${linesRemoved}`);
  return { title, statStr: statParts.join(" ") };
}
