-- FULLMEDIA
-- 009: User-owned activity data.

create table public.watch_history (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    entity_id uuid not null references catalog.entities(id) on delete cascade,
    episode_id uuid references catalog.media_episodes(id) on delete cascade,
    position_seconds integer not null default 0 check (position_seconds >= 0),
    duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
    completed boolean not null default false,
    last_watched_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table public.favorites (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    entity_id uuid not null references catalog.entities(id) on delete cascade,
    created_at timestamptz not null default now(),
    constraint favorites_user_entity_unique unique (user_id, entity_id)
);

create table public.watchlist (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    entity_id uuid not null references catalog.entities(id) on delete cascade,
    created_at timestamptz not null default now(),
    constraint watchlist_user_entity_unique unique (user_id, entity_id)
);
