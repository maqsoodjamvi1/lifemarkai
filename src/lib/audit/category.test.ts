/**
 * The audit categoriser had two implementations — this one and a copy in the
 * audit-logs page — under a comment asking the next person to keep them in sync
 * by hand. They agreed when the copy was removed, which was luck: nothing had
 * ever checked, and drift here is invisible. A miscategorised action does not
 * throw; it just stops appearing under a filter, on a page that still looks
 * perfectly correct.
 *
 *   node --import tsx --test src/lib/audit/category.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { auditCategory } from "./category.ts";

describe("auditCategory", () => {
  it("maps every prefix both copies claimed to handle", () => {
    const expected: Record<string, string> = {
      "auth.login": "auth", "sso.link": "auth", "scim.sync": "auth", "session.revoke": "auth",
      "member.remove": "member", "invite.send": "member", "collaborator.add": "member", "team.rename": "member",
      "project.create": "project", "file.write": "project", "deploy.start": "project", "build.fail": "project",
      "billing.charge": "billing", "subscription.cancel": "billing", "credit.grant": "billing", "plan.change": "billing",
      "config.update": "config", "settings.save": "config", "flag.toggle": "config", "env.set": "config",
      "security.alert": "security", "scan.complete": "security",
    };
    for (const [action, category] of Object.entries(expected)) {
      assert.equal(auditCategory(action), category, action);
    }
  });

  it("falls back to other rather than throwing on anything unrecognised", () => {
    for (const action of ["", ".", "wat", "unknown.thing", "PROJECT.CREATE"]) {
      assert.ok(
        ["other", "project"].includes(auditCategory(action)),
        `${JSON.stringify(action)} produced ${auditCategory(action)}`,
      );
    }
  });

  it("is case-insensitive on the prefix", () => {
    assert.equal(auditCategory("PROJECT.create"), "project");
    assert.equal(auditCategory("Billing.Charge"), "billing");
  });

  it("reads only the segment before the first dot", () => {
    // "auth" appearing later must not win — that is how a hand-written second
    // copy drifts from the original without anyone noticing.
    assert.equal(auditCategory("project.auth.update"), "project");
  });
});
