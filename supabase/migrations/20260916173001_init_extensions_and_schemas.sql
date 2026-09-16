-- FULLMEDIA
-- 001: Extensions and private application schemas.
-- Target: Supabase PostgreSQL.

create schema if not exists extensions;
create schema if not exists catalog;
create schema if not exists control;
create schema if not exists ops;
create schema if not exists private;

create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

comment on schema catalog is 'Canonical media and sports entities used by FULLMEDIA.';
comment on schema control is 'Private control-plane configuration for providers, feature flags and admin.';
comment on schema ops is 'Private operational telemetry, health, ingestion and audit data.';
comment on schema private is 'Non-exposed helper functions and internal database logic.';

-- Custom schemas are not intended for direct client access.
revoke all on schema catalog from public, anon, authenticated;
revoke all on schema control from public, anon, authenticated;
revoke all on schema ops from public, anon, authenticated;
revoke all on schema private from public, anon, authenticated;

grant usage on schema catalog to service_role;
grant usage on schema control to service_role;
grant usage on schema ops to service_role;
