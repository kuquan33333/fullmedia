-- FULLMEDIA
-- 010: Operational health, ingestion, playback telemetry and audit logs.

create table ops.provider_health (
    provider_id uuid primary key references control.providers(id) on delete cascade,
    health_status text not null default 'UNKNOWN' check (health_status in ('UNKNOWN','HEALTHY','DEGRADED','DOWN','DISABLED')),
    last_checked_at timestamptz,
    last_success_at timestamptz,
    last_failure_at timestamptz,
    latency_ms integer check (latency_ms is null or latency_ms >= 0),
    consecutive_successes integer not null default 0 check (consecutive_successes >= 0),
    consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
    circuit_open_until timestamptz,
    last_error_code text,
    last_error_message text,
    updated_at timestamptz not null default now()
);

create table ops.provider_health_events (
    id uuid primary key default gen_random_uuid(),
    provider_id uuid not null references control.providers(id) on delete cascade,
    status text not null check (status in ('UNKNOWN','HEALTHY','DEGRADED','DOWN','DISABLED')),
    latency_ms integer check (latency_ms is null or latency_ms >= 0),
    http_status integer,
    error_class text,
    created_at timestamptz not null default now()
);

create table ops.ingestion_runs (
    id uuid primary key default gen_random_uuid(),
    domain text not null check (domain in ('MOVIES','TV','FOOTBALL','YOUTUBE')),
    provider_id uuid references control.providers(id) on delete set null,
    operation text not null,
    started_at timestamptz not null default now(),
    finished_at timestamptz,
    status text not null default 'RUNNING' check (status in ('RUNNING','SUCCESS','PARTIAL','FAILED','CANCELLED')),
    records_received integer not null default 0 check (records_received >= 0),
    records_created integer not null default 0 check (records_created >= 0),
    records_updated integer not null default 0 check (records_updated >= 0),
    records_skipped integer not null default 0 check (records_skipped >= 0),
    error_count integer not null default 0 check (error_count >= 0),
    cursor_before text,
    cursor_after text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    constraint ingestion_runs_time_valid check (finished_at is null or finished_at >= started_at)
);

create table ops.sync_cursors (
    provider_id uuid not null references control.providers(id) on delete cascade,
    sync_type text not null,
    cursor text,
    last_sync_at timestamptz,
    updated_at timestamptz not null default now(),
    primary key (provider_id, sync_type)
);

create table ops.playback_sessions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete set null,
    entity_id uuid references catalog.entities(id) on delete set null,
    episode_id uuid references catalog.media_episodes(id) on delete set null,
    domain text not null check (domain in ('MOVIES','TV','FOOTBALL','YOUTUBE')),
    provider_id uuid references control.providers(id) on delete set null,
    platform text check (platform is null or platform in ('IOS','ANDROID','WEB')),
    started_at timestamptz not null default now(),
    ended_at timestamptz,
    startup_ms integer check (startup_ms is null or startup_ms >= 0),
    buffer_seconds numeric(12,3) not null default 0 check (buffer_seconds >= 0),
    completion_percent numeric(5,2) check (completion_percent is null or (completion_percent >= 0 and completion_percent <= 100)),
    final_state text,
    error_code text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    constraint playback_sessions_time_valid check (ended_at is null or ended_at >= started_at)
);

create table ops.playback_events (
    id uuid primary key default gen_random_uuid(),
    session_id uuid not null references ops.playback_sessions(id) on delete cascade,
    event_type text not null,
    position_seconds integer check (position_seconds is null or position_seconds >= 0),
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create table ops.admin_audit_logs (
    id uuid primary key default gen_random_uuid(),
    actor_user_id uuid references auth.users(id) on delete set null,
    action text not null,
    resource_type text not null,
    resource_id text,
    before_json jsonb,
    after_json jsonb,
    request_id text,
    ip_hash text,
    created_at timestamptz not null default now()
);
