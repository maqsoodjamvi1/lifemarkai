import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveRequirementAcceptancePack,
  evaluateRequirementAcceptance,
} from "./requirement-acceptance.ts";

test("derives a deterministic withheld pack from the prompt requirement clause", () => {
  const prompt = "Build a CRM dashboard with contacts, deal stages, tasks and a sales summary.";
  const first = deriveRequirementAcceptancePack(prompt);
  const second = deriveRequirementAcceptancePack(prompt);
  assert.equal(first.id, second.id);
  assert.deepEqual(first.checks.map((check) => check.label), [
    "contacts",
    "deal stages",
    "tasks",
    "a sales summary",
  ]);
});

test("rejects a healthy-looking artifact that omits one requested capability", () => {
  const pack = deriveRequirementAcceptancePack(
    "Build a CRM dashboard with contacts, deal stages, tasks and a sales summary.",
  );
  const result = evaluateRequirementAcceptance(
    pack,
    "<main><h1>CRM</h1><section>Contacts</section><section>Deal stages</section><section>Tasks</section></main>",
  );
  assert.equal(result.passed, false);
  assert.equal(result.passedCount, 3);
  assert.deepEqual(result.failed.map((check) => check.label), ["a sales summary"]);
});

test("accepts only when every withheld requirement is represented", () => {
  const pack = deriveRequirementAcceptancePack(
    "Build a bakery page with menu, testimonials and contact forms.",
  );
  const result = evaluateRequirementAcceptance(
    pack,
    "<main><nav>Menu</nav><h2>Testimonials</h2><form aria-label='Contact form'></form></main>",
  );
  assert.equal(result.passed, true);
});
