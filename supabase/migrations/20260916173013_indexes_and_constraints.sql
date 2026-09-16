-- FULLMEDIA
-- 013: Query indexes, search indexes and uniqueness guards.

-- Canonical catalog.
create index idx_entities_domain_type_active
    on catalog.entities (domain, entity_type, is_active);

create index idx_entities_updated_at
    on catalog.entities (updated_at desc);

create unique index idx_profiles_username_ci_unique
    on public.profiles (lower(username))
    where username is not null;

create index idx_media_titles_release_year
    on catalog.media_titles (release_year desc);

create index idx_media_titles_updated_at
    on catalog.media_titles (updated_at desc);

create index idx_media_titles_title_trgm
    on catalog.media_titles using gin (normalized_title extensions.gin_trgm_ops);

create index idx_media_titles_original_title_trgm
    on catalog.media_titles using gin (original_title extensions.gin_trgm_ops)
    where original_title is not null;

create unique index idx_media_episodes_identity_unique
    on catalog.media_episodes (
        title_id,
        coalesce(season_id, '00000000-0000-0000-0000-000000000000'::uuid),
        episode_number
    );

create index idx_media_episodes_title_episode
    on catalog.media_episodes (title_id, episode_number);

-- User activity.
create index idx_watch_history_user_recent
    on public.watch_history (user_id, last_watched_at desc);

create unique index idx_watch_history_resume_unique
    on public.watch_history (
        user_id,
        entity_id,
        coalesce(episode_id, '00000000-0000-0000-0000-000000000000'::uuid)
    );

create index idx_favorites_user_created
    on public.favorites (user_id, created_at desc);

create index idx_watchlist_user_created
    on public.watchlist (user_id, created_at desc);

create index idx_devices_user_last_seen
    on public.devices (user_id, last_seen_at desc);

create unique index idx_devices_user_push_token_unique
    on public.devices (user_id, push_token)
    where push_token is not null;

-- TV / EPG.
create index idx_tv_channels_group_sort
    on catalog.tv_channels (group_id, sort_order)
    where is_active = true;

create index idx_epg_channel_time
    on catalog.epg_programmes (channel_id, starts_at, ends_at);

create index idx_epg_time_window
    on catalog.epg_programmes (starts_at, ends_at);

-- Football.
create index idx_football_matches_kickoff
    on catalog.football_matches (kickoff_at);

create index idx_football_matches_competition_kickoff
    on catalog.football_matches (competition_id, kickoff_at);

create index idx_football_matches_status_kickoff
    on catalog.football_matches (status, kickoff_at);

create index idx_football_matches_home_team
    on catalog.football_matches (home_team_id, kickoff_at desc);

create index idx_football_matches_away_team
    on catalog.football_matches (away_team_id, kickoff_at desc);

create index idx_football_matches_live
    on catalog.football_matches (kickoff_at)
    where status in ('LIVE','HALFTIME');

create index idx_football_match_events_match_order
    on catalog.football_match_events (match_id, minute, added_time, sort_order);

create index idx_football_standings_competition_season_position
    on catalog.football_standings (competition_id, season, position);

-- Video.
create index idx_video_items_channel_published
    on catalog.video_items (channel_id, published_at desc);

create index idx_video_items_type_published
    on catalog.video_items (video_type, published_at desc);

create index idx_video_playlist_items_position
    on catalog.video_playlist_items (playlist_id, position);

-- Provider engine / control plane.
create index idx_provider_refs_entity
    on catalog.provider_refs (entity_id);

create index idx_provider_refs_synced
    on catalog.provider_refs (provider_id, last_synced_at desc);

create unique index idx_provider_configs_one_current
    on control.provider_configs (provider_id)
    where is_current = true;

create index idx_providers_selection
    on control.providers (provider_type, enabled, priority);

create index idx_provider_mappings_lookup
    on control.provider_mappings (provider_id, domain, operation, enabled);

create index idx_home_sections_domain_sort
    on control.home_sections (domain, enabled, sort_order);

create index idx_playback_bindings_lookup
    on control.playback_bindings (entity_id, binding_type, enabled, priority);

create index idx_iptv_playlists_refresh
    on control.iptv_playlists (enabled, next_sync_at);

-- Operations.
create index idx_provider_health_status
    on ops.provider_health (health_status, last_checked_at);

create index idx_provider_health_events_recent
    on ops.provider_health_events (provider_id, created_at desc);

create index idx_ingestion_runs_recent
    on ops.ingestion_runs (provider_id, started_at desc);

create index idx_ingestion_runs_status
    on ops.ingestion_runs (status, started_at desc);

create index idx_playback_sessions_user_recent
    on ops.playback_sessions (user_id, started_at desc)
    where user_id is not null;

create index idx_playback_sessions_provider_recent
    on ops.playback_sessions (provider_id, started_at desc)
    where provider_id is not null;

create index idx_playback_events_session_time
    on ops.playback_events (session_id, created_at);

create index idx_admin_audit_logs_recent
    on ops.admin_audit_logs (created_at desc);

create index idx_admin_audit_resource
    on ops.admin_audit_logs (resource_type, resource_id, created_at desc);
