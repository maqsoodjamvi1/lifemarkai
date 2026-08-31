import assert from "node:assert/strict";
import test from "node:test";
import { diagnoseBrokenImports } from "./diagnose-imports.ts";

// Regression: `import { Button } from "./Button"` against a target that only
// has `export default function Button(){}` is a genuinely broken import — no
// named binding `Button` exists, so Vite/esbuild fails it at runtime with
// "does not provide an export named 'Button'". The old `onlyDefault` check
// suppressed this exact case whenever the imported name matched the default
// export's function name, so this common AI-generated mistake (mixing up
// default vs. named import of a same-named component) went straight past
// the diagnostic that exists specifically to catch it.
test("flags a named import of a same-named default-only export", () => {
  const issues = diagnoseBrokenImports([
    {
      path: "src/App.tsx",
      content: 'import { Button } from "./Button";\nexport default function App(){ return <Button />; }',
    },
    {
      path: "src/Button.tsx",
      content: "export default function Button(){ return null; }",
    },
  ]);

  assert.ok(
    issues.some((issue) => issue.includes("Button") && issue.includes("export default")),
    issues.join("\n"),
  );
});

test("does not flag a correct default import of the same file", () => {
  const issues = diagnoseBrokenImports([
    {
      path: "src/App.tsx",
      content: 'import Button from "./Button";\nexport default function App(){ return <Button />; }',
    },
    {
      path: "src/Button.tsx",
      content: "export default function Button(){ return null; }",
    },
  ]);
  assert.equal(issues.length, 0, issues.join("\n"));
});

test("does not flag a correct named import", () => {
  const issues = diagnoseBrokenImports([
    {
      path: "src/App.tsx",
      content: 'import { Button } from "./Button";\nexport default function App(){ return <Button />; }',
    },
    {
      path: "src/Button.tsx",
      content: "export function Button(){ return null; }",
    },
  ]);
  assert.equal(issues.length, 0, issues.join("\n"));
});
