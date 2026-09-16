import type { IptvPlaylistSource, SqlExecutor, SqlRow } from '@fullmedia/providers';

interface PlaylistRow extends SqlRow {
  id: string;
  provider_id: string;
  name: string;
  source_ref: string;
  epg_source_ref: string | null;
  created_at: string | Date;
}

export interface ProviderPlaylistSources {
  providerId: string;
  sources: IptvPlaylistSource[];
}

export class TvSourceRepository {
  constructor(private readonly db: SqlExecutor) {}

  async listEnabled(): Promise<ProviderPlaylistSources[]> {
    const rows = await this.db.query<PlaylistRow>(`
      select id, provider_id, name, source_ref, epg_source_ref, created_at
      from control.iptv_playlists
      where enabled = true
      order by provider_id, created_at asc, name asc
    `);

    const grouped = new Map<string, IptvPlaylistSource[]>();
    for (const row of rows) {
      const sources = grouped.get(row.provider_id) ?? [];
      const source: IptvPlaylistSource = {
        id: row.id,
        name: row.name,
        url: row.source_ref,
        priority: 10 + sources.length * 10,
      };
      if (row.epg_source_ref) source.epgUrl = row.epg_source_ref;
      sources.push(source);
      grouped.set(row.provider_id, sources);
    }

    return [...grouped.entries()].map(([providerId, sources]) => ({ providerId, sources }));
  }

  async markProviderSynced(providerId: string): Promise<void> {
    await this.db.query(`
      update control.iptv_playlists
      set last_sync_at = now(),
          next_sync_at = now() + (refresh_interval_minutes * interval '1 minute'),
          updated_at = now()
      where provider_id = $1 and enabled = true
    `, [providerId]);
  }
}
