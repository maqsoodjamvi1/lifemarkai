type File = { path: string; content: string };

export function validPreviewPath(path: string): boolean {
  return !!path && !/[\x00-\x1f\\]/.test(path) && !path.startsWith("/") &&
    !/^[a-z]:/i.test(path) && !path.split("/").some((p) => p === ".." || p === "." || !p) &&
    !path.split("/").some((p) => p === "node_modules" || p === ".git") &&
    path !== ".lm-sync-manifest.json";
}

/** Overlay unsaved client edits before dependency analysis and scaffold repair. */
export function mergePreviewSnapshot(stored: File[], incoming: File[], complete: boolean, deleted: string[]): File[] {
  for (const path of [...incoming.map((f) => f.path), ...deleted]) {
    if (!validPreviewPath(path)) throw new Error(`Invalid preview file path: ${path}`);
  }
  const files = new Map((complete ? [] : stored).map((f) => [f.path, f]));
  for (const path of deleted) files.delete(path);
  for (const file of incoming) files.set(file.path, file);
  return [...files.values()];
}

/** Runs in the isolated Linux sandbox. Refuse symlink escapes before unlinking. */
export function previewDeleteCommand(paths: string[]): string {
  const code = previewDeleteScript(paths);
  return `node -e '${code.replace(/'/g, "'\\''")}'`;
}

export function previewDeleteScript(paths: string[]): string {
  if (paths.some((path) => !validPreviewPath(path))) throw new Error("Invalid preview deletion path");
  const code = `const fs=require('fs'),p=require('path');const root=fs.realpathSync(process.cwd());for(const name of ${JSON.stringify(paths)}){const target=p.resolve(root,name);let parent;try{parent=fs.realpathSync(p.dirname(target));}catch(e){if(e.code==='ENOENT')continue;throw e;}if(parent!==root&&!parent.startsWith(root+p.sep))throw Error('Preview deletion escaped project');try{const stat=fs.lstatSync(target);if(stat.isDirectory())throw Error('Refusing directory deletion');fs.unlinkSync(target);}catch(e){if(e.code!=='ENOENT')throw e;}}`;
  return code;
}
