import type { PageQuery } from '../../core/types';
import type { MovieListQuery } from '../../contracts/movie-provider';
import type { HttpTransport } from '../../infrastructure/http/http-transport';
import type { MovieApiProviderConfig, EndpointRequest } from './movie-api-provider-base';
import { MovieApiProviderBase } from './movie-api-provider-base';

const MOVIE_CAPABILITIES = [
  'MOVIE_LIST', 'MOVIE_SEARCH', 'MOVIE_DETAIL', 'MOVIE_EPISODES', 'MOVIE_PLAYBACK',
] as const;

export class OPhimProvider extends MovieApiProviderBase {
  constructor(transport: HttpTransport, config: MovieApiProviderConfig = createOPhimConfig()) {
    super(config, transport);
  }

  protected listEndpoint(query: MovieListQuery): EndpointRequest {
    const typeSlug = this.typeSlug(query.type);
    return {
      path: `/v1/api/danh-sach/${typeSlug ?? 'phim-moi-cap-nhat'}`,
      query: {
        page: this.pageNumber(query.cursor),
        limit: query.limit ?? 24,
        filterCategory: query.genre,
        filterCountry: query.country,
        filterYear: query.year,
      },
    };
  }

  protected searchEndpoint(query: string, page: PageQuery): EndpointRequest {
    return {
      path: '/v1/api/tim-kiem',
      query: { keyword: query, page: this.pageNumber(page.cursor), limit: page.limit ?? 24 },
    };
  }

  protected detailEndpoint(movieRef: string): EndpointRequest {
    return { path: `/v1/api/phim/${encodeURIComponent(movieRef)}` };
  }

  protected healthEndpoint(): EndpointRequest {
    return { path: '/v1/api/home' };
  }
}

export function createOPhimConfig(overrides: Partial<MovieApiProviderConfig> = {}): MovieApiProviderConfig {
  return {
    identity: overrides.identity ?? {
      id: 'ophim',
      code: 'OPHIM',
      displayName: 'OPhim',
      domain: 'MOVIES',
      kind: 'MOVIE_CATALOG',
      enabled: true,
      priority: 10,
      weight: 1,
      capabilities: MOVIE_CAPABILITIES,
    },
    baseUrl: overrides.baseUrl ?? 'https://ophim1.com',
    imageBaseUrl: overrides.imageBaseUrl ?? 'https://img.ophim.live/uploads/movies',
    authStrategy: overrides.authStrategy ?? 'NONE',
    headers: overrides.headers ?? { accept: 'application/json' },
    requestTemplate: overrides.requestTemplate ?? {},
    timeoutMs: overrides.timeoutMs ?? 8_000,
    retryPolicy: overrides.retryPolicy ?? { attempts: 2, retryTimeout: true, retry5xx: true, retry429: true },
    cacheTtlSeconds: overrides.cacheTtlSeconds ?? 300,
    mappingVersion: overrides.mappingVersion ?? 1,
    configVersion: overrides.configVersion ?? 1,
    ...(overrides.secretRef ? { secretRef: overrides.secretRef } : {}),
    ...(overrides.metadata ? { metadata: overrides.metadata } : {}),
  };
}
