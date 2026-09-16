-- FULLMEDIA
-- 005: Football competitions, teams, matches, events and standings.

create table catalog.football_competitions (
    id uuid primary key references catalog.entities(id) on delete cascade,
    name text not null,
    short_name text,
    country_code text,
    logo_url text,
    competition_type text,
    current_season text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table catalog.football_teams (
    id uuid primary key references catalog.entities(id) on delete cascade,
    name text not null,
    short_name text,
    logo_url text,
    country_code text,
    venue_name text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table catalog.football_matches (
    id uuid primary key references catalog.entities(id) on delete cascade,
    competition_id uuid references catalog.football_competitions(id) on delete set null,
    season text,
    home_team_id uuid not null references catalog.football_teams(id) on delete restrict,
    away_team_id uuid not null references catalog.football_teams(id) on delete restrict,
    kickoff_at timestamptz not null,
    status text not null default 'SCHEDULED' check (status in ('SCHEDULED','PRE_MATCH','LIVE','HALFTIME','FINISHED','POSTPONED','CANCELLED','SUSPENDED')),
    minute integer check (minute is null or minute >= 0),
    home_score integer check (home_score is null or home_score >= 0),
    away_score integer check (away_score is null or away_score >= 0),
    home_score_ht integer check (home_score_ht is null or home_score_ht >= 0),
    away_score_ht integer check (away_score_ht is null or away_score_ht >= 0),
    winner_team_id uuid references catalog.football_teams(id) on delete set null,
    venue text,
    data_updated_at timestamptz,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint football_match_teams_distinct check (home_team_id <> away_team_id)
);

create table catalog.football_match_events (
    id uuid primary key default gen_random_uuid(),
    match_id uuid not null references catalog.football_matches(id) on delete cascade,
    provider_event_id text,
    minute integer check (minute is null or minute >= 0),
    added_time integer check (added_time is null or added_time >= 0),
    event_type text not null,
    team_id uuid references catalog.football_teams(id) on delete set null,
    player_name text,
    detail text,
    sort_order integer not null default 0,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create table catalog.football_standings (
    id uuid primary key default gen_random_uuid(),
    competition_id uuid not null references catalog.football_competitions(id) on delete cascade,
    season text not null,
    team_id uuid not null references catalog.football_teams(id) on delete cascade,
    position integer not null check (position > 0),
    played integer not null default 0 check (played >= 0),
    won integer not null default 0 check (won >= 0),
    drawn integer not null default 0 check (drawn >= 0),
    lost integer not null default 0 check (lost >= 0),
    goals_for integer not null default 0,
    goals_against integer not null default 0,
    goal_difference integer not null default 0,
    points integer not null default 0,
    form text,
    updated_at timestamptz not null default now(),
    constraint football_standings_unique unique (competition_id, season, team_id)
);
