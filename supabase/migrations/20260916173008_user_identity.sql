-- FULLMEDIA
-- 008: User profile, settings, devices and notification preferences.

create table public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    display_name text,
    username text,
    avatar_url text,
    locale text not null default 'vi-VN',
    timezone text not null default 'Asia/Ho_Chi_Minh',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint profiles_username_length check (username is null or char_length(username) between 3 and 32)
);

create table public.user_settings (
    user_id uuid primary key references auth.users(id) on delete cascade,
    autoplay_next boolean not null default true,
    autoplay_preview boolean not null default false,
    data_saver boolean not null default false,
    default_video_quality text not null default 'AUTO',
    subtitle_language text,
    audio_language text,
    football_notifications boolean not null default true,
    movie_notifications boolean not null default true,
    tv_autoplay boolean not null default true,
    youtube_autoplay boolean not null default true,
    privacy_json jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table public.devices (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    platform text not null check (platform in ('IOS','ANDROID','WEB')),
    device_name text,
    push_token text,
    app_version text,
    os_version text,
    last_seen_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table public.notification_preferences (
    user_id uuid primary key references auth.users(id) on delete cascade,
    movie_updates boolean not null default true,
    favorite_team_matches boolean not null default true,
    match_start boolean not null default true,
    tv_program_reminders boolean not null default true,
    product_updates boolean not null default false,
    quiet_hours_start time,
    quiet_hours_end time,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
