-- Migration 025: App monetization — per-app paywalls + subscriptions

CREATE TABLE IF NOT EXISTS app_monetization (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  enabled           boolean NOT NULL DEFAULT false,
  price_cents       integer NOT NULL DEFAULT 0,        -- monthly price in cents (0 = free)
  currency          text NOT NULL DEFAULT 'usd',
  trial_days        integer NOT NULL DEFAULT 0,
  stripe_price_id   text,                              -- Stripe Price object ID
  stripe_product_id text,                              -- Stripe Product object ID
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id)
);

CREATE TABLE IF NOT EXISTS app_subscriptions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  subscriber_email    text NOT NULL,
  stripe_customer_id  text,
  stripe_sub_id       text,
  status              text NOT NULL DEFAULT 'active' CHECK (status IN ('active','trialing','past_due','canceled')),
  trial_end           timestamptz,
  current_period_end  timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, subscriber_email)
);

ALTER TABLE app_monetization  ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_subscriptions ENABLE ROW LEVEL SECURITY;

-- Project owner manages their app's monetization
CREATE POLICY "owner manages monetization" ON app_monetization
  FOR ALL USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
  );

-- Project owner views their subscribers
CREATE POLICY "owner views subscribers" ON app_subscriptions
  FOR SELECT USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_app_monetization_project ON app_monetization(project_id);
CREATE INDEX IF NOT EXISTS idx_app_subscriptions_project ON app_subscriptions(project_id);
