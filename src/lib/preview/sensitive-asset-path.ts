/**
 * Guards the public, unauthenticated `/preview/:projectId/<path>` asset
 * route (src/routes/preview/$.ts) against serving a project's own secrets.
 *
 * That route exists to let a rendered preview's own HTML load its
 * referenced assets (CSS, JS, images, fonts) on any host with no session —
 * by design there is no login, no token, and no ownership check on this
 * branch (unlike the sibling HTML branch, which is at least conditionally
 * token-gated). It queries `project_files` by exact path with no filtering
 * of which paths are "safe to hand to a browser," so before this guard
 * existed, `GET /preview/<any-project-id>/.env.local` returned that
 * project's connector OAuth tokens / API keys in plaintext to anyone who
 * knew (or enumerated) the project id — no auth, no project visibility
 * check, nothing. `.env.local` is ENV_FILE_PATH
 * (src/lib/project/env-file.ts) and is stored as an ordinary
 * `project_files` row like any other file, which is exactly what made it
 * reachable here.
 *
 * No legitimate rendered preview ever references a dotfile — browsers only
 * ever request the asset paths that appear in the page's own HTML/CSS/JS,
 * and generated apps don't link to their own .env. So blocking every
 * dotfile/dotdir segment closes the leak with no risk to the real feature.
 */
export function isBlockedPreviewAssetPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/").replace(/^\/+/, "");
  return normalized.split("/").some((segment) => segment.startsWith("."));
}
