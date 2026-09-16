import { isTVProvider, type TVProvider } from '@fullmedia/providers';
import { getDatabase } from '../infrastructure/database';
import { getTvProviderRuntime } from '../providers/tv-provider-runtime';
import { pruneProviderBindings } from './tv-binding-maintenance';
import { TvCatalogRepository } from './tv-catalog-repository';

export interface TvSyncProviderResult {
  providerId: string;
  providerCode: string;
  channelsSeen: number;
  channelsSynced: number;
  playbackBindingsSynced: number;
  epgChannelsSynced: number;
  errors: number;
}

export interface TvSyncResult {
  startedAt: string;
  finishedAt: string;
  providers: TvSyncProviderResult[];
}

export class TvIngestionService {
  private readonly db = getDatabase();
  private readonly catalog = new TvCatalogRepository(this.db);

  async syncAll(): Promise<TvSyncResult> {
    const startedAt = new Date().toISOString();
    const runtime = await getTvProviderRuntime(true);
    const providers = runtime.registry
      .list({ domain: 'TV', enabledOnly: true })
      .filter(isTVProvider)
      .sort((a, b) => a.identity.priority - b.identity.priority || a.identity.code.localeCompare(b.identity.code));
    const epgClaimed = new Set<string>();
    const results: TvSyncProviderResult[] = [];

    for (const provider of providers) {
      const result = await this.syncProvider(provider, epgClaimed);
      results.push(result);
      await runtime.sourceRepository.markProviderSynced(provider.identity.id);
      await pruneProviderBindings(this.db, provider.identity.id, startedAt);
    }

    return { startedAt, finishedAt: new Date().toISOString(), providers: results };
  }

  private async syncProvider(
    provider: TVProvider,
    epgClaimed: Set<string>,
  ): Promise<TvSyncProviderResult> {
    const result: TvSyncProviderResult = {
      providerId: provider.identity.id,
      providerCode: provider.identity.code,
      channelsSeen: 0,
      channelsSynced: 0,
      playbackBindingsSynced: 0,
      epgChannelsSynced: 0,
      errors: 0,
    };
    const context = { requestId: `tv-sync-${provider.identity.code}-${crypto.randomUUID()}` };
    const channels = await allChannels(provider, context);
    result.channelsSeen = channels.length;

    const now = new Date();
    const from = new Date(now.getTime() - 6 * 60 * 60_000).toISOString();
    const to = new Date(now.getTime() + 48 * 60 * 60_000).toISOString();

    await mapLimit(channels, 6, async (channel) => {
      try {
        const externalId = channel.externalId;
        if (!externalId) throw new Error('Provider channel does not expose externalId');
        const canonicalId = await this.catalog.upsertChannel(provider.identity.id, channel);
        result.channelsSynced += 1;

        try {
          const playback = await provider.resolvePlayback(externalId, context);
          await this.catalog.replacePlaybackBindings(canonicalId, provider.identity.id, playback);
          result.playbackBindingsSynced += playback.alternatives.length + 1;
        } catch {
          result.errors += 1;
        }

        if (!epgClaimed.has(canonicalId) && provider.supports('TV_EPG')) {
          try {
            const programmes = await provider.epg({ channelRef: externalId, from, to }, context);
            if (programmes.length > 0) {
              await this.catalog.replaceEpg(canonicalId, provider.identity.id, externalId, programmes, from, to);
              epgClaimed.add(canonicalId);
              result.epgChannelsSynced += 1;
            }
          } catch {
            result.errors += 1;
          }
        }
      } catch {
        result.errors += 1;
      }
    });

    return result;
  }
}

async function allChannels(
  provider: TVProvider,
  context: { requestId: string },
) {
  const output: Awaited<ReturnType<TVProvider['channels']>>['items'] = [];
  let cursor: string | undefined;
  let guard = 0;
  do {
    const page = await provider.channels({ ...(cursor ? { cursor } : {}), limit: 500 }, context);
    output.push(...page.items);
    cursor = page.nextCursor;
    guard += 1;
    if (guard > 100) throw new Error(`TV provider ${provider.identity.code} pagination exceeded safety limit`);
  } while (cursor);
  return output;
}

async function mapLimit<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      await worker(items[index]!);
    }
  });
  await Promise.all(runners);
}

export const tvIngestionService = new TvIngestionService();
