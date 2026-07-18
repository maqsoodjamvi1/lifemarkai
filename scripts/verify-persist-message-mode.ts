/**
 * Verify chat history persistence helpers.
 * Run: npx tsx scripts/verify-persist-message-mode.ts
 */
import {
  toPersistedMessageMode,
  buildPersistedAssistantContent,
} from "../lib/ai/persist-message-mode.ts";

const modeCases: Array<[string, string]> = [
  ["chat", "chat"],
  ["agent", "agent"],
  ["plan", "plan"],
  ["build", "build"],
  ["patch", "build"], // critical — DB CHECK rejects "patch"
  ["unknown", "chat"],
];

let failed = 0;
for (const [input, expected] of modeCases) {
  const got = toPersistedMessageMode(input);
  if (got !== expected) {
    console.error(`FAIL  mode ${input} → ${got} (expected ${expected})`);
    failed++;
  } else {
    console.log(`PASS  mode ${input} → ${got}`);
  }
}

const contentCases: Array<{
  name: string;
  mode: string;
  fullContent: string;
  changedPaths?: string[];
  expectIncludes: string;
}> = [
  {
    name: "patch with paths",
    mode: "patch",
    fullContent: '{"patches":[]}',
    changedPaths: ["src/App.tsx"],
    expectIncludes: "src/App.tsx",
  },
  {
    name: "build with message",
    mode: "build",
    fullContent: JSON.stringify({ message: "Added a header menu.", files: [] }),
    expectIncludes: "header menu",
  },
  {
    name: "empty never blank",
    mode: "chat",
    fullContent: "   ",
    expectIncludes: "Changes applied",
  },
];

for (const c of contentCases) {
  const got = buildPersistedAssistantContent({
    mode: c.mode,
    fullContent: c.fullContent,
    changedPaths: c.changedPaths,
  });
  if (!got || !got.includes(c.expectIncludes)) {
    console.error(`FAIL  content ${c.name}: got ${JSON.stringify(got)}`);
    failed++;
  } else {
    console.log(`PASS  content ${c.name}`);
  }
}

process.exit(failed === 0 ? 0 : 1);
