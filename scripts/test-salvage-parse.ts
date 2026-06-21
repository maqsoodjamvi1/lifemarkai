import { parseAIResponse, needsBuildContinuation } from "../lib/ai/code-parser";

const sample =
  '{"thoughts":"x","files":[' +
  '{"path":"src/a.tsx","content":"export default function A(){}","language":"tsx"},' +
  '{"path":"src/b.tsx","content":"export default function B(){';

const p = parseAIResponse(sample);
console.log(JSON.stringify({ files: p.files.length, truncated: p.truncated, cont: needsBuildContinuation(sample) }));
process.exit(p.files.length === 1 && p.truncated === true ? 0 : 1);
