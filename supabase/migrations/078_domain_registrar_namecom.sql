-- Migration 078: allow 'namecom' as a domain registrar
-- Name.com is Lovable's registrar of record; add it to the CHECK constraint on
-- domain_registrations.registrar (was cloudflare|ionos in migration 069).

ALTER TABLE public.domain_registrations
  DROP CONSTRAINT IF EXISTS domain_registrations_registrar_check;

ALTER TABLE public.domain_registrations
  ADD CONSTRAINT domain_registrations_registrar_check
  CHECK (registrar IN ('cloudflare', 'ionos', 'namecom'));
