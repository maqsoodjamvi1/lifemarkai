import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { appServing,probeServedModuleGraph } from "./shared.ts";

/**
 * REGRESSION: "remote preview returned 500".
 *
 * Readiness used to be `status > 0 && not a gateway status`, and the
 * in-container probe fell back to `nc -z` — a bare TCP connect. Between them,
 * a vite that had bound its port and was answering nothing but its own
 * compile-error 500 counted as READY: boot returned ready, the route persisted
 * phase "ready" and handed the tunnel URL to the editor and to the core-loop
 * harness, which fetched it and got 500. Reproducibly, because a transform
 * error in generated code is deterministic.
 *
 * The rule these tests pin: a 5xx FROM THE APP is not readiness; everything
 * below 500 that the app itself answered still is.
 */

test("a compile-error 500 from the dev server is NOT serving", () => {
  assert.equal(appServing(500), false);
});

test("gateway statuses stay not-serving (proxy up, backend down)", () => {
  for (const status of [502, 503, 504]) {
    assert.equal(appServing(status), false, `${status} must read as down`);
  }
});

test("no HTTP response at all is not serving", () => {
  assert.equal(appServing(0), false);
});

test("a dev-server 404 IS serving — the app answered", () => {
  // Blanking a preview over a missing favicon would be strictly worse than the
  // bug this fixes, so 4xx must stay on the serving side of the line.
  assert.equal(appServing(404), true);
  assert.equal(appServing(403), true);
});

test("ordinary success and redirects are serving", () => {
  for (const status of [200, 204, 301, 302, 304]) {
    assert.equal(appServing(status), true, `${status} must read as up`);
  }
});

test("other app-side 5xx are not serving either", () => {
  // 501/505 come from the app, not the proxy — same verdict as 500.
  assert.equal(appServing(501), false);
  assert.equal(appServing(505), false);
});

function serveGraph(handler: http.RequestListener): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as { port: number }).port;
      resolve({
        url: `http://127.0.0.1:${port}/`,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

test("a 200 HTML shell is not ready when its Vite entry module returns 500", async () => {
  const server = await serveGraph((req, res) => {
    if (req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end('<script type="module" src="/src/main.tsx"></script>');
      return;
    }
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Transform failed");
  });
  try {
    const result = await probeServedModuleGraph(server.url);
    assert.equal(result.serving, false);
    assert.equal(result.status, 500);
    assert.match(result.failedUrl ?? "", /src\/main\.tsx$/);
  } finally {
    await server.close();
  }
});

test("nested static imports must all compile before readiness", async () => {
  const server = await serveGraph((req, res) => {
    if (req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end('<script src="/src/main.tsx" type="module"></script>');
    } else if (req.url === "/src/main.tsx") {
      res.writeHead(200, { "Content-Type": "application/javascript" });
      res.end('import "./broken.ts";');
    } else {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Nested transform failed");
    }
  });
  try {
    const result = await probeServedModuleGraph(server.url);
    assert.equal(result.serving, false);
    assert.equal(result.status, 500);
    assert.match(result.failedUrl ?? "", /src\/broken\.ts$/);
  } finally {
    await server.close();
  }
});
