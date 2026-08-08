import { readFileSync, writeFileSync } from "node:fs";
const p = process.argv[2];
const raw = readFileSync(p, "utf8");
const crlf = raw.includes("\r\n");
let s = raw.replace(/\r\n/g, "\n");
const probs = [];
const swap = (from, to, label) => {
  if (s.split(from).length - 1 !== 1) { probs.push(label); return; }
  s = s.replace(from, to);
};

swap(
  `import { hasSiteFooter, hasSiteHeader, needsWebsiteChrome } from "../ai/website-chrome.ts";`,
  `import { ensureWebsiteChrome, hasSiteFooter, hasSiteHeader } from "../ai/website-chrome.ts";`,
  "import",
);

swap(
`test("a fresh scaffold already counts as having chrome", () => {
  for (const files of [lovableViteScaffold("Acme"), tanstackStartScaffold({}, "Acme")]) {
    const all = files.map((f) => ({ path: f.path, content: f.content }));
    assert.equal(hasSiteHeader(all), true, "header should read as present");
    assert.equal(hasSiteFooter(all), true, "footer should read as present");
    assert.equal(needsWebsiteChrome(all), false, "the guarantee must not fire");
  }
});`,
`test("the chrome guarantee leaves a fresh scaffold untouched", () => {
  for (const files of [lovableViteScaffold("Acme"), tanstackStartScaffold({}, "Acme")]) {
    const all = files.map((f) => ({ path: f.path, content: f.content }));
    assert.equal(hasSiteHeader(all), true, "header should read as present");
    assert.equal(hasSiteFooter(all), true, "footer should read as present");
    // needsWebsiteChrome answers "is this a public website that OWES chrome?",
    // which is true for a scaffold and always was. The property that matters is
    // that ensureWebsiteChrome finds nothing missing and returns the input
    // untouched — same array, no second <Header /> grafted into the shell.
    assert.equal(ensureWebsiteChrome(all), all, "guarantee must not modify it");
  }
});`,
  "fresh-scaffold test",
);

swap(
`  assert.equal(hasSiteHeader(files), false);
  assert.equal(hasSiteFooter(files), false);
});`,
`  assert.equal(hasSiteHeader(files), false);
  assert.equal(hasSiteFooter(files), false);
  // ...and the guarantee steps in, which is exactly what it is for.
  assert.notEqual(ensureWebsiteChrome(files), files);
});`,
  "dropped-mount test",
);

if (probs.length) { console.error("ANCHOR MISS: " + probs.join(", ")); process.exit(1); }
writeFileSync(p, crlf ? s.replace(/\n/g, "\r\n") : s);
console.log("tests corrected");
