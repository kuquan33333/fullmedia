-- FULLMEDIA
-- 006: YouTube / generic video canonical schema.

create table catalog.video_channels (
    id uuid primary key references catalog.entities(id) on delete cascade,
    title text not null,
    avatar_url text,
    banner_url text,
    subscriber_count bigint check (subscriber_count is null or subscriber_count >= 0),
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table catalog.video_items (
    id uuid primary key references catalog.entities(id) on delete cascade,
    channel_id uuid references catalog.video_channels(id) on delete set null,
    video_type text not null check (video_type in ('VIDEO','SHORT','LIVE')),
    title text not null,
    description text,
    thumbnail_url text,
    duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
    published_at timestamptz,
    view_count bigint check (view_count is null or view_count >= 0),
    embeddable boolean,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table catalog.video_playlists (
    id uuid primary key references catalog.entities(id) on delete cascade,
    channel_id uuid references catalog.video_channels(id) on delete set null,
    title text not null,
    description text,
    thumbnail_url text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table catalog.video_playlist_items (
    playlist_id uuid not null references catalog.video_playlists(id) on delete cascade,
    video_id uuid not null references catalog.video_items(id) on delete cascade,
    position integer not null check (position >= 0),
    created_at timestamptz not null default now(),
    primary key (playlist_id, video_id)
);
