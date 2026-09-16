import {
  DbProviderHealthStore,
  DefaultProviderSelector,
  EnvironmentOverlayProviderConfigRepository,
  FetchHttpTransport,
  KKPhimProvider,
  OPhimProvider,
  PostgresProviderConfigRepository,
  ProviderEngine,
  ProviderRegistry,
  createKKPhimConfig,
  createOPhimConfig,
  type MovieApiProviderConfig,
  type ProviderAdapter,
  type ProviderRuntimeConfig,
} from '@fullmedia/providers';
import { getDatabase } from '../infrastructure/database';

export interface ProviderRuntime {
  registry: ProviderRegistry;
  engine: ProviderEngine;
  healthStore: DbProviderHealthStore;
  loadedAt: number;
}

interface GlobalProviderRuntimeState {
  fullmediaProviderRuntime?: ProviderRuntime;
  fullmediaProviderRuntimePromise?: Promise<ProviderRuntime>;
}

const globalState = globalThis as typeof globalThis & GlobalProviderRuntimeState;

export async function getProviderRuntime(forceRefresh = false): Promise<ProviderRuntime> {
  const ttlMs = positiveInteger(process.env.FULLMEDIA_PROVIDER_REGISTRY_TTL_MS, 30_000);
  const current = globalState.fullmediaProviderRuntime;
  if (!forceRefresh && current && Date.now() - current.loadedAt < ttlMs) return current;
  if (!forceRefresh && globalState.fullmediaProviderRuntimePromise) return globalState.fullmediaProviderRuntimePromise;

  const pending = buildProviderRuntime();
  globalState.fullmediaProviderRuntimePromise = pending;
  try {
    const runtime = await pending;
    globalState.fullmediaProviderRuntime = runtime;
    return runtime;
  } finally {
    globalState.fullmediaProviderRuntimePromise = undefined;
  }
}

export async function refreshProviderHealth(): Promise<void> {
  const runtime = await getProviderRuntime();
  const context = { requestId: `health-${crypto.randomUUID()}` };
  await Promise.all(
    runtime.registry.list({ enabledOnly: true }).map(async (provider) => {
      const result = await provider.healthCheck(context);
      await runtime.healthStore.recordCheck(result);
    }),
  );
}

async function buildProviderRuntime(): Promise<ProviderRuntime> {
  const db = getDatabase();
  const repository = new EnvironmentOverlayProviderConfigRepository(
    new PostgresProviderConfigRepository(db),
  );
  const healthStore = new DbProviderHealthStore(db);
  const registry = new ProviderRegistry();
  const transport = new FetchHttpTransport({
    userAgent: 'FULLMEDIA/0.1 ProviderEngine',
    timeoutMs: 8_000,
  });

  const configs = await repository.listEnabled('MOVIES');
  for (const config of configs) {
    const provider = createProvider(config, transport);
    if (provider) registry.register(provider);
  }

  if (registry.list({ domain: 'MOVIES' }).length === 0) {
    throw new Error('No enabled MOVIES providers were loaded from control.providers');
  }

  return {
    registry,
    healthStore,
    engine: new ProviderEngine(registry, new DefaultProviderSelector(healthStore)),
    loadedAt: Date.now(),
  };
}

function createProvider(
  runtime: ProviderRuntimeConfig,
  transport: FetchHttpTransport,
): ProviderAdapter | undefined {
  if (runtime.identity.code === 'OPHIM') {
    return new OPhimProvider(transport, mergeMovieConfig(createOPhimConfig(), runtime));
  }
  if (runtime.identity.code === 'KKPHIM') {
    return new KKPhimProvider(transport, mergeMovieConfig(createKKPhimConfig(), runtime));
  }
  return undefined;
}

function mergeMovieConfig(
  defaults: MovieApiProviderConfig,
  runtime: ProviderRuntimeConfig,
): MovieApiProviderConfig {
  const configuredImageBase = runtime.requestTemplate.imageBaseUrl;
  return {
    ...defaults,
    ...runtime,
    identity: runtime.identity,
    baseUrl: runtime.baseUrl ?? defaults.baseUrl,
    imageBaseUrl:
      typeof configuredImageBase === 'string'
        ? configuredImageBase
        : defaults.imageBaseUrl,
    headers: runtime.headers,
    requestTemplate: runtime.requestTemplate,
  };
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
