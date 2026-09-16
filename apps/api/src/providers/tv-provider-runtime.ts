import {
  DbProviderHealthStore,
  DefaultProviderSelector,
  EnvironmentOverlayProviderConfigRepository,
  FetchHttpTransport,
  IptvProvider,
  PostgresProviderConfigRepository,
  ProviderEngine,
  ProviderRegistry,
  createIptvProviderConfig,
  type ProviderRuntimeConfig,
} from '@fullmedia/providers';
import { getDatabase } from '../infrastructure/database';
import { TvSourceRepository } from '../tv/tv-source-repository';

export interface TvProviderRuntime {
  registry: ProviderRegistry;
  engine: ProviderEngine;
  healthStore: DbProviderHealthStore;
  sourceRepository: TvSourceRepository;
  loadedAt: number;
}

interface GlobalTvProviderRuntimeState {
  fullmediaTvProviderRuntime?: TvProviderRuntime;
  fullmediaTvProviderRuntimePromise?: Promise<TvProviderRuntime>;
}

const globalState = globalThis as typeof globalThis & GlobalTvProviderRuntimeState;

export async function getTvProviderRuntime(forceRefresh = false): Promise<TvProviderRuntime> {
  const ttlMs = positiveInteger(process.env.FULLMEDIA_PROVIDER_REGISTRY_TTL_MS, 30_000);
  const current = globalState.fullmediaTvProviderRuntime;
  if (!forceRefresh && current && Date.now() - current.loadedAt < ttlMs) return current;
  if (!forceRefresh && globalState.fullmediaTvProviderRuntimePromise) return globalState.fullmediaTvProviderRuntimePromise;

  const pending = buildTvProviderRuntime();
  globalState.fullmediaTvProviderRuntimePromise = pending;
  try {
    const runtime = await pending;
    globalState.fullmediaTvProviderRuntime = runtime;
    return runtime;
  } finally {
    globalState.fullmediaTvProviderRuntimePromise = undefined;
  }
}

async function buildTvProviderRuntime(): Promise<TvProviderRuntime> {
  const db = getDatabase();
  const configRepository = new EnvironmentOverlayProviderConfigRepository(
    new PostgresProviderConfigRepository(db),
  );
  const sourceRepository = new TvSourceRepository(db);
  const sourceGroups = await sourceRepository.listEnabled();
  const sourcesByProvider = new Map(sourceGroups.map((group) => [group.providerId, group.sources]));
  const configs = await configRepository.listEnabled('TV');
  const healthStore = new DbProviderHealthStore(db);
  const registry = new ProviderRegistry();
  const transport = new FetchHttpTransport({
    userAgent: 'FULLMEDIA/0.2 TVProvider',
    timeoutMs: 10_000,
  });

  for (const config of configs) {
    if (config.identity.kind !== 'IPTV_PLAYLIST') continue;
    const sources = sourcesByProvider.get(config.identity.id) ?? [];
    if (sources.length === 0) continue;
    registry.register(new IptvProvider(transport, mergeTvConfig(config, sources)));
  }

  return {
    registry,
    healthStore,
    sourceRepository,
    engine: new ProviderEngine(registry, new DefaultProviderSelector(healthStore)),
    loadedAt: Date.now(),
  };
}

function mergeTvConfig(
  runtime: ProviderRuntimeConfig,
  sources: Parameters<typeof createIptvProviderConfig>[1],
) {
  const config = createIptvProviderConfig(runtime, sources);
  return {
    ...config,
    sourceCacheTtlMs: positiveInteger(
      process.env.FULLMEDIA_TV_SOURCE_CACHE_TTL_MS,
      Math.max(30_000, runtime.cacheTtlSeconds * 1_000),
    ),
    maxPlaylistBytes: positiveInteger(process.env.FULLMEDIA_TV_MAX_PLAYLIST_BYTES, 20 * 1024 * 1024),
    maxEpgBytes: positiveInteger(process.env.FULLMEDIA_TV_MAX_EPG_BYTES, 50 * 1024 * 1024),
  };
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
