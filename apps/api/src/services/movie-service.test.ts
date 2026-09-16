import { describe, expect, it } from 'vitest';
import { crossProviderMovieRef } from './movie-service';

describe('crossProviderMovieRef', () => {
  it('removes known provider prefixes before engine fallback', () => {
    expect(crossProviderMovieRef('ophim:demo-series')).toBe('demo-series');
    expect(crossProviderMovieRef('kkphim:demo-series')).toBe('demo-series');
  });

  it('keeps raw or unknown references unchanged', () => {
    expect(crossProviderMovieRef('demo-series')).toBe('demo-series');
    expect(crossProviderMovieRef('catalog:demo-series')).toBe('catalog:demo-series');
  });
});
