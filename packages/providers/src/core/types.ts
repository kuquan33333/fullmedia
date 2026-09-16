export type ProviderDomain = 'MOVIES' | 'TV' | 'FOOTBALL' | 'YOUTUBE' | 'VIDEO';

export type ProviderKind =
  | 'MOVIE_CATALOG'
  | 'MOVIE_PLAYBACK'
  | 'IPTV_PLAYLIST'
  | 'IPTV_EPG'
  | 'FOOTBALL_DATA'
  | 'FOOTBALL_STREAM'
  | 'YOUTUBE_VIDEO'
  | 'GENERIC_VIDEO';

export type ProviderCapability =
  | 'MOVIE_LIST'
  | 'MOVIE_SEARCH'
  | 'MOVIE_DETAIL'
  | 'MOVIE_EPISODES'
  | 'MOVIE_PLAYBACK'
  | 'TV_CHANNELS'
  | 'TV_EPG'
  | 'TV_PLAYBACK'
  | 'FOOTBALL_FIXTURES'
  | 'FOOTBALL_MATCH'
  | 'FOOTBALL_STANDINGS'
  | 'FOOTBALL_PLAYBACK'
  | 'VIDEO_HOME'
  | 'VIDEO_SEARCH'
  | 'VIDEO_DETAIL'
  | 'VIDEO_CHANNEL'
  | 'VIDEO_PLAYLIST'
  | 'VIDEO_PLAYBACK';

export type ProviderHealthStatus = 'UNKNOWN' | 'HEALTHY' | 'DEGRADED' | 'DOWN' | 'DISABLED';

export interface RetryPolicy {
  attempts: number;
  retryTimeout: boolean;
  retry5xx: boolean;
  retry429: boolean;
}

export interface ProviderIdentity {
  id: string;
  code: string;
  displayName: string;
  domain: ProviderDomain;
  kind: ProviderKind;
  enabled: boolean;
  priority: number;
  weight: number;
  capabilities: readonly ProviderCapability[];
}

export interface ProviderConfig {
  identity: ProviderIdentity;
  timeoutMs: number;
  retryPolicy: RetryPolicy;
  cacheTtlSeconds: number;
  mappingVersion: number;
  configVersion: number;
  metadata?: Readonly<Record<string, unknown>>;
}

export interface ProviderRequestContext {
  requestId: string;
  signal?: AbortSignal;
  now?: Date;
  locale?: string;
  timezone?: string;
}

export interface PageQuery {
  cursor?: string;
  limit?: number;
}

export interface PageResult<T> {
  items: T[];
  nextCursor?: string;
  total?: number;
}

export type PlaybackType = 'HLS' | 'DASH' | 'MP4' | 'EMBED';

export interface PlaybackCandidate {
  id: string;
  providerId: string;
  type: PlaybackType;
  url: string;
  isLive: boolean;
  mimeType?: string;
  expiresAt?: string;
  headers?: Readonly<Record<string, string>>;
  qualityLabel?: string;
  metadata?: Readonly<Record<string, unknown>>;
}

export interface PlaybackDescriptor {
  primary: PlaybackCandidate;
  alternatives: PlaybackCandidate[];
}

export interface ProviderHealthSnapshot {
  providerId: string;
  status: ProviderHealthStatus;
  latencyMs?: number;
  lastCheckedAt?: string;
  consecutiveFailures?: number;
  circuitOpenUntil?: string;
}

export interface ProviderHealthCheckResult extends ProviderHealthSnapshot {
  checkedAt: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface ProviderAttempt {
  providerId: string;
  providerCode: string;
  success: boolean;
  durationMs: number;
  errorCode?: string;
}

export interface ProviderExecutionResult<T> {
  data: T;
  providerId: string;
  providerCode: string;
  fallbackCount: number;
  attempts: ProviderAttempt[];
}
