import { describe, expect, it } from 'vitest';
import { ProviderEngine } from '../../engine/provider-engine';
import { DefaultProviderSelector } from '../../engine/provider-selector';
import { ProviderRegistry } from '../../registry/provider-registry';
import { HttpTransportError, type HttpRequestOptions, type HttpTransport, type HttpTransportResponse } from '../../infrastructure/http/http-transport';
import { isMovieProvider, type MovieProvider } from '../../contracts/movie-provider';
import { OPhimProvider } from './ophim-provider';
import { KKPhimProvider } from './kkphim-provider';

const listFixture = {
  data: {
    APP_DOMAIN_CDN_IMAGE: 'https://img.example.test/uploads/movies',
    items: [
      {
        slug: 'demo-series',
        name: 'Demo Series',
        origin_name: 'Demo Series Original',
        type: 'series',
        year: 2026,
        poster_url: 'demo-series.jpg',
        category: [{ name: 'Hành Động' }],
        country: [{ name: 'Việt Nam' }],
      },
    ],
    params: {
      pagination: { currentPage: 1, totalPages: 2, totalItems: 2 },
    },
  },
};

const detailFixture = {
  movie: {
    slug: 'demo-series',
    name: 'Demo Series',
    origin_name: 'Demo Series Original',
    type: 'series',
    year: 2026,
    poster_url: 'demo-series.jpg',
    content: '<p>Nội dung thử nghiệm.</p>',
    time: '45 phút/tập',
  },
  episodes: [
    {
      server_name: 'Server #1',
      server_data: [
        {
          name: 'Tập 1',
          slug: '1',
          link_m3u8: 'https://media.example.test/demo-series/1/master.m3u8',
          link_embed: 'https://embed.example.test/demo-series/1',
          subtitles: [
            {
              file: 'https://media.example.test/demo-series/1/vi.vtt',
              label: 'Tiếng Việt',
              lang: 'vi',
              default: true,
            },
          ],
        },
      ],
    },
  ],
};

class FixtureTransport implements HttpTransport {
  constructor(
    private readonly resolver: (options: HttpRequestOptions) => unknown,
  ) {}

  async request<T = unknown>(options: HttpRequestOptions): Promise<HttpTransportResponse<T>> {
    return {
      data: this.resolver(options) as T,
      status: 200,
      headers: {},
      url: options.url,
      durationMs: 1,
      attempts: 1,
    };
  }
}

describe('movie provider adapters', () => {
  it('normalizes OPhim list/detail/episodes/playback including subtitles', async () => {
    const transport = new FixtureTransport((options) =>
      options.url.includes('/v1/api/phim/') ? detailFixture : listFixture,
    );
    const provider = new OPhimProvider(transport);
    const context = { requestId: 'test-ophim' };

    const list = await provider.list({ limit: 24 }, context);
    expect(list.items).toHaveLength(1);
    expect(list.items[0]?.id).toBe('ophim:demo-series');
    expect(list.items[0]?.posterUrl).toContain('demo-series.jpg');
    expect(list.nextCursor).toBe('2');

    const detail = await provider.detail('demo-series', context);
    expect(detail.type).toBe('SERIES');
    expect(detail.overview).toBe('Nội dung thử nghiệm.');
    expect(detail.runtimeMinutes).toBe(45);

    const episodes = await provider.episodes('demo-series', context);
    expect(episodes).toHaveLength(1);
    expect(episodes[0]?.episodeNumber).toBe(1);
    const episodeRef = episodes[0]?.externalId;
    expect(episodeRef).toBeTruthy();

    const playback = await provider.resolvePlayback(
      episodeRef ? { movieRef: 'demo-series', episodeRef } : { movieRef: 'demo-series' },
      context,
    );
    expect(playback.primary.type).toBe('HLS');
    expect(playback.primary.url).toContain('master.m3u8');
    expect(playback.primary.subtitles?.[0]?.language).toBe('vi');
    expect(playback.alternatives[0]?.type).toBe('EMBED');
  });

  it('normalizes KKPhim detail and playback through the same canonical contract', async () => {
    const provider = new KKPhimProvider(new FixtureTransport(() => detailFixture));
    const context = { requestId: 'test-kkphim' };

    const detail = await provider.detail('demo-series', context);
    expect(detail.id).toBe('kkphim:demo-series');

    const playback = await provider.resolvePlayback({ movieRef: 'demo-series' }, context);
    expect(playback.primary.providerId).toBe('kkphim');
    expect(playback.primary.type).toBe('HLS');
  });

  it('falls back from OPhim to KKPhim on a retryable upstream failure', async () => {
    const failingTransport = new FixtureTransport(() => {
      throw new HttpTransportError({
        kind: 'HTTP_STATUS',
        status: 503,
        retryable: true,
        message: 'upstream unavailable',
      });
    });
    const healthyTransport = new FixtureTransport(() => detailFixture);

    const registry = new ProviderRegistry();
    registry.register(new OPhimProvider(failingTransport));
    registry.register(new KKPhimProvider(healthyTransport));

    const engine = new ProviderEngine(registry, new DefaultProviderSelector());
    const result = await engine.execute<MovieProvider, Awaited<ReturnType<MovieProvider['detail']>>>({
      domain: 'MOVIES',
      capability: 'MOVIE_DETAIL',
      context: { requestId: 'test-fallback' },
      isProvider: isMovieProvider,
      invoke: (provider, context) => provider.detail('demo-series', context),
    });

    expect(result.providerCode).toBe('KKPHIM');
    expect(result.fallbackCount).toBe(1);
    expect(result.attempts.map((item) => item.success)).toEqual([false, true]);
  });
});
