import { CanonicalMovieResolver } from './canonical-movie-resolver';
import { PostgresMovieCatalogRepository } from './movie-catalog-repository';
import { getDatabase } from '../infrastructure/database';

interface GlobalCatalogState {
  fullmediaCanonicalMovieResolver?: CanonicalMovieResolver;
}

const globalState = globalThis as typeof globalThis & GlobalCatalogState;

export function getCanonicalMovieResolver(): CanonicalMovieResolver {
  if (globalState.fullmediaCanonicalMovieResolver) return globalState.fullmediaCanonicalMovieResolver;

  const repository = new PostgresMovieCatalogRepository(getDatabase());
  globalState.fullmediaCanonicalMovieResolver = new CanonicalMovieResolver(repository, {
    canonicalTtlMs: positiveInteger(process.env.FULLMEDIA_CANONICAL_CACHE_TTL_MS, 10 * 60_000),
    providerRefTtlMs: positiveInteger(process.env.FULLMEDIA_PROVIDER_REF_CACHE_TTL_MS, 10 * 60_000),
    maxEntries: positiveInteger(process.env.FULLMEDIA_CANONICAL_CACHE_MAX_ENTRIES, 2_000),
    discoveryLimit: positiveInteger(process.env.FULLMEDIA_PROVIDER_DISCOVERY_LIMIT, 10),
    discoveryThreshold: boundedNumber(process.env.FULLMEDIA_PROVIDER_DISCOVERY_THRESHOLD, 0.8, 0.5, 1),
  });
  return globalState.fullmediaCanonicalMovieResolver;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function boundedNumber(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}
