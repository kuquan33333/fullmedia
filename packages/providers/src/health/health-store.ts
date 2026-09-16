import type { ProviderHealthCheckResult, ProviderHealthSnapshot, ProviderHealthStatus } from '../core/types';

export interface ProviderHealthEvent {
  providerId: string;
  status: ProviderHealthStatus;
  latencyMs?: number;
  httpStatus?: number;
  errorClass?: string;
  createdAt?: string;
}

export interface ProviderHealthMetrics {
  providerId: string;
  windowMinutes: number;
  totalChecks: number;
  failedChecks: number;
  errorRate: number;
  averageLatencyMs?: number;
}

export interface ProviderHealthStore {
  get(providerId: string): Promise<ProviderHealthSnapshot | undefined>;
  set(snapshot: ProviderHealthSnapshot): Promise<void>;
  record(event: ProviderHealthEvent): Promise<void>;
  recordCheck(result: ProviderHealthCheckResult): Promise<void>;
  metrics(providerId: string, windowMinutes?: number): Promise<ProviderHealthMetrics>;
}

export class InMemoryProviderHealthStore implements ProviderHealthStore {
  private readonly items = new Map<string, ProviderHealthSnapshot>();
  private readonly events: ProviderHealthEvent[] = [];

  async get(providerId: string): Promise<ProviderHealthSnapshot | undefined> {
    return this.items.get(providerId);
  }

  async set(snapshot: ProviderHealthSnapshot): Promise<void> {
    this.items.set(snapshot.providerId, snapshot);
  }

  async record(event: ProviderHealthEvent): Promise<void> {
    this.events.push({ ...event, createdAt: event.createdAt ?? new Date().toISOString() });
  }

  async recordCheck(result: ProviderHealthCheckResult): Promise<void> {
    const previous = await this.get(result.providerId);
    const healthy = result.status === 'HEALTHY';
    const failed = result.status === 'DOWN' || result.status === 'DEGRADED';
    const consecutiveSuccesses = healthy ? (previous?.consecutiveSuccesses ?? 0) + 1 : failed ? 0 : previous?.consecutiveSuccesses ?? 0;
    const consecutiveFailures = failed ? (previous?.consecutiveFailures ?? 0) + 1 : healthy ? 0 : previous?.consecutiveFailures ?? 0;

    await this.set({
      providerId: result.providerId,
      status: result.status,
      ...(result.latencyMs !== undefined ? { latencyMs: result.latencyMs } : {}),
      lastCheckedAt: result.checkedAt,
      ...(healthy ? { lastSuccessAt: result.checkedAt } : previous?.lastSuccessAt ? { lastSuccessAt: previous.lastSuccessAt } : {}),
      ...(failed ? { lastFailureAt: result.checkedAt } : previous?.lastFailureAt ? { lastFailureAt: previous.lastFailureAt } : {}),
      consecutiveSuccesses,
      consecutiveFailures,
      ...(result.circuitOpenUntil ? { circuitOpenUntil: result.circuitOpenUntil } : {}),
    });
    await this.record({
      providerId: result.providerId,
      status: result.status,
      ...(result.latencyMs !== undefined ? { latencyMs: result.latencyMs } : {}),
      ...(result.errorCode ? { errorClass: result.errorCode } : {}),
      createdAt: result.checkedAt,
    });
  }

  async metrics(providerId: string, windowMinutes = 60): Promise<ProviderHealthMetrics> {
    const cutoff = Date.now() - windowMinutes * 60_000;
    const events = this.events.filter((event) => event.providerId === providerId && new Date(event.createdAt ?? 0).getTime() >= cutoff);
    const failures = events.filter((event) => event.status === 'DOWN' || event.status === 'DEGRADED').length;
    const latencies = events.flatMap((event) => event.latencyMs === undefined ? [] : [event.latencyMs]);
    const result: ProviderHealthMetrics = {
      providerId,
      windowMinutes,
      totalChecks: events.length,
      failedChecks: failures,
      errorRate: events.length === 0 ? 0 : failures / events.length,
    };
    if (latencies.length > 0) result.averageLatencyMs = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    return result;
  }
}
