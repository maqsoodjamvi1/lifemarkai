import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import http from "node:http";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
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

async function probe(port: number, path = "/"): Promise<string> {
  const { stdout } = await run(shell, ["-c", buildLocalProbeScript(port, path)]);
  return /LM_STATUS=(\S+)/.exec(stdout)?.[1] ?? "";
}

// Exercise the real POSIX script on Linux and through Git Bash on Windows.
const gitBash = "C:/Program Files/Git/bin/bash.exe";
const shell = process.platform === "win32" ? gitBash : "sh";
const shellAvailable = process.platform !== "win32" || existsSync(gitBash);

test("wget-only images parse HTTP status without falling back to a socket", { skip: !shellAvailable }, async () => {
  for (const status of [200, 404, 500, 503, 0]) {
    // Force the branch used by the production Alpine sandbox, even when the
    // developer or CI machine also has curl installed. Execute the real awk.
    const harness = `command() { case "$2" in curl) return 1;; wget) return 0;; esac; }; wget() { printf 'HTTP/1.1 ${status} Result\\n' >&2; }; `;
    const { stdout, stderr } = await run(shell, ["-c", harness + buildLocalProbeScript(5173)]);
    assert.equal(stderr, "");
    assert.match(stdout, new RegExp(`LM_STATUS=${status}\\s`));
  }
});

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

test("default probe hits Vite's client asset, not the app HTML entry", () => {
  const script = buildLocalProbeScript(5173);
  assert.match(script, /127\.0\.0\.1:5173\/@vite\/client/);
  assert.equal(script.includes("127.0.0.1:5173/ "), false);
});

test("the socket fallback is a last resort, never an accept-path", () => {
  const script = buildLocalProbeScript(5173, "/");
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
