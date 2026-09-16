-- FULLMEDIA
-- 011: Internal trigger functions, updated_at maintenance and Auth signup provisioning.

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

revoke execute on function private.set_updated_at() from public, anon, authenticated;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.profiles (id, display_name)
    values (new.id, nullif(new.raw_user_meta_data ->> 'display_name', ''))
    on conflict (id) do nothing;

    insert into public.user_settings (user_id)
    values (new.id)
    on conflict (user_id) do nothing;

    insert into public.notification_preferences (user_id)
    values (new.id)
    on conflict (user_id) do nothing;

    return new;
end;
$$;

revoke execute on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function private.handle_new_user();

-- updated_at triggers
create trigger set_updated_at_profiles before update on public.profiles for each row execute function private.set_updated_at();
create trigger set_updated_at_user_settings before update on public.user_settings for each row execute function private.set_updated_at();
create trigger set_updated_at_devices before update on public.devices for each row execute function private.set_updated_at();
create trigger set_updated_at_notification_preferences before update on public.notification_preferences for each row execute function private.set_updated_at();
create trigger set_updated_at_watch_history before update on public.watch_history for each row execute function private.set_updated_at();

create trigger set_updated_at_entities before update on catalog.entities for each row execute function private.set_updated_at();
create trigger set_updated_at_genres before update on catalog.genres for each row execute function private.set_updated_at();
create trigger set_updated_at_media_titles before update on catalog.media_titles for each row execute function private.set_updated_at();
create trigger set_updated_at_media_seasons before update on catalog.media_seasons for each row execute function private.set_updated_at();
create trigger set_updated_at_media_episodes before update on catalog.media_episodes for each row execute function private.set_updated_at();
create trigger set_updated_at_tv_channel_groups before update on catalog.tv_channel_groups for each row execute function private.set_updated_at();
create trigger set_updated_at_tv_channels before update on catalog.tv_channels for each row execute function private.set_updated_at();
create trigger set_updated_at_football_competitions before update on catalog.football_competitions for each row execute function private.set_updated_at();
create trigger set_updated_at_football_teams before update on catalog.football_teams for each row execute function private.set_updated_at();
create trigger set_updated_at_football_matches before update on catalog.football_matches for each row execute function private.set_updated_at();
create trigger set_updated_at_football_standings before update on catalog.football_standings for each row execute function private.set_updated_at();
create trigger set_updated_at_video_channels before update on catalog.video_channels for each row execute function private.set_updated_at();
create trigger set_updated_at_video_items before update on catalog.video_items for each row execute function private.set_updated_at();
create trigger set_updated_at_video_playlists before update on catalog.video_playlists for each row execute function private.set_updated_at();
create trigger set_updated_at_epg_mappings before update on catalog.epg_mappings for each row execute function private.set_updated_at();

create trigger set_updated_at_providers before update on control.providers for each row execute function private.set_updated_at();
create trigger set_updated_at_provider_configs before update on control.provider_configs for each row execute function private.set_updated_at();
create trigger set_updated_at_provider_mappings before update on control.provider_mappings for each row execute function private.set_updated_at();
create trigger set_updated_at_feature_flags before update on control.feature_flags for each row execute function private.set_updated_at();
create trigger set_updated_at_app_config before update on control.app_config for each row execute function private.set_updated_at();
create trigger set_updated_at_home_sections before update on control.home_sections for each row execute function private.set_updated_at();
create trigger set_updated_at_iptv_playlists before update on control.iptv_playlists for each row execute function private.set_updated_at();
create trigger set_updated_at_playback_bindings before update on control.playback_bindings for each row execute function private.set_updated_at();
create trigger set_updated_at_admin_memberships before update on control.admin_memberships for each row execute function private.set_updated_at();

create trigger set_updated_at_provider_health before update on ops.provider_health for each row execute function private.set_updated_at();
create trigger set_updated_at_sync_cursors before update on ops.sync_cursors for each row execute function private.set_updated_at();
