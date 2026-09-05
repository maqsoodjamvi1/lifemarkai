type File = { path: string; content: string };
export type PreviewSyncOptions = { complete?: boolean; deletedPaths?: string[]; baseRevision?: string };
export type PreviewSyncResult = { ok: boolean; installing?: boolean; error?: string; recovered?: boolean; revision?: string; requiresReload?: boolean; fullSyncRequired?: boolean };
type Result = PreviewSyncResult;

/** Serialize writes and collapse queued snapshots to the newest editor state. */
export function createPreviewFileSync(send: (files: File[], options?: PreviewSyncOptions) => Promise<Result>) {
  let sequence = 0;
  let tail: Promise<unknown> = Promise.resolve();
  let previous: Map<string, string> | undefined;
  let lastResult: Result = { ok: true };
  return (files: File[]): Promise<Result> => {
    const revision = ++sequence;
    // Retain full snapshots: server scaffolding requires framework context.
    const snapshot = files.map((file) => ({ ...file }));
    const run = tail.then(async (): Promise<Result> => {
      if (revision !== sequence) return { ok: true };
      if (previous?.size === snapshot.length &&
          snapshot.every((file) => previous!.get(file.path) === file.content)) {
        return lastResult;
      }
      const current = new Map(snapshot.map((file) => [file.path, file.content]));
      const changed = previous ? snapshot.filter((file) => previous!.get(file.path) !== file.content) : snapshot;
      const deletedPaths = previous ? [...previous.keys()].filter((path) => !current.has(path)) : [];
      let result = await send(changed, { complete: !previous, deletedPaths, baseRevision: lastResult.revision });
      if (result.fullSyncRequired) result = await send(snapshot, { complete: true, deletedPaths });
      if (result.ok) { previous = current; lastResult = result; }
      else previous = undefined;
      return result;
    });
    tail = run.catch(() => { previous = undefined; });
    return run;
  };
}
