-- FULLMEDIA
-- 015: Real provider reference configuration for OPhim and KKPhim.
-- No credentials are stored here. Admin/environment may override runtime config.

insert into control.providers (code, display_name, provider_type, enabled, priority, weight)
values
  ('OPHIM', 'OPhim', 'MOVIE_CATALOG', true, 10, 1.0),
  ('KKPHIM', 'KKPhim', 'MOVIE_CATALOG', true, 20, 1.0)
on conflict (code) do update set
  display_name = excluded.display_name,
  provider_type = excluded.provider_type,
  updated_at = now();

insert into control.provider_configs (
  provider_id, base_url, auth_strategy, headers_template, request_template,
  timeout_ms, retry_policy, cache_ttl_seconds, mapping_version, config_version, is_current
)
select
  p.id,
  case p.code
    when 'OPHIM' then 'https://ophim1.com'
    when 'KKPHIM' then 'https://phimapi.com'
  end,
  'NONE',
  '{"accept":"application/json"}'::jsonb,
  '{}'::jsonb,
  8000,
  '{"attempts":2,"retryTimeout":true,"retry5xx":true,"retry429":true}'::jsonb,
  300,
  1,
  1,
  true
from control.providers p
where p.code in ('OPHIM', 'KKPHIM')
on conflict (provider_id, config_version) do update set
  base_url = excluded.base_url,
  auth_strategy = excluded.auth_strategy,
  headers_template = excluded.headers_template,
  request_template = excluded.request_template,
  timeout_ms = excluded.timeout_ms,
  retry_policy = excluded.retry_policy,
  cache_ttl_seconds = excluded.cache_ttl_seconds,
  mapping_version = excluded.mapping_version,
  is_current = true,
  updated_at = now();

insert into control.provider_capabilities (provider_id, capability, enabled)
select p.id, capability, true
from control.providers p
cross join unnest(array[
  'MOVIE_LIST',
  'MOVIE_SEARCH',
  'MOVIE_DETAIL',
  'MOVIE_EPISODES',
  'MOVIE_PLAYBACK'
]::text[]) as capability
where p.code in ('OPHIM', 'KKPHIM')
on conflict (provider_id, capability) do update set enabled = true;
