import type { SqlExecutor } from '@fullmedia/providers';

export async function pruneProviderBindings(
  db: SqlExecutor,
  providerId: string,
  syncStartedAt: string,
): Promise<void> {
  await db.query(`
    delete from control.playback_bindings b
    where b.provider_id = $1
      and b.binding_type = 'IPTV_STREAM'
      and not exists (
        select 1
        from catalog.provider_refs r
        where r.provider_id = $1
          and r.entity_id = b.entity_id
          and r.last_synced_at >= $2::timestamptz
      )
  `, [providerId, syncStartedAt]);
}
