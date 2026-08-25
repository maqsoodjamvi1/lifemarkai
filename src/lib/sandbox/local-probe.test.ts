import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import http from "node:http";
import { promisify } from "node:util";
import { buildLocalProbeScript } from "./docker.ts";

const run = promisify(execFile);

/**
 * REGRESSION: "remote preview returned 500".
 *
 * The in-container readiness probe used to be three checks OR'd together, the
 * last of which was `nc -z` — a bare TCP connect. It succeeds the instant vite
 * binds its port and says nothing about what vite then serves, so generated
 * code that failed to transform produced a vite answering nothing but its own
 * 500 error overlay, `nc -z` reported UP, boot returned ready, and the tunnel
 * URL was handed to the editor and to the core-loop harness. The OR-chain hid
 * it twice: `curl -fsS` and `wget` both DO fail on a 5xx, but their failure
 * just fell through to `nc -z`. A chain is only as strict as its loosest link.
 *
 * These tests run the real script against real servers, so they fail if anyone
 * reintroduces a status-blind fallback.
 */

function serve(status: number): Promise<{ port: number; close: () => void }> {
  return new Promise((resolve) => {
    const server = http.createServer((_req, res) => {
      res.writeHead(status, { "Content-Type": "text/html" });
      res.end("<pre>body</pre>");
    });
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as { port: number }).port;
      resolve({ port, close: () => server.close() });
    });
  });
}

async function probe(port: number): Promise<string> {
  const { stdout } = await run("sh", ["-c", buildLocalProbeScript(port)]);
  return /LM_STATUS=(\S+)/.exec(stdout)?.[1] ?? "";
}

// The script is POSIX sh and runs inside the Linux sandbox container, not on
// the developer's machine. Skipping on Windows keeps `npm test` green locally
// while still gating CI, which is where the container behaviour matters.
const shellAvailable = process.platform !== "win32";

test(
  "reports the real status for a dev server that is failing to build",
  { skip: shellAvailable ? false : "POSIX sh only" },
  async () => {
    const s = await serve(500);
    try {
      // NOT "up", NOT a generic failure — the actual 500, so callers can tell
      // a broken build from a dead container.
      assert.equal(await probe(s.port), "500");
    } finally {
      s.close();
    }
  },
);

test(
  "reports success and 4xx distinctly",
  { skip: shellAvailable ? false : "POSIX sh only" },
  async () => {
    const ok = await serve(200);
    const notFound = await serve(404);
    try {
      assert.equal(await probe(ok.port), "200");
      // A dev-server 404 is the app answering; it must not read as 000/down.
      assert.equal(await probe(notFound.port), "404");
    } finally {
      ok.close();
      notFound.close();
    }
  },
);

test(
  "reports 000 when nothing is listening",
  { skip: shellAvailable ? false : "POSIX sh only" },
  async () => {
    // Bind and immediately release so the port is real but certainly free.
    const s = await serve(200);
    const port = s.port;
    s.close();
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(await probe(port), "000");
  },
);

test("the socket fallback is a last resort, never an accept-path", () => {
  const script = buildLocalProbeScript(5173);
  // `nc` may only appear in the `else` branch — i.e. after both HTTP clients
  // have been ruled out by `command -v`. If it ever appears OR'd onto the end
  // of a status check again, this fails.
  assert.match(script, /else\s+nc -z 127\.0\.0\.1 5173/);
  assert.ok(
    !/\|\|\s*nc -z/.test(script),
    "nc must not be an OR-fallback for a failed status check",
  );
  // And the script must always emit a parseable verdict, including on the
  // no-client path, or waitForLocalServer has nothing to judge.
  assert.match(script, /LM_STATUS=/);
});
