/**
 * Deciding which files to delete from a reused sandbox.
 *
 * Its own module, with no imports, for two reasons. It is the only part of the
 * warm-container path that DELETES, so a mistake here is not a slow preview —
 * it is a project losing files, and that decision deserves direct tests. And
 * the repo's tests run under `node --test`, which cannot load docker.ts at all
 * (its relative imports carry no file extension), so anything living there is
 * effectively untestable.
 */

/** Content-hash manifest for incremental writeFiles — lives in the app dir. */
export const SYNC_MANIFEST = ".lm-sync-manifest.json";

/**
 * Which previously-uploaded paths are no longer part of the project?
 *
 * `previous` comes from the container's own sync manifest, so it lists only
 * paths we put there. `current` MUST be the project's COMPLETE file set —
 * given a partial one this reads every unsent file as deleted.
 */
export function filesToPrune(previous: string[], current: string[]): string[] {
  const norm = (p: string) => p.replace(/\\/g, "/").replace(/^\/+/, "");
  const keep = new Set(current.map(norm));
  return previous
    .filter((raw) => {
      // Tested on the RAW path, before normalisation. Normalising strips the
      // leading slash, which would quietly turn "/etc/passwd" into the
      // perfectly prunable-looking "etc/passwd". Harmless in practice, since
      // the rm runs inside the project directory — but an absolute path is not
      // something we ever wrote, so it has no business reaching the rm at all.
      const s = String(raw ?? "").replace(/\\/g, "/");
      return !s.startsWith("/") && !/^[a-zA-Z]:/.test(s);
    })
    .map(norm)
    .filter(
      (p) =>
        Boolean(p) &&
        !keep.has(p) &&
        p !== SYNC_MANIFEST &&
        // Even though these paths are ours, refuse anything that could climb
        // out of the project directory or reach an installed tree. The manifest
        // is a file inside an untrusted container and this feeds an `rm`.
        !p.startsWith("../") &&
        !p.includes("/../") &&
        !p.startsWith("node_modules/"),
    );
}
