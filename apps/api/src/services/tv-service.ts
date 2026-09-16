import { ProviderError, type EpgProgramme, type PageResult, type PlaybackDescriptor, type TVChannel } from '@fullmedia/providers';
import { TtlCache } from '../cache/ttl-cache';
import { getDatabase } from '../infrastructure/database';
import { TvCatalogRepository } from '../tv/tv-catalog-repository';

const channelListCache = new TtlCache<string, PageResult<TVChannel>>({
  defaultTtlMs: 60_000,
  maxEntries: 300,
});
const channelCache = new TtlCache<string, TVChannel>({
  defaultTtlMs: 5 * 60_000,
  maxEntries: 1_000,
});
const epgCache = new TtlCache<string, EpgProgramme[]>({
  defaultTtlMs: 60_000,
  maxEntries: 2_000,
});

export class TvService {
  private readonly repository = new TvCatalogRepository(getDatabase());

  async channels(options: {
    group?: string;
    search?: string;
    cursor?: string;
    limit?: number;
  } = {}): Promise<PageResult<TVChannel>> {
    const key = `channels:${stableKey(options)}`;
    return channelListCache.getOrLoad(
      key,
      () => this.repository.listChannels(options),
      cacheTtl('FULLMEDIA_TV_CHANNELS_CACHE_TTL_MS', 60_000),
    );
  }

  async channel(channelId: string): Promise<TVChannel> {
    return channelCache.getOrLoad(
      channelId,
      async () => {
        const channel = await this.repository.getChannel(channelId);
        if (!channel) throw new ProviderError({ providerId: 'tv-catalog', code: 'NOT_FOUND', message: 'TV channel not found', retryable: false });
        return channel;
      },
      cacheTtl('FULLMEDIA_TV_CHANNEL_CACHE_TTL_MS', 5 * 60_000),
    );
  }

  async epg(channelId: string, from: string, to: string): Promise<EpgProgramme[]> {
    validateTimeRange(from, to);
    await this.channel(channelId);
    const key = `epg:${channelId}:${from}:${to}`;
    return epgCache.getOrLoad(
      key,
      () => this.repository.getEpg(channelId, from, to),
      cacheTtl('FULLMEDIA_TV_EPG_CACHE_TTL_MS', 60_000),
    );
  }

  async playback(channelId: string): Promise<PlaybackDescriptor> {
    await this.channel(channelId);
    const descriptor = await this.repository.resolvePlayback(channelId);
    if (!descriptor) {
      throw new ProviderError({
        providerId: 'tv-catalog',
        code: 'SOURCE_UNAVAILABLE',
        message: 'No healthy TV stream source is available',
        retryable: true,
      });
    }
    // Live playback candidates are intentionally not cached here.
    return descriptor;
  }
}

export const tvService = new TvService();

function validateTimeRange(from: string, to: string): void {
  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) {
    throw new ProviderError({ providerId: 'tv-catalog', code: 'INVALID_REQUEST', message: 'Invalid EPG time range', retryable: false });
  }
  if (toMs - fromMs > 7 * 24 * 60 * 60_000) {
    throw new ProviderError({ providerId: 'tv-catalog', code: 'INVALID_REQUEST', message: 'EPG range cannot exceed 7 days', retryable: false });
  }
}

function stableKey(value: object): string {
  return JSON.stringify(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function cacheTtl(envName: string, fallback: number): number {
  const parsed = Number(process.env[envName]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
