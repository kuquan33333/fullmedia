import type { ProviderAdapter } from '../core/provider-adapter';
import type {
  PageQuery,
  PageResult,
  PlaybackDescriptor,
  ProviderRequestContext,
} from '../core/types';
import type { Episode, MovieDetail, MovieSummary } from './dtos';

export interface MovieListQuery extends PageQuery {
  genre?: string;
  country?: string;
  year?: number;
  type?: MovieSummary['type'];
}

export interface MoviePlaybackInput {
  movieRef: string;
  episodeRef?: string;
}

export interface MovieProvider extends ProviderAdapter {
  list(query: MovieListQuery, context: ProviderRequestContext): Promise<PageResult<MovieSummary>>;
  search(query: string, page: PageQuery, context: ProviderRequestContext): Promise<PageResult<MovieSummary>>;
  detail(movieRef: string, context: ProviderRequestContext): Promise<MovieDetail>;
  episodes(movieRef: string, context: ProviderRequestContext): Promise<Episode[]>;
  resolvePlayback(input: MoviePlaybackInput, context: ProviderRequestContext): Promise<PlaybackDescriptor>;
}

export function isMovieProvider(provider: ProviderAdapter): provider is MovieProvider {
  return provider.supports('MOVIE_DETAIL') || provider.supports('MOVIE_LIST');
}
