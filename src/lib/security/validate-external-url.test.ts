import { strict as assert } from "node:assert";
import { test } from "node:test";
import { isPrivateIpAddress, validateExternalUrl } from "./validate-external-url.ts";

test("isPrivateIpAddress flags loopback, link-local, and RFC1918 ranges", () => {
  assert.equal(isPrivateIpAddress("127.0.0.1"), true);
  assert.equal(isPrivateIpAddress("10.0.0.5"), true);
  assert.equal(isPrivateIpAddress("172.16.0.1"), true);
  assert.equal(isPrivateIpAddress("172.31.255.255"), true);
  assert.equal(isPrivateIpAddress("192.168.1.1"), true);
  assert.equal(isPrivateIpAddress("169.254.169.254"), true); // cloud metadata endpoint
  assert.equal(isPrivateIpAddress("100.100.100.200"), true); // CGNAT
  assert.equal(isPrivateIpAddress("0.0.0.0"), true);
  assert.equal(isPrivateIpAddress("::1"), true);
  assert.equal(isPrivateIpAddress("fe80::1"), true);
  assert.equal(isPrivateIpAddress("fc00::1"), true);
});

test("isPrivateIpAddress does not flag ordinary public addresses", () => {
  assert.equal(isPrivateIpAddress("8.8.8.8"), false);
  assert.equal(isPrivateIpAddress("1.1.1.1"), false);
  assert.equal(isPrivateIpAddress("93.184.216.34"), false);
});

test("validateExternalUrl rejects non-http(s) schemes before any DNS work", async () => {
  const result = await validateExternalUrl("ftp://example.com/file");
  assert.deepEqual(result, { error: "url must be http(s)" });
});

test("validateExternalUrl rejects an unparseable URL", async () => {
  const result = await validateExternalUrl("not a url");
  assert.deepEqual(result, { error: "url must be a valid http(s) URL" });
});

test("validateExternalUrl rejects localhost and .local hosts", async () => {
  assert.deepEqual(await validateExternalUrl("http://localhost/hook"), { error: "Internal hosts are not allowed" });
  assert.deepEqual(await validateExternalUrl("http://foo.local/hook"), { error: "Internal hosts are not allowed" });
});

test("validateExternalUrl rejects an IP-literal target in a private range without a DNS lookup", async () => {
  assert.deepEqual(await validateExternalUrl("http://169.254.169.254/latest/meta-data/"), {
    error: "Internal hosts are not allowed",
  });
  assert.deepEqual(await validateExternalUrl("http://127.0.0.1:8080/hook"), { error: "Internal hosts are not allowed" });
});

test("validateExternalUrl accepts a public IP-literal target", async () => {
  const result = await validateExternalUrl("https://8.8.8.8/hook");
  assert.deepEqual(result, { url: "https://8.8.8.8/hook" });
});
