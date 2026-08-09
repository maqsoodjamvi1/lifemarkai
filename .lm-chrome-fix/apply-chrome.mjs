/**
 * Split the generated app into a public website plus an admin area, by making
 * the site chrome route-aware instead of globally mounted.
 *
 * TWO PHASES, deliberately. Every edit is computed and asserted in memory
 * first; nothing is written unless ALL of them matched. The earlier version of
 * this script wrote each file as it went, so a mismatch on the third file left
 * the first two already rewritten — a half-applied change is worse than none,
 * especially on a working tree that is about to be committed.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..");
const APP = join(REPO, "migration", "tanstack-start-app");
const TPL = join(APP, "src", "lib", "templates");

const problems = [];
const notes = [];
/**
 * Line endings, held constant.
 *
 * This repo is mixed: files git rewrote during a merge come back CRLF, files it
 * left alone stay LF. Anchors here are written with \n, so a multi-line anchor
 * silently missed on every CRLF file while single-line ones matched — four
 * failures that looked like upstream drift and were nothing but \r. Normalise
 * on read, restore the file's own convention on write, so an edit never
 * reformats a file it did not mean to touch.
 */
const lineEndings = new Map();
const read = (p) => {
  const raw = readFileSync(p, "utf8");
  lineEndings.set(p, raw.includes("\r\n"));
  return raw.replace(/\r\n/g, "\n");
};
const write = (p, content) =>
  writeFileSync(p, lineEndings.get(p) ? content.replace(/\n/g, "\r\n") : content);
const die = (m) => problems.push(m);
const ok = (m) => notes.push(m);

/** Replace `from` with `to`, asserting it appears exactly once. */
function swap(src, from, to, label) {
  const n = src.split(from).length - 1;
  if (n !== 1) {
    die(`${label}: expected 1 occurrence, found ${n}`);
    return src;
  }
  ok(label);
  return src.replace(from, to);
}

/** Everything to write, filled in during the validation phase. */
const pending = [];

/* 1 — site-chrome.ts: the shell source + a 3-file chrome set. */
{
  const target = join(TPL, "site-chrome.ts");
  const chunkPath = join(HERE, "chrome-chunk.payload.ts");
  if (!existsSync(chunkPath)) die("staged chrome-chunk.payload.ts missing");
  let src = read(target);
  if (src.includes("SITE_CHROME_PATH")) {
    die("site-chrome.ts already applied — refusing to double-apply");
  } else {
    src = swap(
      src,
      `/** Both chrome files, ready to drop into any scaffold's file list. */
export function siteChromeFiles(brand: string): ChromeSourceFile[] {
  return [
    { path: SITE_HEADER_PATH, language: "typescriptreact", content: siteHeaderSource(brand) },
    { path: SITE_FOOTER_PATH, language: "typescriptreact", content: siteFooterSource(brand) },
  ];
}`,
      `/** Header, footer, and the route-aware shell that decides where they show. */
export function siteChromeFiles(
  brand: string,
  framework: ChromeFramework,
): ChromeSourceFile[] {
  return [
    { path: SITE_HEADER_PATH, language: "typescriptreact", content: siteHeaderSource(brand) },
    { path: SITE_FOOTER_PATH, language: "typescriptreact", content: siteFooterSource(brand) },
    {
      path: SITE_CHROME_PATH,
      language: "typescriptreact",
      content: siteChromeShellSource(framework),
    },
  ];
}`,
      "site-chrome.ts: siteChromeFiles takes a framework and emits the shell",
    );
    if (existsSync(chunkPath)) pending.push([target, src + read(chunkPath)]);
  }
}

/* 2 — Vite scaffold: wrap Routes in SiteChrome. */
{
  const target = join(TPL, "lovable-vite-scaffold.ts");
  let src = read(target);
  src = swap(
    src,
    "...siteChromeFiles(deriveBrand(name)),",
    '...siteChromeFiles(deriveBrand(name), "react-router"),',
    "vite scaffold: chrome files ask for the react-router shell",
  );
  src = swap(
    src,
    `import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";`,
    `import SiteChrome from "@/components/layout/SiteChrome";`,
    "vite scaffold: App.tsx imports the shell instead of the parts",
  );
  src = swap(
    src,
    `        <Header />
        <Routes>
          <Route path="/" element={<Index />} />
          {/* Add all custom routes ABOVE the catch-all "*" route. */}
          <Route path="*" element={<NotFound />} />
        </Routes>
        <Footer />`,
    `        {/* SiteChrome shows the site header/footer on PUBLIC routes and
            nothing under /admin/*, so one app serves a public website AND an
            internal admin area. Do not mount Header/Footer directly. */}
        <SiteChrome>
          <Routes>
            <Route path="/" element={<Index />} />
            {/* Public pages go here. Admin screens go under /admin/* and
                render inside their own AppLayout, with no site chrome. */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </SiteChrome>`,
    "vite scaffold: App.tsx mounts routes inside SiteChrome",
  );
  pending.push([target, src]);
}

/* 3 — TanStack scaffold: same, in the root document. */
{
  const target = join(TPL, "tanstack-start-scaffold.ts");
  let src = read(target);
  src = swap(
    src,
    "siteChromeFiles(deriveBrand(projectName))",
    'siteChromeFiles(deriveBrand(projectName), "tanstack-start")',
    "tanstack scaffold: chrome files ask for the tanstack shell",
  );
  src = swap(
    src,
    `import { Header } from "../components/layout/Header";
import { Footer } from "../components/layout/Footer";`,
    `import { SiteChrome } from "../components/layout/SiteChrome";`,
    "tanstack scaffold: __root.tsx imports the shell instead of the parts",
  );
  src = swap(
    src,
    `        <Header />
        {children}
        <Footer />`,
    `        <SiteChrome>{children}</SiteChrome>`,
    "tanstack scaffold: __root.tsx wraps children in SiteChrome",
  );
  pending.push([target, src]);
}

/* 4 — the app-shell contract: two surfaces, not "delete the chrome". */
{
  const target = join(APP, "src", "lib", "ai", "build-intent.ts");
  const src = read(target);
  pending.push([
    target,
    swap(
      src,
      "- The scaffold's website chrome must NOT survive: rewrite \\`src/App.tsx\\` to render AppLayout and REMOVE the \\`<Header />\\` / \\`<Footer />\\` imports. No phone/email contact strip, no social icons, no marketing footer, no Home/About/Services/Contact links anywhere in the app.\n- Route \"/\" REDIRECTS to the main working screen (e.g. /dashboard or /register). An internal tool has no landing page.",
      "- TWO SURFACES, one app. A PUBLIC WEBSITE at \\`/\\` (home, about, services, contact — the business's shopfront) AND the ADMIN APP under \\`/admin/*\\`. Keep the scaffold's \\`Header\\`/\\`Footer\\`; do NOT delete them and do NOT edit \\`src/components/layout/SiteChrome.tsx\\` — it already hides the site chrome on \\`/admin/*\\` for you.\n- Never mix the two: no sidebar, dashboard widget or admin table on the public site; and no phone/email contact strip, social icons, marketing footer or Home/About/Services/Contact links anywhere under \\`/admin/*\\`.\n- Route \\`/\\` is the public home page. Route \\`/admin\\` is the main working screen (dashboard/register), and EVERY admin route (\\`/admin/inventory\\`, \\`/admin/orders\\`, …) renders inside AppLayout. The public header's primary action links to \\`/admin\\`.",
      "build-intent.ts: APP_SHELL_CONTRACT describes the public + admin split",
    ),
  ]);
}

/* 5 — new test file + runner registration. */
{
  const testSrc = join(HERE, "site-chrome.test.ts");
  if (!existsSync(testSrc)) die("staged site-chrome.test.ts missing");
  else {
    pending.push([join(TPL, "site-chrome.test.ts"), read(testSrc)]);
    ok("tests: site-chrome.test.ts staged");
  }

  // Append to whatever the test script currently lists, rather than anchoring on
  // a specific sibling test. Anchoring on one is what broke the first dry run:
  // the file on disk did not list the test I expected, and the script failed on
  // a difference that had nothing to do with this change.
  const pkgPath = join(REPO, "package.json");
  const pkg = read(pkgPath);
  const added = "migration/tanstack-start-app/src/lib/templates/site-chrome.test.ts";
  const script = pkg.match(/("test":\s*")([^"]*)(")/);
  if (!script) die('no "test" script found in package.json');
  else if (script[2].includes(added)) die("tests: already registered in package.json");
  else if (!script[2].includes("tsx --test")) die(`tests: unexpected script "${script[2].slice(0, 60)}"`);
  else {
    pending.push([pkgPath, pkg.replace(script[0], `${script[1]}${script[2]} ${added}${script[3]}`)]);
    ok(`tests: registered alongside ${script[2].split(/\s+/).length - 2} existing`);
  }
}

/* 6 — write the standard down so it stops being rediscovered. */
{
  const target = join(REPO, "CLAUDE.md");
  const marker = "## Generated apps: public website + admin app";
  const md = read(target);
  if (md.includes(marker)) {
    die("CLAUDE.md already documents the standard");
  } else {
    pending.push([
      target,
      `${md}
${marker}

Every generated business app has two surfaces, and they must not bleed into each
other. The public website lives at \`/\` and keeps the scaffold's \`Header\` and
\`Footer\`. The admin app lives under \`/admin/*\` and renders inside its own
\`AppLayout\` with a sidebar and no marketing chrome.

The split is enforced by \`src/components/layout/SiteChrome.tsx\`, emitted by
\`lib/templates/site-chrome.ts\`. It is the ONLY place chrome is mounted: it reads
the current pathname and renders \`Header\`/\`Footer\` on public routes and nothing
under an admin prefix. Scaffolds must never mount \`<Header />\` or \`<Footer />\`
directly — doing so makes the chrome global again, which is what put a "Your
Brand" marketing bar and a placeholder street address around an ERP admin panel.

App-shell app types (\`erp\`, \`pos\`, \`crm\`, \`admin-dashboard\`, and the rest of
\`APP_SHELL_APP_TYPES\`) are NOT exempt from having a public website. They get both.
\`APP_SHELL_CONTRACT\` describes the split; it must never go back to telling the
model to delete the chrome.
`,
    ]);
    ok("CLAUDE.md: standard recorded");
  }
}

/* ── Commit phase ─────────────────────────────────────────────────────────── */
for (const n of notes) console.log(`  ok   ${n}`);

if (problems.length > 0) {
  for (const p of problems) console.error(`  FAIL ${p}`);
  console.error(
    `\nAPPLY FAILED — ${problems.length} check(s) did not match. NOTHING was written.`,
  );
  console.error("Your working tree is untouched. Send this output to Claude.");
  process.exit(1);
}

if (process.argv.includes("--dry-run")) {
  console.log(`\nDRY RUN OK — all ${pending.length} file writes validated, none performed.`);
  process.exit(0);
}

for (const [path, content] of pending) write(path, content);
console.log(`\nAPPLY OK — ${pending.length} files written.`);
