import assert from "node:assert/strict";
import { createServer } from "node:http";
import { verifyPublishedPage } from "../src/lib/reliability/verify-published-page.ts";

const content = "A complete published application with meaningful content, working navigation, and the expected page styles loaded successfully.";
const server = createServer((request, response) => {
  if (request.url === "/missing.css") {
    response.writeHead(404); response.end("Missing CSS"); return;
  }
  response.setHeader("Content-Type", "text/html");
  if (request.url === "/delayed" || request.url === "/blank") {
    response.end(`<!doctype html><html><body>${request.url === "/delayed" ? `<script>setTimeout(() => { document.body.textContent = ${JSON.stringify(content)}; }, 1500)</script>` : ""}</body></html>`);
    return;
  }
  const extra = request.url === "/broken-assets" ? '<link rel="stylesheet" href="/missing.css">' : "";
  const heading = request.url === "/wrong-route" ? "Not Found" : "Published app";
  response.end(`<!doctype html><html><head>${extra}</head><body><h1>${heading}</h1><main>${content}</main></body></html>`);
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address() as { port: number };
try {
  const base = `http://127.0.0.1:${port}`;
  assert.equal((await verifyPublishedPage(`${base}/healthy`)).passed, true);
  assert.equal((await verifyPublishedPage(`${base}/delayed`)).passed, true);
  assert.equal((await verifyPublishedPage(`${base}/blank`)).passed, false);
  const broken = await verifyPublishedPage(`${base}/broken-assets`);
  assert.equal(broken.passed, false);
  assert.ok(broken.errors.some((error) => error.includes("missing.css")));
  assert.equal((await verifyPublishedPage(`${base}/wrong-route`)).passed, false);
  console.log("PASS: complete and delayed pages accepted; blank pages, missing assets and incorrect routes rejected.");
} finally {
  server.close();
}
