-- FULLMEDIA
-- 004: TV channels and EPG.

create table catalog.tv_channel_groups (
    id uuid primary key default gen_random_uuid(),
    slug text not null unique,
    name text not null,
    sort_order integer not null default 0,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table catalog.tv_channels (
    id uuid primary key references catalog.entities(id) on delete cascade,
    name text not null,
    short_name text,
    logo_url text,
    group_id uuid references catalog.tv_channel_groups(id) on delete set null,
    country_code text,
    language_code text,
    is_hd boolean not null default false,
    is_active boolean not null default true,
    sort_order integer not null default 0,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table catalog.epg_programmes (
    id uuid primary key default gen_random_uuid(),
    channel_id uuid not null references catalog.tv_channels(id) on delete cascade,
    external_id text,
    title text not null,
    description text,
    starts_at timestamptz not null,
    ends_at timestamptz not null,
    category text,
    poster_url text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    constraint epg_programmes_time_valid check (ends_at > starts_at)
);
