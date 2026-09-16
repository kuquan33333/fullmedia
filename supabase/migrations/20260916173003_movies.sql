-- FULLMEDIA
-- 003: Movies / series canonical schema.

create table catalog.media_titles (
    id uuid primary key references catalog.entities(id) on delete cascade,
    media_type text not null check (media_type in ('MOVIE','SERIES','ANIME','TV_SHOW')),
    original_title text,
    normalized_title text not null,
    overview text,
    release_year smallint check (release_year is null or (release_year between 1888 and 2200)),
    release_date date,
    status text,
    runtime_minutes integer check (runtime_minutes is null or runtime_minutes >= 0),
    poster_url text,
    backdrop_url text,
    age_rating text,
    country_codes text[] not null default '{}',
    language_codes text[] not null default '{}',
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table catalog.media_title_genres (
    title_id uuid not null references catalog.media_titles(id) on delete cascade,
    genre_id uuid not null references catalog.genres(id) on delete restrict,
    created_at timestamptz not null default now(),
    primary key (title_id, genre_id)
);

create table catalog.media_seasons (
    id uuid primary key default gen_random_uuid(),
    title_id uuid not null references catalog.media_titles(id) on delete cascade,
    season_number integer not null check (season_number >= 0),
    name text,
    overview text,
    poster_url text,
    episode_count integer check (episode_count is null or episode_count >= 0),
    air_date date,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint media_seasons_title_number_unique unique (title_id, season_number)
);

create table catalog.media_episodes (
    id uuid primary key default gen_random_uuid(),
    title_id uuid not null references catalog.media_titles(id) on delete cascade,
    season_id uuid references catalog.media_seasons(id) on delete cascade,
    episode_number integer not null check (episode_number >= 0),
    name text,
    overview text,
    thumbnail_url text,
    duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
    air_date date,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

comment on table catalog.media_titles is 'Provider-independent movie/series records. Provider-specific IDs live in catalog.provider_refs.';
