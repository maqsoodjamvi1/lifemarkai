/**
 * XmlStreamParser had zero test coverage before this file. Covers the basic
 * incremental-parse contract plus a regression for the buffer-truncation bug
 * fixed alongside this test: a large in-progress <file_update> block used to
 * have its OWN opening tag silently trimmed away once the buffer crossed
 * maxBufferBytes, making the block unrecoverable with no error reported.
 *
 *   node --import tsx --test src/lib/ai/xml-stream-parser.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { XmlStreamParser, type ParsedFileUpdate } from "./xml-stream-parser.ts";

function collect(): { updates: ParsedFileUpdate[]; errors: string[]; parser: XmlStreamParser } {
  const updates: ParsedFileUpdate[] = [];
  const errors: string[] = [];
  const parser = new XmlStreamParser({
    onUpdate: (u) => {
      updates.push(u);
    },
    onParseError: (msg) => {
      errors.push(msg);
    },
  });
  return { updates, errors, parser };
}

describe("XmlStreamParser — basic incremental parse", () => {
  it("emits a full-file update only once the closing tag arrives", () => {
    const { updates, parser } = collect();
    parser.feed('<file_update path="src/App.tsx" language="tsx">\n<full>const x = 1;');
    assert.equal(updates.length, 0, "no update before the block closes");
    parser.feed("</full>\n</file_update>");
    assert.equal(updates.length, 1);
    assert.equal(updates[0].path, "src/App.tsx");
    assert.equal(updates[0].kind, "full");
    assert.match(updates[0].content!, /const x = 1;/);
  });

  it("handles a tag split across many small chunks", () => {
    const { updates, parser } = collect();
    const whole = '<file_update path="a.ts"><full>hello world</full></file_update>';
    for (const ch of whole) parser.feed(ch); // one character at a time
    assert.equal(updates.length, 1);
    assert.equal(updates[0].content, "hello world");
  });

  it("parses a search/replace patch block", () => {
    const { updates, parser } = collect();
    parser.feed(
      '<file_update path="a.ts"><search>old</search><replace>new</replace></file_update>',
    );
    assert.equal(updates.length, 1);
    assert.equal(updates[0].kind, "patch");
    assert.equal(updates[0].search, "old");
    assert.equal(updates[0].replace, "new");
  });

  it("parses multiple sequential blocks in one buffer", () => {
    const { updates, parser } = collect();
    parser.feed(
      '<file_update path="a.ts"><full>A</full></file_update>' +
        '<file_update path="b.ts"><full>B</full></file_update>',
    );
    assert.equal(updates.length, 2);
    assert.deepEqual(updates.map((u) => u.path), ["a.ts", "b.ts"]);
  });

  it("reports malformed blocks via onParseError instead of throwing", () => {
    const { updates, errors, parser } = collect();
    parser.feed("<file_update><nothing_recognized/></file_update>");
    assert.equal(updates.length, 0);
    assert.equal(errors.length, 1);
  });
});

describe("XmlStreamParser — large in-progress block survives buffer trimming", () => {
  it("does not lose the opening tag of a block larger than maxBufferBytes", () => {
    // Small cap so the test doesn't need to push megabytes of data.
    const updates: ParsedFileUpdate[] = [];
    const errors: string[] = [];
    const smallParser = new XmlStreamParser({
      maxBufferBytes: 1024,
      onUpdate: (u) => {
        updates.push(u);
      },
      onParseError: (m) => {
        errors.push(m);
      },
    });

    smallParser.feed('<file_update path="big.ts"><full>');
    // Stream well past the 1KB cap while the block is still open — the old
    // code would have trimmed the buffer down to its last 512 bytes on the
    // very first over-cap feed() and destroyed the opening tag above.
    for (let i = 0; i < 20; i++) {
      smallParser.feed("x".repeat(200));
    }
    assert.equal(updates.length, 0, "block is still open, nothing should emit yet");

    smallParser.feed("</full></file_update>");
    assert.equal(errors.length, 0, "the block must still be recognized, not silently dropped");
    assert.equal(updates.length, 1);
    assert.equal(updates[0].path, "big.ts");
    assert.equal(updates[0].content!.length, 4000);
  });

  it("still trims plain chatter between blocks so memory doesn't grow unbounded", () => {
    const smallParser = new XmlStreamParser({ maxBufferBytes: 1024, onUpdate: () => {} });
    smallParser.feed("blah ".repeat(500)); // 2500 bytes of prose, no tag at all
    assert.ok(
      smallParser.pendingBufferLength <= 512 * 1024,
      "chatter with no pending block should still be bounded",
    );
  });
});
