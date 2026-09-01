-- Migration 190: allow a user to insert their own credit_packs row
--
-- Found in the billing-subsystem audit: credit_packs had RLS enabled
-- (migration 005) with a SELECT policy but no INSERT policy. Under RLS
-- semantics that denies the operation entirely for non-owner roles, so
-- createCreditPackCheckout's insert (via the RLS-scoped client, not the
-- admin client) has been silently failing on every credit-pack purchase --
-- the purchase-history/audit row is never created, and the webhook's later
-- `credit_packs` status update (matched by stripe_session_id) silently
-- matches zero rows for the same reason. This does not affect the actual
-- credit grant (the webhook credits the user from Stripe metadata,
-- independent of this table), but it means any support/refund tooling or
-- "purchase history" UI reading credit_packs sees nothing.
--
-- Scoped to the buyer's own id — team_id is accepted but application code
-- (src/lib/server-fns/billing-native.ts) already verifies the buyer is an
-- accepted member of that team before setting it, so this policy doesn't
-- need to duplicate that check.
ALTER TABLE credit_packs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "credit_packs_insert_own" ON credit_packs;
CREATE POLICY "credit_packs_insert_own" ON credit_packs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
