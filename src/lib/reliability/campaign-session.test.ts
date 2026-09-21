import test from "node:test";
import assert from "node:assert/strict";
import type { Session } from "@supabase/supabase-js";
import { createCampaignCookieProvider } from "./campaign-session.ts";

test("long campaigns use refreshed cookies and subsequent SDK rotations", async () => {
  let session = { access_token: "old", expires_at: 1200 } as Session;
  let refreshes = 0;
  const cookie = createCampaignCookieProvider({
    getSession: async () => ({ data: { session }, error: null }),
    refreshSession: async () => {
      refreshes++;
      session = { access_token: "refreshed", expires_at: 5000 } as Session;
      return { data: { session }, error: null };
    },
  }, (value) => value.access_token, () => 1_000_000);
  assert.equal(await cookie(), "refreshed");
  session = { ...session, access_token: "rotated" };
  assert.equal(await cookie(), "rotated");
  assert.equal(refreshes, 1);
});

test("failed refresh never sends the expired cookie", async () => {
  const cookie = createCampaignCookieProvider({
    getSession: async () => ({ data: { session: { expires_at: 1 } as Session }, error: null }),
    refreshSession: async () => ({ data: { session: null }, error: new Error("Refresh rejected") }),
  }, () => "stale-cookie", () => 1_000_000);
  await assert.rejects(cookie(), /Refresh rejected/);
});
