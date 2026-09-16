-- FULLMEDIA
-- 007: Provider Engine control plane, admin configuration and provider mappings.

create table control.providers (
    id uuid primary key default gen_random_uuid(),
    code text not null unique,
    display_name text not null,
    provider_type text not null check (provider_type in ('MOVIE_CATALOG','MOVIE_PLAYBACK','IPTV_PLAYLIST','IPTV_EPG','FOOTBALL_DATA','FOOTBALL_STREAM','YOUTUBE_VIDEO','GENERIC_VIDEO')),
    enabled boolean not null default true,
    priority integer not null default 100,
    weight numeric(8,4) not null default 1.0 check (weight > 0),
    health_strategy jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table control.provider_configs (
    id uuid primary key default gen_random_uuid(),
    provider_id uuid not null references control.providers(id) on delete cascade,
    base_url text,
    auth_strategy text not null default 'NONE',
    secret_ref text,
    headers_template jsonb not null default '{}'::jsonb,
    request_template jsonb not null default '{}'::jsonb,
    timeout_ms integer not null default 8000 check (timeout_ms > 0),
    retry_policy jsonb not null default '{"attempts":2}'::jsonb,
    cache_ttl_seconds integer not null default 300 check (cache_ttl_seconds >= 0),
    mapping_version integer not null default 1 check (mapping_version > 0),
    config_version integer not null default 1 check (config_version > 0),
    is_current boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint provider_configs_version_unique unique (provider_id, config_version)
);

create table control.provider_capabilities (
    provider_id uuid not null references control.providers(id) on delete cascade,
    capability text not null,
    enabled boolean not null default true,
    created_at timestamptz not null default now(),
    primary key (provider_id, capability)
);

create table control.provider_mappings (
    id uuid primary key default gen_random_uuid(),
    provider_id uuid not null references control.providers(id) on delete cascade,
    domain text not null check (domain in ('MOVIES','TV','FOOTBALL','YOUTUBE')),
    operation text not null,
    mapping_version integer not null default 1 check (mapping_version > 0),
    mapping_json jsonb not null default '{}'::jsonb,
    enabled boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint provider_mappings_unique unique (provider_id, domain, operation, mapping_version)
);

create table catalog.provider_refs (
    id uuid primary key default gen_random_uuid(),
    entity_id uuid not null references catalog.entities(id) on delete cascade,
    provider_id uuid not null references control.providers(id) on delete cascade,
    external_id text not null,
    external_slug text,
    external_url_hash text,
    metadata_json jsonb not null default '{}'::jsonb,
    metadata_hash text,
    last_synced_at timestamptz,
    created_at timestamptz not null default now(),
    constraint provider_refs_provider_external_unique unique (provider_id, external_id)
);

create table catalog.epg_mappings (
    id uuid primary key default gen_random_uuid(),
    channel_id uuid not null references catalog.tv_channels(id) on delete cascade,
    provider_id uuid not null references control.providers(id) on delete cascade,
    external_channel_id text not null,
    confidence numeric(5,4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
    enabled boolean not null default true,
    updated_at timestamptz not null default now(),
    constraint epg_mappings_provider_external_unique unique (provider_id, external_channel_id)
);

create table control.feature_flags (
    id uuid primary key default gen_random_uuid(),
    key text not null unique,
    enabled boolean not null default false,
    platforms jsonb not null default '[]'::jsonb,
    min_app_version text,
    max_app_version text,
    rollout_percent numeric(5,2) not null default 100 check (rollout_percent >= 0 and rollout_percent <= 100),
    config jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table control.app_config (
    key text primary key,
    value jsonb not null,
    schema_version integer not null default 1 check (schema_version > 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table control.home_sections (
    id uuid primary key default gen_random_uuid(),
    domain text not null check (domain in ('MOVIES','TV','FOOTBALL','YOUTUBE')),
    section_type text not null,
    title text,
    sort_order integer not null default 0,
    enabled boolean not null default true,
    query_config jsonb not null default '{}'::jsonb,
    display_config jsonb not null default '{}'::jsonb,
    starts_at timestamptz,
    ends_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint home_sections_time_valid check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table control.iptv_playlists (
    id uuid primary key default gen_random_uuid(),
    provider_id uuid not null references control.providers(id) on delete cascade,
    name text not null,
    source_type text not null check (source_type in ('M3U_URL','M3U_FILE')),
    source_ref text not null,
    secret_ref text,
    epg_source_ref text,
    enabled boolean not null default true,
    refresh_interval_minutes integer not null default 360 check (refresh_interval_minutes > 0),
    last_sync_at timestamptz,
    next_sync_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table control.playback_bindings (
    id uuid primary key default gen_random_uuid(),
    entity_id uuid not null references catalog.entities(id) on delete cascade,
    provider_id uuid not null references control.providers(id) on delete cascade,
    binding_type text not null check (binding_type in ('IPTV_STREAM','MOVIE_STREAM','FOOTBALL_STREAM','VIDEO_STREAM')),
    source_key text,
    source_ref text,
    secret_ref text,
    priority integer not null default 100,
    weight numeric(8,4) not null default 1.0 check (weight > 0),
    headers_template jsonb not null default '{}'::jsonb,
    starts_at timestamptz,
    expires_at timestamptz,
    enabled boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint playback_bindings_expiry_valid check (expires_at is null or starts_at is null or expires_at > starts_at)
);

create table control.admin_memberships (
    user_id uuid primary key references auth.users(id) on delete cascade,
    role text not null check (role in ('SUPPORT','EDITOR','ADMIN','SUPER_ADMIN')),
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
