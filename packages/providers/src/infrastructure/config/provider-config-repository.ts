import type {
  ProviderCapability,
  ProviderConfig,
  ProviderDomain,
  ProviderIdentity,
  ProviderKind,
  RetryPolicy,
} from '../../core/types';
import { isProviderCapability } from '../../core/types';
import type { SqlExecutor, SqlRow } from '../db/sql-executor';

export interface ProviderRuntimeConfig extends ProviderConfig {
  baseUrl?: string;
  authStrategy: string;
  secretRef?: string;
  headers: Readonly<Record<string, string>>;
  requestTemplate: Readonly<Record<string, unknown>>;
}

export interface ProviderConfigRepository {
  getByCode(code: string): Promise<ProviderRuntimeConfig | undefined>;
  listEnabled(domain?: ProviderDomain): Promise<ProviderRuntimeConfig[]>;
}

interface ProviderDbRow extends SqlRow {
  id: string;
  code: string;
  display_name: string;
  provider_type: string;
  enabled: boolean;
  priority: number;
  weight: number | string;
  capabilities: unknown;
  config_id: string | null;
  base_url: string | null;
  auth_strategy: string | null;
  secret_ref: string | null;
  headers_template: unknown;
  request_template: unknown;
  timeout_ms: number | null;
  retry_policy: unknown;
  cache_ttl_seconds: number | null;
  mapping_version: number | null;
  config_version: number | null;
}

const PROVIDER_QUERY = `
select
  p.id,
  p.code,
  p.display_name,
  p.provider_type,
  p.enabled,
  p.priority,
  p.weight,
  coalesce(cap.capabilities, array[]::text[]) as capabilities,
  cfg.id as config_id,
  cfg.base_url,
  cfg.auth_strategy,
  cfg.secret_ref,
  cfg.headers_template,
  cfg.request_template,
  cfg.timeout_ms,
  cfg.retry_policy,
  cfg.cache_ttl_seconds,
  cfg.mapping_version,
  cfg.config_version
from control.providers p
left join lateral (
  select c.*
  from control.provider_configs c
  where c.provider_id = p.id and c.is_current = true
  order by c.config_version desc
  limit 1
) cfg on true
left join lateral (
  select array_agg(pc.capability order by pc.capability) as capabilities
  from control.provider_capabilities pc
  where pc.provider_id = p.id and pc.enabled = true
) cap on true
`;

export class PostgresProviderConfigRepository implements ProviderConfigRepository {
  constructor(private readonly db: SqlExecutor) {}

  async getByCode(code: string): Promise<ProviderRuntimeConfig | undefined> {
    const rows = await this.db.query<ProviderDbRow>(`${PROVIDER_QUERY} where p.code = $1 limit 1`, [code]);
    const row = rows[0];
    return row ? mapRow(row) : undefined;
  }

  async listEnabled(domain?: ProviderDomain): Promise<ProviderRuntimeConfig[]> {
    const rows = await this.db.query<ProviderDbRow>(`${PROVIDER_QUERY} where p.enabled = true order by p.priority asc, p.code asc`);
    const configs = rows.map(mapRow);
    return domain ? configs.filter((item) => item.identity.domain === domain) : configs;
  }
}

export type EnvironmentSource = Readonly<Record<string, string | undefined>>;

export class EnvironmentOverlayProviderConfigRepository implements ProviderConfigRepository {
  constructor(
    private readonly inner: ProviderConfigRepository,
    private readonly env: EnvironmentSource = runtimeEnvironment(),
  ) {}

  async getByCode(code: string): Promise<ProviderRuntimeConfig | undefined> {
    const config = await this.inner.getByCode(code);
    return config ? applyEnvironment(config, this.env) : undefined;
  }

  async listEnabled(domain?: ProviderDomain): Promise<ProviderRuntimeConfig[]> {
    const configs = await this.inner.listEnabled(domain);
    return configs.map((config) => applyEnvironment(config, this.env)).filter((config) => config.identity.enabled);
  }
}

export class StaticProviderConfigRepository implements ProviderConfigRepository {
  constructor(private readonly configs: readonly ProviderRuntimeConfig[]) {}

  async getByCode(code: string): Promise<ProviderRuntimeConfig | undefined> {
    return this.configs.find((config) => config.identity.code === code);
  }

  async listEnabled(domain?: ProviderDomain): Promise<ProviderRuntimeConfig[]> {
    return this.configs.filter((config) => config.identity.enabled && (!domain || config.identity.domain === domain));
  }
}

function mapRow(row: ProviderDbRow): ProviderRuntimeConfig {
  const kind = parseKind(row.provider_type);
  const identity: ProviderIdentity = {
    id: row.id,
    code: row.code,
    displayName: row.display_name,
    domain: domainForKind(kind),
    kind,
    enabled: row.enabled,
    priority: row.priority,
    weight: Number(row.weight),
    capabilities: parseCapabilities(row.capabilities),
  };

  const config: ProviderRuntimeConfig = {
    identity,
    authStrategy: row.auth_strategy ?? 'NONE',
    headers: stringRecord(row.headers_template),
    requestTemplate: objectRecord(row.request_template),
    timeoutMs: row.timeout_ms ?? 8_000,
    retryPolicy: parseRetryPolicy(row.retry_policy),
    cacheTtlSeconds: row.cache_ttl_seconds ?? 300,
    mappingVersion: row.mapping_version ?? 1,
    configVersion: row.config_version ?? 1,
  };
  if (row.base_url) config.baseUrl = row.base_url;
  if (row.secret_ref) config.secretRef = row.secret_ref;
  return config;
}

function parseKind(value: string): ProviderKind {
  const allowed: readonly ProviderKind[] = [
    'MOVIE_CATALOG', 'MOVIE_PLAYBACK', 'IPTV_PLAYLIST', 'IPTV_EPG',
    'FOOTBALL_DATA', 'FOOTBALL_STREAM', 'YOUTUBE_VIDEO', 'GENERIC_VIDEO',
  ];
  if ((allowed as readonly string[]).includes(value)) return value as ProviderKind;
  throw new Error(`Unsupported provider_type from database: ${value}`);
}

function domainForKind(kind: ProviderKind): ProviderDomain {
  if (kind === 'MOVIE_CATALOG' || kind === 'MOVIE_PLAYBACK') return 'MOVIES';
  if (kind === 'IPTV_PLAYLIST' || kind === 'IPTV_EPG') return 'TV';
  if (kind === 'FOOTBALL_DATA' || kind === 'FOOTBALL_STREAM') return 'FOOTBALL';
  if (kind === 'YOUTUBE_VIDEO') return 'YOUTUBE';
  return 'VIDEO';
}

function parseCapabilities(value: unknown): ProviderCapability[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ProviderCapability => typeof item === 'string' && isProviderCapability(item));
}

function parseRetryPolicy(value: unknown): RetryPolicy {
  const object = objectRecord(value);
  return {
    attempts: positiveInteger(object.attempts, 2),
    retryTimeout: booleanValue(object.retryTimeout ?? object.retry_timeout, true),
    retry5xx: booleanValue(object.retry5xx ?? object.retry_5xx, true),
    retry429: booleanValue(object.retry429 ?? object.retry_429, true),
  };
}

function applyEnvironment(config: ProviderRuntimeConfig, env: EnvironmentSource): ProviderRuntimeConfig {
  const prefix = `FULLMEDIA_PROVIDER_${config.identity.code.replace(/[^A-Za-z0-9]/g, '_').toUpperCase()}_`;
  const enabled = parseOptionalBoolean(env[`${prefix}ENABLED`]);
  const priority = parseOptionalNumber(env[`${prefix}PRIORITY`]);
  const weight = parseOptionalNumber(env[`${prefix}WEIGHT`]);
  const timeoutMs = parseOptionalNumber(env[`${prefix}TIMEOUT_MS`]);
  const cacheTtl = parseOptionalNumber(env[`${prefix}CACHE_TTL_SECONDS`]);
  const headers = parseJsonStringRecord(env[`${prefix}HEADERS_JSON`]);

  const identity: ProviderIdentity = {
    ...config.identity,
    enabled: enabled ?? config.identity.enabled,
    priority: priority ?? config.identity.priority,
    weight: weight ?? config.identity.weight,
  };
  const result: ProviderRuntimeConfig = {
    ...config,
    identity,
    timeoutMs: timeoutMs ?? config.timeoutMs,
    cacheTtlSeconds: cacheTtl ?? config.cacheTtlSeconds,
    headers: headers ? { ...config.headers, ...headers } : config.headers,
  };
  const baseUrl = env[`${prefix}BASE_URL`]?.trim();
  if (baseUrl) result.baseUrl = baseUrl;
  return result;
}

function runtimeEnvironment(): EnvironmentSource {
  const candidate = (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process;
  return candidate?.env ?? {};
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringRecord(value: unknown): Record<string, string> {
  const input = objectRecord(value);
  const output: Record<string, string> = {};
  for (const [key, item] of Object.entries(input)) if (typeof item === 'string') output[key] = item;
  return output;
}

function positiveInteger(value: unknown, fallback: number): number {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function parseOptionalBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  if (['1', 'true', 'yes', 'on'].includes(value.toLowerCase())) return true;
  if (['0', 'false', 'no', 'off'].includes(value.toLowerCase())) return false;
  return undefined;
}

function parseOptionalNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function parseJsonStringRecord(value: string | undefined): Record<string, string> | undefined {
  if (!value) return undefined;
  try {
    return stringRecord(JSON.parse(value));
  } catch {
    return undefined;
  }
}
