import { test } from "node:test";
import assert from "node:assert/strict";
import {
buildCollabDecorations,
initialsForName,
styleIdForKey,
type CursorModelLike,
} from "./collab-cursor-decorations.ts";
import type { Collaborator } from "../../hooks/use-yjs-editor.ts";

function model(lines: number[]): CursorModelLike {
  return {
    getLineCount: () => lines.length,
    getLineLength: (n) => lines[n - 1] ?? 0,
  };
}

function collab(overrides: Partial<Collaborator> & { cursor?: Collaborator["cursor"] }): Collaborator {
  return {
    key: "peer-1",
    user: { id: "u1", name: "Alice Smith", color: "#ff0000" },
    ...overrides,
  };
}

test("skips collaborators without a cursor or on another file", () => {
  const { decorations, styles } = buildCollabDecorations(
    [
      collab({}), // no cursor
      collab({ key: "p2", cursor: { file: "other.tsx", line: 1, column: 1 } }),
    ],
    "app.tsx",
    model([10]),
  );
  assert.equal(decorations.length, 0);
  assert.equal(styles.length, 0);
});

test("renders a cursor decoration at the exact position", () => {
  const { decorations, styles } = buildCollabDecorations(
    [collab({ cursor: { file: "app.tsx", line: 2, column: 4 } })],
    "app.tsx",
    model([10, 10, 10]),
  );
  assert.equal(decorations.length, 1);
  assert.deepEqual(decorations[0].range, {
    startLineNumber: 2,
    startColumn: 4,
    endLineNumber: 2,
    endColumn: 4,
  });
  assert.equal(styles[0].withSelection, false);
  assert.equal(styles[0].initials, "AL");
  assert.equal(styles[0].color, "#ff0000");
});

test("clamps out-of-bounds line and column to the model", () => {
  const { decorations } = buildCollabDecorations(
    [collab({ cursor: { file: "app.tsx", line: 99, column: 99 } })],
    "app.tsx",
    model([5, 7]), // 2 lines; line 2 is 7 chars
  );
  assert.deepEqual(decorations[0].range, {
    startLineNumber: 2,
    startColumn: 8, // lineLength + 1
    endLineNumber: 2,
    endColumn: 8,
  });
});

test("clamps zero/negative positions up to 1", () => {
  const { decorations } = buildCollabDecorations(
    [collab({ cursor: { file: "app.tsx", line: 0, column: -3 } })],
    "app.tsx",
    model([5]),
  );
  assert.deepEqual(decorations[0].range, {
    startLineNumber: 1,
    startColumn: 1,
    endLineNumber: 1,
    endColumn: 1,
  });
});

test("adds a selection decoration only for non-empty selections", () => {
  const empty = buildCollabDecorations(
    [collab({
      cursor: {
        file: "a", line: 1, column: 1,
        selection: { startLine: 1, startColumn: 2, endLine: 1, endColumn: 2 },
      },
    })],
    "a",
    model([10]),
  );
  assert.equal(empty.decorations.length, 1);
  assert.equal(empty.styles[0].withSelection, false);

  const real = buildCollabDecorations(
    [collab({
      cursor: {
        file: "a", line: 1, column: 1,
        selection: { startLine: 1, startColumn: 2, endLine: 2, endColumn: 3 },
      },
    })],
    "a",
    model([10, 10]),
  );
  assert.equal(real.decorations.length, 2);
  assert.equal(real.styles[0].withSelection, true);
  assert.deepEqual(real.decorations[1].range, {
    startLineNumber: 1,
    startColumn: 2,
    endLineNumber: 2,
    endColumn: 3,
  });
});

test("one style spec per visible collaborator, css-safe ids", () => {
  const { styles } = buildCollabDecorations(
    [
      collab({ key: "user@example.com:tab-1", cursor: { file: "a", line: 1, column: 1 } }),
      collab({ key: "p2", user: { id: "u2", name: "bo", color: "#00ff00" }, cursor: { file: "a", line: 1, column: 1 } }),
    ],
    "a",
    model([10]),
  );
  assert.equal(styles.length, 2);
  assert.equal(styles[0].styleId, "cursor-user_example_com_tab_1");
  assert.match(styles[0].styleId, /^[a-zA-Z0-9_-]+$/);
});

test("styleIdForKey and initialsForName helpers", () => {
  assert.equal(styleIdForKey("a.b c"), "cursor-a_b_c");
  assert.equal(initialsForName("maqsood"), "MA");
  assert.equal(initialsForName("X"), "X");
});
