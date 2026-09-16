import { describe, expect, it } from 'vitest';
import {
  createKKPhimConfig,
  type MovieProvider,
  type MovieSummary,
  type ProviderCapability,
} from '@fullmedia/providers';
import { CanonicalMovieResolver } from './canonical-movie-resolver';
import type {
  CanonicalMovieRecord,
  CanonicalMovieUpsertInput,
  MovieCatalogRepository,
  ProviderMovieRef,
} from './movie-catalog-repository';

const CANONICAL_ID = '11111111-1111-4111-8111-111111111111';

class FakeMovieCatalogRepository implements MovieCatalogRepository {
  readonly canonical: CanonicalMovieRecord = {
    id: CANONICAL_ID,
    canonicalKey: 'movie:series:2026:demo-series',
    title: 'Demo Series',
    originalTitle: 'Demo Series Original',
    normalizedTitle: 'demo series',
    type: 'SERIES',
    releaseYear: 2026,
  };

  private readonly refs = new Map<string, ProviderMovieRef>();

  async findById(id: string): Promise<CanonicalMovieRecord | undefined> {
    return id === this.canonical.id ? this.canonical : undefined;
  }

  async findByProviderRef(providerId: string, externalId: string): Promise<CanonicalMovieRecord | undefined> {
    const ref = this.refs.get(`${providerId}:${externalId}`);
    return ref?.entityId === this.canonical.id ? this.canonical : undefined;
  }

  async findProviderRef(entityId: string, providerId: string): Promise<ProviderMovieRef | undefined> {
    return [...this.refs.values()].find((ref) => ref.entityId === entityId && ref.providerId === providerId);
  }

  async resolveOrCreate(input: CanonicalMovieUpsertInput): Promise<CanonicalMovieRecord> {
    this.refs.set(`${input.providerId}:${input.externalId}`, {
      entityId: this.canonical.id,
      providerId: input.providerId,
      externalId: input.externalId,
      externalSlug: input.externalId,
    });
    return this.canonical;
  }

  async attachProviderRef(
    entityId: string,
    providerId: string,
    externalId: string,
    externalSlug = externalId,
  ): Promise<ProviderMovieRef> {
    const ref: ProviderMovieRef = { entityId, providerId, externalId, externalSlug };
    this.refs.set(`${providerId}:${externalId}`, ref);
    return ref;
  }
}

function movieProvider(searchResult: MovieSummary): MovieProvider {
  const base = createKKPhimConfig();
  const identity = {
    ...base.identity,
    id: 'provider-kkphim',
    code: 'KKPHIM',
  } as const;
  const config = { ...base, identity };

  return {
    config,
    identity,
    supports(capability: ProviderCapability) {
      return identity.capabilities.includes(capability as (typeof identity.capabilities)[number]);
    },
    async healthCheck() {
      return { providerId: identity.id, status: 'HEALTHY', checkedAt: new Date().toISOString() };
    },
    async list() {
      return { items: [searchResult] };
    },
    async search() {
      return { items: [searchResult] };
    },
    async detail() {
      return { ...searchResult, overview: 'detail' };
    },
    async episodes() {
      return [];
    },
    async resolvePlayback() {
      return {
        primary: {
          id: 'playback',
          providerId: identity.id,
          type: 'HLS',
          url: 'https://media.example.test/master.m3u8',
          isLive: false,
        },
        alternatives: [],
      };
    },
  };
}

describe('CanonicalMovieResolver', () => {
  it('replaces provider movie ids with the canonical UUID', async () => {
    const repository = new FakeMovieCatalogRepository();
    const resolver = new CanonicalMovieResolver(repository);

    const result = await resolver.canonicalizeSummary({
      id: 'ophim:demo-series',
      providerId: 'provider-ophim',
      externalId: 'demo-series',
      title: 'Demo Series',
      type: 'SERIES',
      releaseYear: 2026,
    });

    expect(result.id).toBe(CANONICAL_ID);
    expect(result.providerId).toBeUndefined();
    expect(result.externalId).toBeUndefined();
  });

  it('discovers and persists a different fallback-provider slug', async () => {
    const repository = new FakeMovieCatalogRepository();
    const resolver = new CanonicalMovieResolver(repository, { discoveryThreshold: 0.8 });
    const provider = movieProvider({
      id: 'kkphim:demo-series-ban-khac',
      providerId: 'provider-kkphim',
      externalId: 'demo-series-ban-khac',
      title: 'Demo Series',
      originalTitle: 'Demo Series Original',
      type: 'SERIES',
      releaseYear: 2026,
    });

    const externalRef = await resolver.resolveProviderMovieRef(
      CANONICAL_ID,
      provider,
      { requestId: 'canonical-discovery-test' },
    );

    expect(externalRef).toBe('demo-series-ban-khac');
    expect(await repository.findProviderRef(CANONICAL_ID, 'provider-kkphim')).toMatchObject({
      externalId: 'demo-series-ban-khac',
    });
  });

  it('returns stable canonical episode refs', () => {
    const resolver = new CanonicalMovieResolver(new FakeMovieCatalogRepository());
    const episodes = resolver.canonicalizeEpisodes(CANONICAL_ID, [
      {
        id: 'kkphim:anything',
        providerId: 'provider-kkphim',
        externalId: 'Server::tap-3',
        titleId: 'kkphim:demo-series',
        episodeNumber: 3,
        name: 'Tập 3',
      },
    ]);

    expect(episodes[0]?.id).toBe(`${CANONICAL_ID}:episode:3`);
    expect(episodes[0]?.providerId).toBeUndefined();
    expect(episodes[0]?.externalId).toBeUndefined();
  });
});
