import { test } from "node:test";
import assert from "node:assert/strict";
import { formatCreditAmount } from "./format-credit-amount";

test("formatCreditAmount adds a leading + for a positive amount (a grant)", () => {
  assert.equal(formatCreditAmount(50), "+50");
});

test("formatCreditAmount keeps the sign JS already puts on a negative amount (a spend)", () => {
  assert.equal(formatCreditAmount(-50), "-50");
});

test("formatCreditAmount renders zero plainly", () => {
  assert.equal(formatCreditAmount(0), "0");
});

test("formatCreditAmount handles large grants", () => {
  assert.equal(formatCreditAmount(10000), "+10000");
});
