import {
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
import { getProviderRuntime } from '../providers/provider-runtime';

export class MovieService {
  async list(query: MovieListQuery, context: ProviderRequestContext): Promise<PageResult<MovieSummary>> {
    const { engine } = await getProviderRuntime();
    const result = await engine.execute<MovieProvider, PageResult<MovieSummary>>({
      domain: 'MOVIES',
      capability: 'MOVIE_LIST',
      context,
      isProvider: isMovieProvider,
      invoke: (provider, requestContext) => provider.list(query, requestContext),
    });
    return result.data;
  }

  async search(
    query: string,
    page: PageQuery,
    context: ProviderRequestContext,
  ): Promise<PageResult<MovieSummary>> {
    const { engine } = await getProviderRuntime();
    const result = await engine.execute<MovieProvider, PageResult<MovieSummary>>({
      domain: 'MOVIES',
      capability: 'MOVIE_SEARCH',
      context,
      isProvider: isMovieProvider,
      invoke: (provider, requestContext) => provider.search(query, page, requestContext),
    });
    return result.data;
  }

  async detail(movieRef: string, context: ProviderRequestContext): Promise<MovieDetail> {
    const externalRef = crossProviderMovieRef(movieRef);
    const { engine } = await getProviderRuntime();
    const result = await engine.execute<MovieProvider, MovieDetail>({
      domain: 'MOVIES',
      capability: 'MOVIE_DETAIL',
      context,
      isProvider: isMovieProvider,
      invoke: (provider, requestContext) => provider.detail(externalRef, requestContext),
    });
    return result.data;
  }

  async episodes(movieRef: string, context: ProviderRequestContext): Promise<Episode[]> {
    const externalRef = crossProviderMovieRef(movieRef);
    const { engine } = await getProviderRuntime();
    const result = await engine.execute<MovieProvider, Episode[]>({
      domain: 'MOVIES',
      capability: 'MOVIE_EPISODES',
      context,
      isProvider: isMovieProvider,
      invoke: (provider, requestContext) => provider.episodes(externalRef, requestContext),
    });
    return result.data;
  }

  async resolvePlayback(
    movieRef: string,
    episodeRef: string | undefined,
    context: ProviderRequestContext,
  ): Promise<PlaybackDescriptor> {
    const externalRef = crossProviderMovieRef(movieRef);
    const { engine } = await getProviderRuntime();
    const result = await engine.execute<MovieProvider, PlaybackDescriptor>({
      domain: 'MOVIES',
      capability: 'MOVIE_PLAYBACK',
      context,
      isProvider: isMovieProvider,
      invoke: (provider, requestContext) => provider.resolvePlayback(
        episodeRef ? { movieRef: externalRef, episodeRef } : { movieRef: externalRef },
        requestContext,
      ),
    });
    return result.data;
  }
}

export function crossProviderMovieRef(movieRef: string): string {
  const trimmed = movieRef.trim();
  const separator = trimmed.indexOf(':');
  if (separator <= 0) return trimmed;
  const prefix = trimmed.slice(0, separator).toLowerCase();
  if (prefix === 'ophim' || prefix === 'kkphim') return trimmed.slice(separator + 1);
  return trimmed;
}

export const movieService = new MovieService();
