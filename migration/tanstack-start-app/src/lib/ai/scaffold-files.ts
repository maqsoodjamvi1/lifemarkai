/**
 * Which files exist because the SCAFFOLD put them there, not because anyone
 * built anything yet.
 *
 * This distinction is the difference between "edit the user's app" and "build
 * the user's app", and getting it wrong silently breaks the product. It has now
 * broken it twice, in two different places, for the same reason.
 *
 * The first time, the CLIENT router asked `files.length > 8`, on the
 * reasonable-sounding theory that a project with more than eight files must
 * already contain real work. That held when the scaffold was small. It is now
 * 25 files — index.html, three tsconfigs, components.json, the Header/Footer
 * chrome, use-mobile, App.css, README, .gitignore and the rest — so every new
 * project cleared the threshold before its first build, every first build was
 * routed to the surgical agent, and the agent did what a surgical agent does:
 * read Index.tsx, change almost nothing, finish.
 *
 * The second time was worse and lasted longer, because the fix for the first
 * lived as a private helper inside chat-panel.tsx where no server code could
 * reach it. The SERVER kept asking `files.length > 0` and, finding 25, told the
 * model "INCREMENTAL EDIT — return ONLY the files you change. This is an edit
 * to an EXISTING app, not a rebuild." On a customer's very first message. The
 * model, correctly following that instruction against a placeholder scaffold,
 * returned nothing to change — and the customer saw "No files generated".
 *
 * Hence this module. The rule now has ONE definition, and both sides import it.
 * If you add files to the starter scaffold, add them here in the same commit,
 * or first builds will start silently returning empty again.
 *
 * The third time was this one: getStarterFiles()'s "static" framework branch
 * (src/lib/server-fns/projects.ts) — the platform's DEFAULT framework for
 * every prompt that doesn't need a backend — scaffolds exactly three files:
 * root-level index.html, styles.css, and app.js. This regex only ever
 * recognized the Vite+React scaffold shape (src/App.tsx, src/index.css,
 * etc.), so on a brand-new static project styles.css and app.js matched
 * nothing and were counted as "user-authored" from the instant the project
 * was created — before a single AI turn ran. That silently broke, for every
 * static project (i.e. most projects): shouldClarifyBeforeBuild() (sees
 * userAuthoredFileCount > 0, skips the pre-build questionnaire), and the
 * client's build→agent promotion in chat-panel.tsx (sees fileCount > 0,
 * promotes the very first message straight to Agent mode, skipping the Build
 * pipeline and Clarify entirely). Confirmed live: a fresh static project's
 * first message went directly to /api/ai/agent with zero Clarify questions.
 */

export const SCAFFOLD_FILE_RE =
  /^(index\.html|styles\.css|app\.js|package\.json|package-lock\.json|vite\.config\.(t|j)s|components\.json|tsconfig(\.app|\.node)?\.json|tailwind\.config\.(t|j)s|postcss\.config\.js|eslint\.config\.js|\.gitignore|README\.md|public\/.*|src\/(main|App)\.tsx|src\/App\.css|src\/index\.css|src\/styles\.css|src\/vite-env\.d\.ts|src\/lib\/utils\.ts|src\/hooks\/use-mobile\.tsx|src\/pages\/(Index|NotFound)\.tsx|src\/components\/ui\/.*|src\/components\/layout\/(Header|Footer)\.tsx|src\/router\.tsx|src\/routeTree\.gen\.ts|src\/routes\/(__root|index)\.tsx)$/;

/** A home page this large is the user's app, not the starter placeholder. */
export const GROWN_HOME_PAGE_CHARS = 1500;

/**
 * The static scaffold's three files start tiny (a few hundred chars at
 * most — see getStarterFiles()'s "static" branch). Once a real build has
 * run, any of them grows well past this, same idea as GROWN_HOME_PAGE_CHARS
 * but sized for the smaller static starter.
 */
export const GROWN_STATIC_FILE_CHARS = 600;

export interface ScaffoldCountableFile {
  path: string;
  content?: string | null;
}

/**
 * How many of these files represent work someone actually asked for.
 *
 * Returns 0 for a pristine new project even though it holds 25 files.
 */
export function countUserAuthoredFiles(files: ScaffoldCountableFile[]): number {
  let count = 0;
  for (const f of files) {
    const path = (f.path ?? "").replace(/\\/g, "/");
    if (!SCAFFOLD_FILE_RE.test(path)) {
      count += 1;
      continue;
    }
    // An app can legitimately live entirely inside the home page. Once that
    // file has clearly grown past the placeholder, treat it as real work so a
    // follow-up request edits it instead of rebuilding over the top.
    if (
      /^src\/(pages\/Index|routes\/index)\.tsx$/.test(path) &&
      (f.content ?? "").length > GROWN_HOME_PAGE_CHARS
    ) {
      count += 1;
      continue;
    }
    // Same idea for the static scaffold's index.html/styles.css/app.js — once
    // the AI has actually built into one of them, it stops being scaffold.
    if (
      /^(index\.html|styles\.css|app\.js)$/.test(path) &&
      (f.content ?? "").length > GROWN_STATIC_FILE_CHARS
    ) {
      count += 1;
    }
  }
  return count;
}

/**
 * Is this project still untouched — nothing but scaffold?
 *
 * Use this ANYWHERE you would have reached for `files.length === 0`. That test
 * is now always false, because every project is created with a scaffold
 * already in it.
 */
export function isGreenfieldProject(files: ScaffoldCountableFile[]): boolean {
  return countUserAuthoredFiles(files) === 0;
}
