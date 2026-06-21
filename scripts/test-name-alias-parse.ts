import { parseAIResponse } from "../lib/ai/code-parser";

const sample = JSON.stringify({
  thoughts: "x",
  files: [{ name: "src/App.tsx", content: "export default function App(){}", language: "tsx" }],
  message: "done",
});

const p = parseAIResponse(sample);
console.log(JSON.stringify({ files: p.files.length, path: p.files[0]?.path }));
process.exit(p.files.length === 1 && p.files[0]?.path === "src/App.tsx" ? 0 : 1);
