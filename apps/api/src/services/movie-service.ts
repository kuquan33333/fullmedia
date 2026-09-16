import {
  ProviderError,
  isMovieProvider,
  type Episode,
  type MovieDetail,
  type MovieListQuery,
  type MovieProvider,
  type MovieSummary,
  type PageQuery,
  type PageResult,
  type PlaybackDescriptor,
  type ProviderRequestContext,
} from '@fullmedia/providers';
import { TtlCache } from '../cache/ttl-cache';
import { getCanonicalMovieResolver } from '../catalog/catalog-runtime';
import { isUuid } from '../catalog/canonical-movie-resolver';
import { getProviderRuntime } from '../providers/provider-runtime';

const listCache = new TtlCache<string, PageResult<MovieSummary>>({
  defaultTtlMs: 60_000,
  maxEntries: 500,
});
const detailCache = new TtlCache<string, MovieDetail>({
  defaultTtlMs: 5 * 60_000,
  maxEntries: 1_000,
});
const episodeCache = new TtlCache<string, Episode[]>({
  defaultTtlMs: 2 * 60_000,
  maxEntries: 1_000,
});

export class MovieService {
  async list(query: MovieListQuery, context: ProviderRequestContext): Promise<PageResult<MovieSummary>> {
    const key = `list:${stableKey(query)}`;
    return listCache.getOrLoad(key, async () => {
      const { engine } = await getProviderRuntime();
      const result = await engine.execute<MovieProvider, PageResult<MovieSummary>>({
        domain: 'MOVIES',
        capability: 'MOVIE_LIST',
        context,
        isProvider: isMovieProvider,
        invoke: (provider, requestContext) => provider.list(query, requestContext),
      });
      return getCanonicalMovieResolver().canonicalizePage(result.data);
    }, cacheTtl('FULLMEDIA_MOVIE_LIST_CACHE_TTL_MS', 60_000));
  }

  async search(
    query: string,
    page: PageQuery,
    context: ProviderRequestContext,
  ): Promise<PageResult<MovieSummary>> {
    const key = `search:${normalizeQuery(query)}:${stableKey(page)}`;
    return listCache.getOrLoad(key, async () => {
      const { engine } = await getProviderRuntime();
      const result = await engine.execute<MovieProvider, PageResult<MovieSummary>>({
        domain: 'MOVIES',
        capability: 'MOVIE_SEARCH',
        context,
        isProvider: isMovieProvider,
        invoke: (provider, requestContext) => provider.search(query, page, requestContext),
      });
      return getCanonicalMovieResolver().canonicalizePage(result.data);
    }, cacheTtl('FULLMEDIA_MOVIE_SEARCH_CACHE_TTL_MS', 30_000));
  }

  async detail(movieRef: string, context: ProviderRequestContext): Promise<MovieDetail> {
    const key = `detail:${movieRef}`;
    return detailCache.getOrLoad(key, async () => {
      const resolver = getCanonicalMovieResolver();
      const { engine } = await getProviderRuntime();
      const result = await engine.execute<MovieProvider, MovieDetail>({
        domain: 'MOVIES',
        capability: 'MOVIE_DETAIL',
        context,
        isProvider: isMovieProvider,
        invoke: async (provider, requestContext) => {
          const providerRef = await resolver.resolveProviderMovieRef(movieRef, provider, requestContext);
          return provider.detail(providerRef, requestContext);
        },
      });
      return resolver.canonicalizeDetail(result.data);
    }, cacheTtl('FULLMEDIA_MOVIE_DETAIL_CACHE_TTL_MS', 5 * 60_000));
  }

  async episodes(movieRef: string, context: ProviderRequestContext): Promise<Episode[]> {
    const canonicalMovieId = isUuid(movieRef) ? movieRef : (await this.detail(movieRef, context)).id;
    const key = `episodes:${canonicalMovieId}`;
    return episodeCache.getOrLoad(key, async () => {
      const resolver = getCanonicalMovieResolver();
      const { engine } = await getProviderRuntime();
      const result = await engine.execute<MovieProvider, Episode[]>({
        domain: 'MOVIES',
        capability: 'MOVIE_EPISODES',
        context,
        isProvider: isMovieProvider,
        invoke: async (provider, requestContext) => {
          const providerRef = await resolver.resolveProviderMovieRef(canonicalMovieId, provider, requestContext);
          return provider.episodes(providerRef, requestContext);
        },
      });
      return resolver.canonicalizeEpisodes(canonicalMovieId, result.data);
    }, cacheTtl('FULLMEDIA_MOVIE_EPISODES_CACHE_TTL_MS', 2 * 60_000));
  }

  async resolvePlayback(
    movieRef: string,
    episodeRef: string | undefined,
    context: ProviderRequestContext,
  ): Promise<PlaybackDescriptor> {
    const resolver = getCanonicalMovieResolver();
    const canonicalMovieId = isUuid(movieRef) ? movieRef : (await this.detail(movieRef, context)).id;
    const canonicalEpisodeNumber = resolver.episodeNumberFromRef(canonicalMovieId, episodeRef);
    const { engine } = await getProviderRuntime();

    const result = await engine.execute<MovieProvider, PlaybackDescriptor>({
      domain: 'MOVIES',
      capability: 'MOVIE_PLAYBACK',
      context,
      isProvider: isMovieProvider,
      invoke: async (provider, requestContext) => {
        const providerMovieRef = await resolver.resolveProviderMovieRef(canonicalMovieId, provider, requestContext);
        let providerEpisodeRef = episodeRef;

        if (canonicalEpisodeNumber !== undefined) {
          const providerEpisodes = await provider.episodes(providerMovieRef, requestContext);
          const providerEpisode = providerEpisodes.find((item) => item.episodeNumber === canonicalEpisodeNumber);
          if (!providerEpisode) {
            throw new ProviderError({
              providerId: provider.identity.id,
              code: 'SOURCE_UNAVAILABLE',
              message: `${provider.identity.code} has no episode ${canonicalEpisodeNumber}`,
              retryable: true,
            });
          }
          providerEpisodeRef = providerEpisode.externalId ?? providerEpisode.id;
        }

        return provider.resolvePlayback(
          providerEpisodeRef
            ? { movieRef: providerMovieRef, episodeRef: providerEpisodeRef }
            : { movieRef: providerMovieRef },
          requestContext,
        );
      },
    });

    // Playback descriptors are intentionally not cached: upstream URLs may expire or be signed.
    return result.data;
  }
}

export const movieService = new MovieService();

function normalizeQuery(value: string): string {
  return value.trim().toLocaleLowerCase('vi-VN');
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
