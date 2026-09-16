-- FULLMEDIA
-- 002: Canonical entity layer shared by Movies, TV, Football and YouTube.

create table catalog.entities (
    id uuid primary key default gen_random_uuid(),
    domain text not null check (domain in ('MOVIES','TV','FOOTBALL','YOUTUBE')),
    entity_type text not null,
    canonical_key text,
    title text,
    image_url text,
    metadata jsonb not null default '{}'::jsonb,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint entities_domain_canonical_key_unique unique (domain, canonical_key)
);

comment on table catalog.entities is 'Provider-independent canonical IDs used across user activity and all media domains.';

create table catalog.genres (
    id uuid primary key default gen_random_uuid(),
    domain text not null check (domain in ('MOVIES','YOUTUBE')),
    slug text not null,
    name text not null,
    sort_order integer not null default 0,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint genres_domain_slug_unique unique (domain, slug)
);
