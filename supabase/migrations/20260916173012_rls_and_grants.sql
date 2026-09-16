-- FULLMEDIA
-- 012: Row Level Security and least-privilege grants.
-- public.* is client-facing. catalog/control/ops are server-only by design.

-- Public user-owned tables.
alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.devices enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.watch_history enable row level security;
alter table public.favorites enable row level security;
alter table public.watchlist enable row level security;

revoke all privileges on table public.profiles from anon, authenticated;
revoke all privileges on table public.user_settings from anon, authenticated;
revoke all privileges on table public.devices from anon, authenticated;
revoke all privileges on table public.notification_preferences from anon, authenticated;
revoke all privileges on table public.watch_history from anon, authenticated;
revoke all privileges on table public.favorites from anon, authenticated;
revoke all privileges on table public.watchlist from anon, authenticated;

grant select, update on table public.profiles to authenticated;
grant select, update on table public.user_settings to authenticated;
grant select, insert, update, delete on table public.devices to authenticated;
grant select, update on table public.notification_preferences to authenticated;
grant select, insert, update, delete on table public.watch_history to authenticated;
grant select, insert, delete on table public.favorites to authenticated;
grant select, insert, delete on table public.watchlist to authenticated;

grant select, insert, update, delete on table public.profiles to service_role;
grant select, insert, update, delete on table public.user_settings to service_role;
grant select, insert, update, delete on table public.devices to service_role;
grant select, insert, update, delete on table public.notification_preferences to service_role;
grant select, insert, update, delete on table public.watch_history to service_role;
grant select, insert, update, delete on table public.favorites to service_role;
grant select, insert, update, delete on table public.watchlist to service_role;

create policy profiles_select_own on public.profiles
for select to authenticated
using ((select auth.uid()) = id);

create policy profiles_update_own on public.profiles
for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy user_settings_select_own on public.user_settings
for select to authenticated
using ((select auth.uid()) = user_id);

create policy user_settings_update_own on public.user_settings
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy devices_select_own on public.devices
for select to authenticated
using ((select auth.uid()) = user_id);

create policy devices_insert_own on public.devices
for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy devices_update_own on public.devices
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy devices_delete_own on public.devices
for delete to authenticated
using ((select auth.uid()) = user_id);

create policy notification_preferences_select_own on public.notification_preferences
for select to authenticated
using ((select auth.uid()) = user_id);

create policy notification_preferences_update_own on public.notification_preferences
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy watch_history_select_own on public.watch_history
for select to authenticated
using ((select auth.uid()) = user_id);

create policy watch_history_insert_own on public.watch_history
for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy watch_history_update_own on public.watch_history
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy watch_history_delete_own on public.watch_history
for delete to authenticated
using ((select auth.uid()) = user_id);

create policy favorites_select_own on public.favorites
for select to authenticated
using ((select auth.uid()) = user_id);

create policy favorites_insert_own on public.favorites
for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy favorites_delete_own on public.favorites
for delete to authenticated
using ((select auth.uid()) = user_id);

create policy watchlist_select_own on public.watchlist
for select to authenticated
using ((select auth.uid()) = user_id);

create policy watchlist_insert_own on public.watchlist
for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy watchlist_delete_own on public.watchlist
for delete to authenticated
using ((select auth.uid()) = user_id);

-- Defense in depth for non-exposed server schemas.
alter table catalog.entities enable row level security;
alter table catalog.genres enable row level security;
alter table catalog.media_titles enable row level security;
alter table catalog.media_title_genres enable row level security;
alter table catalog.media_seasons enable row level security;
alter table catalog.media_episodes enable row level security;
alter table catalog.tv_channel_groups enable row level security;
alter table catalog.tv_channels enable row level security;
alter table catalog.epg_programmes enable row level security;
alter table catalog.football_competitions enable row level security;
alter table catalog.football_teams enable row level security;
alter table catalog.football_matches enable row level security;
alter table catalog.football_match_events enable row level security;
alter table catalog.football_standings enable row level security;
alter table catalog.video_channels enable row level security;
alter table catalog.video_items enable row level security;
alter table catalog.video_playlists enable row level security;
alter table catalog.video_playlist_items enable row level security;
alter table catalog.provider_refs enable row level security;
alter table catalog.epg_mappings enable row level security;

alter table control.providers enable row level security;
alter table control.provider_configs enable row level security;
alter table control.provider_capabilities enable row level security;
alter table control.provider_mappings enable row level security;
alter table control.feature_flags enable row level security;
alter table control.app_config enable row level security;
alter table control.home_sections enable row level security;
alter table control.iptv_playlists enable row level security;
alter table control.playback_bindings enable row level security;
alter table control.admin_memberships enable row level security;

alter table ops.provider_health enable row level security;
alter table ops.provider_health_events enable row level security;
alter table ops.ingestion_runs enable row level security;
alter table ops.sync_cursors enable row level security;
alter table ops.playback_sessions enable row level security;
alter table ops.playback_events enable row level security;
alter table ops.admin_audit_logs enable row level security;

revoke all privileges on all tables in schema catalog from anon, authenticated;
revoke all privileges on all tables in schema control from anon, authenticated;
revoke all privileges on all tables in schema ops from anon, authenticated;

grant usage on schema catalog, control, ops to service_role;
grant select, insert, update, delete on all tables in schema catalog to service_role;
grant select, insert, update, delete on all tables in schema control to service_role;
grant select, insert, update, delete on all tables in schema ops to service_role;

alter default privileges in schema catalog revoke all on tables from anon, authenticated;
alter default privileges in schema control revoke all on tables from anon, authenticated;
alter default privileges in schema ops revoke all on tables from anon, authenticated;

alter default privileges in schema catalog grant select, insert, update, delete on tables to service_role;
alter default privileges in schema control grant select, insert, update, delete on tables to service_role;
alter default privileges in schema ops grant select, insert, update, delete on tables to service_role;
