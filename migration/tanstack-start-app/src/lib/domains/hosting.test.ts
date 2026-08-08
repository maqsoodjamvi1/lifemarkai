import { describe,it } from "node:test";
import assert from "node:assert/strict";

import { dnsRecordsForDomain,getHostingTarget } from "./hosting.ts";
import { connectDnsRecords,domainVerificationToken } from "./entri.ts";

const PROJECT = "867e168b-1456-4f45-aaff-ca6b6c713ee2";
const SITE = "lifemark-867e168b-145"; // `lifemark-` + first 12 chars of the id

/**
 * Custom domains failed in a way that produced no error anywhere: the DNS
 * records we showed people pointed at infrastructure that does not serve their
 * project. These tests pin the records to the host that actually serves them.
 */
describe("dnsRecordsForDomain — the records must point at the real host", () => {
  it("points an apex domain at Netlify's load balancer", () => {
    const records = dnsRecordsForDomain(PROJECT, "example.com", "tok");
    const a = records.filter((r) => r.type === "A").map((r) => r.value);
    assert.deepEqual(a.sort(), ["75.2.60.5", "99.83.190.102"]);
  });

  it("never emits the Vercel address the old hand-rolled copy used", () => {
    // 76.76.21.21 is Vercel's. It was the apex default in entri.ts while
    // projects were served by Netlify, so every apex domain connected through
    // the Entri flow pointed at a host that had never heard of the project.
    const records = dnsRecordsForDomain(PROJECT, "example.com", "tok");
    assert.ok(
      !records.some((r) => r.value === "76.76.21.21"),
      "apex records still contain Vercel's IP",
    );
  });

  it("points a subdomain at the project's Netlify site", () => {
    const records = dnsRecordsForDomain(PROJECT, "app.example.com", "tok");
    const cname = records.find((r) => r.type === "CNAME");
    assert.equal(cname?.value, `${SITE}.netlify.app`);
    assert.equal(cname?.name, "app");
  });

  it("never emits the lifemarkai.app host that does not serve projects", () => {
    const records = dnsRecordsForDomain(PROJECT, "app.example.com", "tok");
    assert.ok(
      !records.some((r) => /lifemarkai\.app/.test(r.value)),
      "records still point at lifemarkai.app",
    );
  });

  it("includes the TXT ownership record", () => {
    const records = dnsRecordsForDomain(PROJECT, "example.com", "my-token");
    const txt = records.find((r) => r.type === "TXT");
    assert.equal(txt?.name, "_lifemark-verify");
    assert.equal(txt?.value, "my-token");
  });
});

describe("connectDnsRecords — Entri and the manual fallback agree with hosting", () => {
  /**
   * The product used to answer "what DNS do I need?" two different ways
   * depending on which button you pressed: setProjectDomain emitted Netlify's
   * real values while connectDnsRecords emitted Vercel's. Whichever one a user
   * followed, the other was wrong — and verification read a third set. Records
   * shown and records checked now come from the same function, so they cannot
   * drift again.
   */
  it("returns the same targets as the hosting module", () => {
    const domain = "app.example.com";
    const viaHosting = dnsRecordsForDomain(PROJECT, domain, domainVerificationToken(domain, PROJECT));
    const viaEntri = connectDnsRecords(domain, PROJECT);

    assert.equal(viaEntri.length, viaHosting.length);
    for (const expected of viaHosting) {
      assert.ok(
        viaEntri.some(
          (r) => r.type === expected.type && r.host === expected.name && r.value === expected.value,
        ),
        `Entri records are missing ${expected.type} ${expected.name} -> ${expected.value}`,
      );
    }
  });

  it("carries a TTL on every record, as the Entri SDK requires", () => {
    for (const r of connectDnsRecords("example.com", PROJECT)) {
      assert.ok(typeof r.ttl === "number" && r.ttl > 0, `missing ttl on ${r.type} ${r.host}`);
    }
  });
});

describe("domainVerificationToken", () => {
  it("is stable for a domain+project pair", () => {
    assert.equal(
      domainVerificationToken("example.com", PROJECT),
      domainVerificationToken("example.com", PROJECT),
    );
  });

  it("differs across projects, so one project's token cannot verify another's domain", () => {
    assert.notEqual(
      domainVerificationToken("example.com", PROJECT),
      domainVerificationToken("example.com", "00000000-0000-4000-8000-000000000000"),
    );
  });
});

describe("getHostingTarget", () => {
  it("exposes matching apex and subdomain targets for verification to check", () => {
    const target = getHostingTarget();
    assert.ok(target.apexARecords(PROJECT).length > 0, "no apex A records to verify against");
    assert.match(target.subdomainCname(PROJECT), /^[a-z0-9-]+\.[a-z0-9.-]+$/);
  });
});
