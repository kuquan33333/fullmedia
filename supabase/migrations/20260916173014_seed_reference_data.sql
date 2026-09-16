-- FULLMEDIA
-- 014: Reference configuration only. No fake users, movies, matches or channels.

insert into control.app_config (key, value, schema_version)
values
    ('schema_version', '{"version":1}'::jsonb, 1),
    ('maintenance_mode', 'false'::jsonb, 1),
    ('player_config', '{"autoplayNext":true,"defaultQuality":"AUTO","dataSaverQuality":"480p"}'::jsonb, 1),
    ('provider_registry_config', '{"healthCacheSeconds":30,"maxFallbackAttempts":3}'::jsonb, 1)
on conflict (key) do nothing;

insert into control.feature_flags (key, enabled, platforms, rollout_percent, config)
values
    ('football_streaming', false, '["IOS","ANDROID","WEB"]'::jsonb, 100, '{}'::jsonb),
    ('youtube_shorts', false, '["IOS","ANDROID","WEB"]'::jsonb, 100, '{}'::jsonb),
    ('new_tv_player', false, '["IOS","ANDROID","WEB"]'::jsonb, 100, '{}'::jsonb),
    ('movie_autoplay_preview', false, '["IOS","ANDROID","WEB"]'::jsonb, 100, '{}'::jsonb)
on conflict (key) do nothing;

insert into catalog.tv_channel_groups (slug, name, sort_order)
values
    ('vtv', 'VTV', 10),
    ('htv', 'HTV', 20),
    ('vtc', 'VTC', 30),
    ('thvl', 'THVL', 40),
    ('sports', 'Thể thao', 50),
    ('movies', 'Phim', 60),
    ('kids', 'Thiếu nhi', 70),
    ('international', 'Quốc tế', 80)
on conflict (slug) do nothing;
