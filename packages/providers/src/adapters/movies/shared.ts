import { ProviderError } from '../../core/errors';
import type { PlaybackCandidate, PlaybackDescriptor, SubtitleTrack } from '../../core/types';
import type { Episode, MovieDetail, MovieSummary } from '../../contracts/dtos';

export type UnknownRecord = Record<string, unknown>;

export interface MovieParseContext {
  providerId: string;
  providerCode: string;
  imageBaseUrl?: string;
}

export interface ParsedMoviePayload {
  movie: UnknownRecord;
  episodes: UnknownRecord[];
}

export function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : {};
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function asString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

export function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

export function parseListItems(payload: unknown): UnknownRecord[] {
  const root = asRecord(payload);
  const data = asRecord(root.data);
  const candidates = [root.items, data.items, asRecord(data.item).items];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate.map(asRecord);
  }
  return [];
}

export function parsePagination(payload: unknown): { currentPage?: number; totalPages?: number; totalItems?: number } {
  const root = asRecord(payload);
  const data = asRecord(root.data);
  const params = asRecord(data.params);
  const pagination = asRecord(root.pagination);
  const nestedPagination = asRecord(params.pagination);
  const source = Object.keys(pagination).length > 0 ? pagination : nestedPagination;
  const result: { currentPage?: number; totalPages?: number; totalItems?: number } = {};
  const currentPage = asNumber(source.currentPage);
  const totalPages = asNumber(source.totalPages ?? source.pageRanges);
  const totalItems = asNumber(source.totalItems);
  if (currentPage !== undefined) result.currentPage = currentPage;
  if (totalPages !== undefined) result.totalPages = totalPages;
  if (totalItems !== undefined) result.totalItems = totalItems;
  return result;
}

export function parseMoviePayload(payload: unknown): ParsedMoviePayload {
  const root = asRecord(payload);
  const data = asRecord(root.data);
  const movie = firstNonEmptyRecord(root.movie, data.movie, data.item, root.item);
  const episodesRaw = firstArray(root.episodes, data.episodes, movie.episodes);
  if (Object.keys(movie).length === 0) {
    throw new Error('Movie payload does not contain a movie object');
  }
  return { movie, episodes: episodesRaw.map(asRecord) };
}

export function mapMovieSummary(movie: UnknownRecord, context: MovieParseContext): MovieSummary {
  const slug = movieSlug(movie);
  const title = asString(movie.name ?? movie.title);
  if (!slug || !title) throw new Error('Movie item is missing slug or title');
  const result: MovieSummary = {
    id: providerMovieId(context.providerCode, slug),
    providerId: context.providerId,
    externalId: slug,
    title,
    type: mapMovieType(asString(movie.type)),
  };
  const originalTitle = asString(movie.origin_name ?? movie.original_name ?? movie.originalTitle);
  const poster = imageUrl(movie.poster_url ?? movie.poster, context.imageBaseUrl);
  const backdrop = imageUrl(movie.thumb_url ?? movie.thumb ?? movie.backdrop_url, context.imageBaseUrl);
  const year = asNumber(movie.year);
  const status = asString(movie.status ?? movie.episode_current);
  const genres = namesFrom(movie.category ?? movie.categories ?? movie.genres);
  const countries = namesFrom(movie.country ?? movie.countries);
  if (originalTitle) result.originalTitle = originalTitle;
  if (poster) result.posterUrl = poster;
  if (backdrop) result.backdropUrl = backdrop;
  if (year !== undefined) result.releaseYear = year;
  if (status) result.status = status;
  if (genres.length > 0) result.genres = genres;
  if (countries.length > 0) result.countries = countries;
  return result;
}

export function mapMovieDetail(movie: UnknownRecord, context: MovieParseContext): MovieDetail {
  const summary = mapMovieSummary(movie, context);
  const result: MovieDetail = { ...summary, metadata: compactMetadata(movie) };
  const overview = cleanHtml(asString(movie.content ?? movie.overview));
  const runtimeMinutes = parseRuntimeMinutes(asString(movie.time ?? movie.runtime));
  const ageRating = asString(movie.age_rating ?? movie.ageRating);
  if (overview) result.overview = overview;
  if (runtimeMinutes !== undefined) result.runtimeMinutes = runtimeMinutes;
  if (ageRating) result.ageRating = ageRating;
  return result;
}

export function mapEpisodes(movieRef: string, servers: UnknownRecord[], context: MovieParseContext): Episode[] {
  const movieId = providerMovieId(context.providerCode, normalizeMovieRef(movieRef, context.providerCode));
  const output: Episode[] = [];
  let fallbackIndex = 0;
  for (const server of servers) {
    const serverName = asString(server.server_name ?? server.name) ?? 'default';
    for (const rawEpisode of asArray(server.server_data ?? server.episodes)) {
      const episode = asRecord(rawEpisode);
      fallbackIndex += 1;
      const slug = asString(episode.slug) ?? asString(episode.name) ?? String(fallbackIndex);
      const ref = encodeEpisodeRef(serverName, slug);
      const mapped: Episode = {
        id: `${movieId}:${ref}`,
        providerId: context.providerId,
        externalId: ref,
        titleId: movieId,
        episodeNumber: parseEpisodeNumber(asString(episode.name ?? episode.slug), fallbackIndex),
      };
      const name = asString(episode.name);
      const thumbnail = imageUrl(episode.thumbnail_url ?? episode.thumb_url, context.imageBaseUrl);
      if (name) mapped.name = name;
      if (thumbnail) mapped.thumbnailUrl = thumbnail;
      output.push(mapped);
    }
  }
  return output;
}

export function mapPlayback(
  movieRef: string,
  episodeRef: string | undefined,
  servers: UnknownRecord[],
  context: MovieParseContext,
): PlaybackDescriptor {
  const flattened = flattenEpisodes(servers);
  if (flattened.length === 0) {
    throw new ProviderError({ providerId: context.providerId, code: 'SOURCE_UNAVAILABLE', message: `No playback source for ${movieRef}`, retryable: true });
  }

  const target = episodeRef ? decodeEpisodeRef(stripEpisodeIdPrefix(episodeRef, context.providerCode, movieRef)) : undefined;
  let matches = flattened;
  if (target) {
    const exact = flattened.filter((item) => item.slug === target.slug && (!target.serverName || item.serverName === target.serverName));
    const sameEpisode = flattened.filter((item) => item.slug === target.slug || item.name === target.slug);
    matches = exact.length > 0 ? [...exact, ...sameEpisode.filter((item) => !exact.includes(item))] : sameEpisode;
  } else {
    matches = flattened.slice(0, 1);
  }

  const candidates = matches.flatMap((entry) => playbackCandidates(entry, context));
  if (candidates.length === 0) {
    throw new ProviderError({ providerId: context.providerId, code: 'SOURCE_UNAVAILABLE', message: `Episode has no playable URL for ${movieRef}`, retryable: true });
  }
  return { primary: candidates[0]!, alternatives: candidates.slice(1) };
}

export function normalizeMovieRef(movieRef: string, providerCode: string): string {
  const prefix = `${providerCode.toLowerCase()}:`;
  return movieRef.toLowerCase().startsWith(prefix) ? movieRef.slice(prefix.length) : movieRef;
}

export function providerMovieId(providerCode: string, slug: string): string {
  return `${providerCode.toLowerCase()}:${slug}`;
}

export function inferImageBase(payload: unknown, fallback?: string): string | undefined {
  const root = asRecord(payload);
  const data = asRecord(root.data);
  return asString(root.pathImage ?? root.path_image ?? data.APP_DOMAIN_CDN_IMAGE ?? data.app_domain_cdn_image) ?? fallback;
}

function movieSlug(movie: UnknownRecord): string | undefined {
  return asString(movie.slug ?? movie._id ?? movie.id);
}

function mapMovieType(value: string | undefined): MovieSummary['type'] {
  const normalized = value?.toLowerCase();
  if (normalized === 'series' || normalized === 'phim-bo') return 'SERIES';
  if (normalized === 'hoathinh' || normalized === 'hoat-hinh' || normalized === 'anime') return 'ANIME';
  if (normalized === 'tvshows' || normalized === 'tv-shows') return 'TV_SHOW';
  return 'MOVIE';
}

function imageUrl(value: unknown, base?: string): string | undefined {
  const path = asString(value);
  if (!path) return undefined;
  try { return new URL(path).toString(); } catch { /* relative */ }
  if (!base) return path;
  return `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

function namesFrom(value: unknown): string[] {
  return asArray(value).flatMap((item) => {
    if (typeof item === 'string') return item.trim() ? [item.trim()] : [];
    const name = asString(asRecord(item).name);
    return name ? [name] : [];
  });
}

function cleanHtml(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const cleaned = value.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
  return cleaned || undefined;
}

function parseRuntimeMinutes(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const match = value.match(/(\d{1,4})/);
  return match?.[1] ? Number(match[1]) : undefined;
}

function compactMetadata(movie: UnknownRecord): Readonly<Record<string, unknown>> {
  const keys = ['slug', 'quality', 'lang', 'episode_current', 'episode_total', 'actor', 'director', 'tmdb', 'imdb', 'trailer_url', 'modified'];
  const result: Record<string, unknown> = {};
  for (const key of keys) if (movie[key] !== undefined) result[key] = movie[key];
  return result;
}

function parseEpisodeNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  if (/full/i.test(value)) return 1;
  const match = value.match(/(\d+(?:\.\d+)?)/);
  return match?.[1] ? Math.max(1, Math.floor(Number(match[1]))) : fallback;
}

function encodeEpisodeRef(serverName: string, slug: string): string {
  return `${encodeURIComponent(serverName)}::${encodeURIComponent(slug)}`;
}

function decodeEpisodeRef(value: string): { serverName?: string; slug: string } {
  const [server, slug] = value.split('::');
  if (slug !== undefined) return { serverName: decodeURIComponent(server ?? ''), slug: decodeURIComponent(slug) };
  return { slug: decodeURIComponent(value) };
}

function stripEpisodeIdPrefix(value: string, providerCode: string, movieRef: string): string {
  const movieId = providerMovieId(providerCode, normalizeMovieRef(movieRef, providerCode));
  return value.startsWith(`${movieId}:`) ? value.slice(movieId.length + 1) : value;
}

interface FlatEpisode {
  serverName: string;
  name: string;
  slug: string;
  data: UnknownRecord;
}

function flattenEpisodes(servers: UnknownRecord[]): FlatEpisode[] {
  const output: FlatEpisode[] = [];
  for (const server of servers) {
    const serverName = asString(server.server_name ?? server.name) ?? 'default';
    for (const raw of asArray(server.server_data ?? server.episodes)) {
      const data = asRecord(raw);
      const name = asString(data.name) ?? asString(data.slug) ?? 'Episode';
      const slug = asString(data.slug) ?? name;
      output.push({ serverName, name, slug, data });
    }
  }
  return output;
}

function playbackCandidates(entry: FlatEpisode, context: MovieParseContext): PlaybackCandidate[] {
  const subtitles = extractSubtitles(entry.data);
  const output: PlaybackCandidate[] = [];
  const m3u8 = asString(entry.data.link_m3u8 ?? entry.data.m3u8 ?? entry.data.hls);
  const embed = asString(entry.data.link_embed ?? entry.data.embed);
  if (m3u8) {
    output.push({
      id: `${context.providerId}:${entry.serverName}:${entry.slug}:hls`,
      providerId: context.providerId,
      type: 'HLS',
      url: m3u8,
      isLive: false,
      mimeType: 'application/vnd.apple.mpegurl',
      ...(subtitles.length > 0 ? { subtitles } : {}),
      metadata: { serverName: entry.serverName, episodeName: entry.name },
    });
  }
  if (embed) {
    output.push({
      id: `${context.providerId}:${entry.serverName}:${entry.slug}:embed`,
      providerId: context.providerId,
      type: 'EMBED',
      url: embed,
      isLive: false,
      ...(subtitles.length > 0 ? { subtitles } : {}),
      metadata: { serverName: entry.serverName, episodeName: entry.name },
    });
  }
  return output;
}

function extractSubtitles(episode: UnknownRecord): SubtitleTrack[] {
  const raw = firstArray(episode.subtitles, episode.subtitle, episode.tracks, episode.captions);
  return raw.flatMap((item, index) => {
    if (typeof item === 'string') return [{ id: `subtitle-${index + 1}`, url: item }];
    const record = asRecord(item);
    const url = asString(record.url ?? record.src ?? record.file);
    if (!url) return [];
    const track: SubtitleTrack = { id: asString(record.id) ?? `subtitle-${index + 1}`, url };
    const label = asString(record.label ?? record.name);
    const language = asString(record.lang ?? record.language ?? record.srclang);
    if (label) track.label = label;
    if (language) track.language = language;
    if (record.default === true) track.default = true;
    return [track];
  });
}

function firstArray(...values: unknown[]): unknown[] {
  for (const value of values) if (Array.isArray(value)) return value;
  return [];
}

function firstNonEmptyRecord(...values: unknown[]): UnknownRecord {
  for (const value of values) {
    const record = asRecord(value);
    if (Object.keys(record).length > 0) return record;
  }
  return {};
}
