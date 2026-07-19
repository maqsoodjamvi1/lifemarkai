import { readdirSync, readFileSync, writeFileSync } from "fs";
import {
  buildFallbackHtml,
  hardenCharAtCalls,
  PREVIEW_ENGINE_REV,
} from "../lib/preview/build-fallback-html";
import type { ProjectFile } from "../types/database";

const dir = "outputs/df9dd882-ec56-450f-b9ce-dbddd227af31";
const files: ProjectFile[] = readdirSync(dir).map((name) => ({
  id: name,
  project_id: "x",
  path: name.replace(/__/g, "/"),
  content: readFileSync(`${dir}/${name}`, "utf8"),
  created_at: "",
  updated_at: "",
}));

console.log("harden simple:", hardenCharAtCalls("service.category.charAt(0)"));
console.log(
  "harden paren:",
  hardenCharAtCalls("(service.category ?? 'wellness').charAt(0)"),
);
console.log(
  "harden titleCase body:",
  hardenCharAtCalls('return s.charAt(0).toUpperCase() + s.slice(1)'),
);

const html = buildFallbackHtml(files);
writeFileSync("outputs/df9dd882-healed-preview.html", html);
console.log("rev", PREVIEW_ENGINE_REV, "len", html.length);

const hits = [...html.matchAll(/[^\n]{0,50}\.charAt\(/g)].map((m) => m[0].trim());
const maybeUnsafe = hits.filter(
  (s) => !s.includes("String(") && !/return s\.charAt|titleCase/.test(s),
);
console.log("charAt count", hits.length);
console.log("maybe-unsafe", maybeUnsafe.slice(0, 20));
