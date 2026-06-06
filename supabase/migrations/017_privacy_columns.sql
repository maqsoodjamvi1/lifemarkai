-- Add privacy preference columns to profiles
alter table profiles
  add column if not exists training_opt_out  boolean not null default false,
  add column if not exists analytics_opt_out boolean not null default false,
  add column if not exists marketing_emails  boolean not null default true;
