import { salvageFilesFromStreamJson } from "../lib/ai/streaming-file-extractor";

const sample =
  '{"thoughts":"x","files":[' +
  '{"path":"src/a.tsx","content":"export default function A(){}","language":"tsx"},' +
  '{"path":"src/b.tsx","content":"export default function B(){';

const salvaged = salvageFilesFromStreamJson(sample);
console.log("salvaged", salvaged.length, salvaged.map((f) => f.path));
