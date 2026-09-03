import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTH_CIRCUIT,
  getUserTimeoutMs,
  isAuthCircuitOpen,
  isNetworkishAuthError,
  noteGetUserFailure,
  noteGetUserSuccess,
  resetAuthCircuitForTests,
  shouldLogCircuitOpen,
} from "./auth-circuit.ts";

test("session present uses the fast getUser budget", () => {
  assert.equal(getUserTimeoutMs(true), AUTH_CIRCUIT.fastTimeoutMs);
  assert.equal(getUserTimeoutMs(false), AUTH_CIRCUIT.verifyTimeoutMs);
});

test("two network failures open the circuit, success closes it", () => {
  resetAuthCircuitForTests();
  const t0 = 1_000_000;
  assert.equal(isAuthCircuitOpen(t0), false);
  assert.equal(noteGetUserFailure(t0), false);
  assert.equal(isAuthCircuitOpen(t0), false);
  assert.equal(noteGetUserFailure(t0), true);
  assert.equal(isAuthCircuitOpen(t0 + 1), true);
  assert.equal(shouldLogCircuitOpen(), true);
  assert.equal(shouldLogCircuitOpen(), false);
  assert.equal(isAuthCircuitOpen(t0 + AUTH_CIRCUIT.openForMs), false);
  noteGetUserSuccess();
  assert.equal(isAuthCircuitOpen(t0 + 1), false);
});

test("networkish matcher covers the demo-day errors", () => {
  assert.equal(isNetworkishAuthError("getUser timeout"), true);
  assert.equal(isNetworkishAuthError("TypeError: fetch failed"), true);
  assert.equal(isNetworkishAuthError("getaddrinfo ENOTFOUND foo.supabase.co"), true);
  assert.equal(isNetworkishAuthError("Invalid JWT"), false);
});
