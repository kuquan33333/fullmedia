import { BaseProvider } from '../../core/base-provider';
import { ProviderError } from '../../core/errors';
import type {
  PageResult,
  PlaybackCandidate,
  PlaybackDescriptor,
  ProviderHealthCheckResult,
  ProviderRequestContext,
} from '../../core/types';
import type { EpgProgramme, TVChannel } from '../../contracts/dtos';
import type { TVChannelQuery, TVEpgQuery, TVProvider } from '../../contracts/tv-provider';
import type { ProviderRuntimeConfig } from '../../infrastructure/config/provider-config-repository';
import {
  HttpTransportError,
  type HttpTransport,
} from '../../infrastructure/http/http-transport';
import { groupM3uEntries, normalizeExternalId, parseM3u, type M3uEntry, type M3uParseResult } from './m3u-parser';
import { parseXmltv, type XmltvParseResult } from './xmltv-parser';

export interface IptvPlaylistSource {
  id: string;
  name: string;
  url: string;
  epgUrl?: string;
  priority: number;
  headers?: Readonly<Record<string, string>>;
}

export interface IptvProviderConfig extends ProviderRuntimeConfig {
  sources: readonly IptvPlaylistSource[];
  sourceCacheTtlMs?: number;
  maxPlaylistBytes?: number;
  maxEpgBytes?: number;
}

interface CachedValue<T> {
  expiresAt: number;
  value: T;
}

const TV_CAPABILITIES = ['TV_CHANNELS', 'TV_EPG', 'TV_PLAYBACK'] as const;

export class IptvProvider extends BaseProvider<IptvProviderConfig> implements TVProvider {
  private readonly playlistCache = new Map<string, CachedValue<M3uParseResult>>();
  private readonly epgCache = new Map<string, CachedValue<XmltvParseResult>>();
  private readonly pendingPlaylist = new Map<string, Promise<M3uParseResult>>();
  private readonly pendingEpg = new Map<string, Promise<XmltvParseResult>>();

  constructor(
    private readonly transport: HttpTransport,
    config: IptvProviderConfig,
  ) {
    super(config);
  }

  async channels(query: TVChannelQuery, context: ProviderRequestContext): Promise<PageResult<TVChannel>> {
    this.assertEnabled();
    this.requireCapability('TV_CHANNELS');
    const groups = await this.loadAllEntries(context);
    const channels = [...groups.values()].map((entries) => mapChannel(entries[0]!, this.identity.id, this.identity.code));
    const filtered = channels.filter((channel) => {
      if (query.group && normalize(channel.group) !== normalize(query.group)) return false;
      if (query.search) {
        const needle = normalize(query.search);
        const haystack = normalize(`${channel.name} ${channel.shortName ?? ''} ${channel.group ?? ''}`);
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });

    const offset = cursorOffset(query.cursor);
    const limit = Math.max(1, Math.min(500, query.limit ?? 100));
    const items = filtered.slice(offset, offset + limit);
    const result: PageResult<TVChannel> = { items, total: filtered.length };
    if (offset + limit < filtered.length) result.nextCursor = String(offset + limit);
    return result;
  }

  async epg(query: TVEpgQuery, context: ProviderRequestContext): Promise<EpgProgramme[]> {
    this.assertEnabled();
    this.requireCapability('TV_EPG');
    const externalId = stripProviderPrefix(query.channelRef, this.identity.code);
    const fromMs = new Date(query.from).getTime();
    const toMs = new Date(query.to).getTime();
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) {
      throw new ProviderError({
        providerId: this.identity.id,
        code: 'INVALID_REQUEST',
        message: 'Invalid EPG time range',
        retryable: false,
      });
    }

    const programmes: EpgProgramme[] = [];
    for (const source of this.sortedSources()) {
      const parsed = await this.loadEpg(source, context);
      if (!parsed) continue;
      for (const item of parsed.programmes) {
        if (normalizeExternalId(item.channelExternalId) !== normalizeExternalId(externalId)) continue;
        const start = new Date(item.startsAt).getTime();
        const end = new Date(item.endsAt).getTime();
        if (end <= fromMs || start >= toMs) continue;
        const programme: EpgProgramme = {
          id: `${this.identity.code.toLowerCase()}:epg:${item.externalId}`,
          providerId: this.identity.id,
          externalId: item.externalId,
          channelId: `${this.identity.code.toLowerCase()}:${externalId}`,
          title: item.title,
          startsAt: item.startsAt,
          endsAt: item.endsAt,
        };
        if (item.description) programme.description = item.description;
        if (item.category) programme.category = item.category;
        programmes.push(programme);
      }
    }

    return dedupeProgrammes(programmes).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }

  async resolvePlayback(channelRef: string, context: ProviderRequestContext): Promise<PlaybackDescriptor> {
    this.assertEnabled();
    this.requireCapability('TV_PLAYBACK');
    const externalId = stripProviderPrefix(channelRef, this.identity.code);
    const entries = (await this.loadAllEntries(context)).get(normalizeExternalId(externalId)) ?? [];
    const candidates = entries.map((entry) => playbackCandidate(entry, this.identity.id));
    if (candidates.length === 0) {
      throw new ProviderError({
        providerId: this.identity.id,
        code: 'SOURCE_UNAVAILABLE',
        message: `No playable TV source for ${channelRef}`,
        retryable: true,
      });
    }
    return { primary: candidates[0]!, alternatives: candidates.slice(1) };
  }

  async healthCheck(context: ProviderRequestContext): Promise<ProviderHealthCheckResult> {
    const checkedAt = new Date().toISOString();
    if (!this.identity.enabled) return { providerId: this.identity.id, status: 'DISABLED', checkedAt };
    const source = this.sortedSources()[0];
    if (!source) {
      return {
        providerId: this.identity.id,
        status: 'DOWN',
        checkedAt,
        errorCode: 'SOURCE_UNAVAILABLE',
        errorMessage: 'No enabled IPTV playlist source configured',
      };
    }

    const startedAt = Date.now();
    try {
      const playlist = await this.loadPlaylist(source, context, true);
      if (playlist.entries.length === 0) throw new Error('Playlist contains no playable entries');
      return {
        providerId: this.identity.id,
        status: 'HEALTHY',
        checkedAt,
        latencyMs: Date.now() - startedAt,
        lastSuccessAt: checkedAt,
      };
    } catch (error) {
      const providerError = this.toProviderError(error);
      return {
        providerId: this.identity.id,
        status: providerError.retryable ? 'DEGRADED' : 'DOWN',
        checkedAt,
        latencyMs: Date.now() - startedAt,
        lastFailureAt: checkedAt,
        errorCode: providerError.code,
        errorMessage: providerError.message,
      };
    }
  }

  private async loadAllEntries(context: ProviderRequestContext): Promise<Map<string, M3uEntry[]>> {
    const grouped = new Map<string, M3uEntry[]>();
    for (const source of this.sortedSources()) {
      const playlist = await this.loadPlaylist(source, context);
      for (const [key, entries] of groupM3uEntries(playlist.entries)) {
        const current = grouped.get(key) ?? [];
        for (const entry of entries) {
          current.push({
            ...entry,
            headers: { ...(source.headers ?? {}), ...entry.headers },
            attributes: { ...entry.attributes, 'fullmedia-source-id': source.id, 'fullmedia-source-name': source.name },
          });
        }
        grouped.set(key, current);
      }
    }
    return grouped;
  }

  private async loadPlaylist(
    source: IptvPlaylistSource,
    context: ProviderRequestContext,
    force = false,
  ): Promise<M3uParseResult> {
    const cached = this.playlistCache.get(source.id);
    if (!force && cached && cached.expiresAt > Date.now()) return cached.value;
    const pending = this.pendingPlaylist.get(source.id);
    if (!force && pending) return pending;

    const promise = (async () => {
      const text = await this.fetchText(source.url, { ...(source.headers ?? {}), ...this.config.headers }, context);
      if (byteLength(text) > (this.config.maxPlaylistBytes ?? 20 * 1024 * 1024)) {
        throw new ProviderError({ providerId: this.identity.id, code: 'INVALID_RESPONSE', message: 'IPTV playlist exceeds size limit', retryable: false });
      }
      const parsed = parseM3u(text);
      this.playlistCache.set(source.id, { expiresAt: Date.now() + this.cacheTtlMs(), value: parsed });
      return parsed;
    })();
    this.pendingPlaylist.set(source.id, promise);
    try { return await promise; } finally { this.pendingPlaylist.delete(source.id); }
  }

  private async loadEpg(source: IptvPlaylistSource, context: ProviderRequestContext): Promise<XmltvParseResult | undefined> {
    let url = source.epgUrl;
    if (!url) {
      const playlist = await this.loadPlaylist(source, context);
      url = playlist.epgUrls[0];
    }
    if (!url) return undefined;

    const key = `${source.id}:${url}`;
    const cached = this.epgCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const pending = this.pendingEpg.get(key);
    if (pending) return pending;

    const promise = (async () => {
      const text = await this.fetchText(url!, { ...(source.headers ?? {}), ...this.config.headers }, context);
      if (byteLength(text) > (this.config.maxEpgBytes ?? 50 * 1024 * 1024)) {
        throw new ProviderError({ providerId: this.identity.id, code: 'INVALID_RESPONSE', message: 'XMLTV document exceeds size limit', retryable: false });
      }
      const parsed = parseXmltv(text);
      this.epgCache.set(key, { expiresAt: Date.now() + this.cacheTtlMs(), value: parsed });
      return parsed;
    })();
    this.pendingEpg.set(key, promise);
    try { return await promise; } finally { this.pendingEpg.delete(key); }
  }

  private async fetchText(
    url: string,
    headers: Readonly<Record<string, string>>,
    context: ProviderRequestContext,
  ): Promise<string> {
    try {
      const response = await this.transport.request<string>({
        url,
        method: 'GET',
        headers,
        timeoutMs: this.config.timeoutMs,
        retryPolicy: this.config.retryPolicy,
        responseType: 'text',
        ...(context.signal ? { signal: context.signal } : {}),
      });
      return response.data;
    } catch (error) {
      throw this.toProviderError(error);
    }
  }

  private sortedSources(): IptvPlaylistSource[] {
    return [...this.config.sources].sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
  }

  private cacheTtlMs(): number {
    return Math.max(5_000, this.config.sourceCacheTtlMs ?? this.config.cacheTtlSeconds * 1_000);
  }

  private toProviderError(error: unknown): ProviderError {
    if (error instanceof ProviderError) return error;
    if (error instanceof HttpTransportError) {
      if (error.kind === 'TIMEOUT') return new ProviderError({ providerId: this.identity.id, code: 'TIMEOUT', message: error.message, retryable: true, cause: error });
      if (error.kind === 'ABORTED') return new ProviderError({ providerId: this.identity.id, code: 'ABORTED', message: error.message, retryable: false, cause: error });
      if (error.kind === 'NETWORK') return new ProviderError({ providerId: this.identity.id, code: 'NETWORK', message: error.message, retryable: true, cause: error });
      if (error.status === 429) return new ProviderError({ providerId: this.identity.id, code: 'RATE_LIMITED', message: error.message, retryable: true, statusCode: 429, cause: error });
      if (error.status !== undefined && error.status >= 500) return new ProviderError({ providerId: this.identity.id, code: 'UPSTREAM_5XX', message: error.message, retryable: true, statusCode: error.status, cause: error });
      return new ProviderError({ providerId: this.identity.id, code: 'INVALID_RESPONSE', message: error.message, retryable: false, ...(error.status !== undefined ? { statusCode: error.status } : {}), cause: error });
    }
    return new ProviderError({ providerId: this.identity.id, code: 'INVALID_RESPONSE', message: error instanceof Error ? error.message : 'Invalid IPTV response', retryable: false, cause: error });
  }
}

export function createIptvProviderConfig(
  runtime: ProviderRuntimeConfig,
  sources: readonly IptvPlaylistSource[],
): IptvProviderConfig {
  return {
    ...runtime,
    identity: {
      ...runtime.identity,
      domain: 'TV',
      kind: 'IPTV_PLAYLIST',
      capabilities: TV_CAPABILITIES,
    },
    sources,
  };
}

function mapChannel(entry: M3uEntry, providerId: string, providerCode: string): TVChannel {
  const channel: TVChannel = {
    id: `${providerCode.toLowerCase()}:${entry.externalId}`,
    providerId,
    externalId: entry.externalId,
    name: entry.name,
    isHd: entry.isHd,
  };
  if (entry.tvgName && entry.tvgName !== entry.name) channel.shortName = entry.tvgName;
  if (entry.logoUrl) channel.logoUrl = entry.logoUrl;
  if (entry.group) channel.group = entry.group;
  return channel;
}

function playbackCandidate(entry: M3uEntry, providerId: string): PlaybackCandidate {
  const sourceName = entry.attributes['fullmedia-source-name'];
  return {
    id: `${providerId}:${entry.sourceKey}`,
    providerId,
    type: playbackType(entry.streamUrl),
    url: entry.streamUrl,
    isLive: true,
    ...(Object.keys(entry.headers).length > 0 ? { headers: entry.headers } : {}),
    metadata: {
      sourceKey: entry.sourceKey,
      ...(sourceName ? { sourceName } : {}),
    },
  };
}

function playbackType(url: string): PlaybackCandidate['type'] {
  const pathname = safePathname(url).toLowerCase();
  if (pathname.endsWith('.mpd')) return 'DASH';
  if (pathname.endsWith('.mp4')) return 'MP4';
  return 'HLS';
}

function safePathname(value: string): string {
  try { return new URL(value).pathname; } catch { return value; }
}

function stripProviderPrefix(value: string, providerCode: string): string {
  const prefix = `${providerCode.toLowerCase()}:`;
  return value.toLowerCase().startsWith(prefix) ? value.slice(prefix.length) : value;
}

function cursorOffset(value: string | undefined): number {
  const parsed = Number(value ?? '0');
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function normalize(value: string | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLocaleLowerCase('vi-VN')
    .replace(/\s+/g, ' ')
    .trim();
}

function dedupeProgrammes(items: EpgProgramme[]): EpgProgramme[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.channelId}|${item.startsAt}|${item.endsAt}|${normalize(item.title)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
