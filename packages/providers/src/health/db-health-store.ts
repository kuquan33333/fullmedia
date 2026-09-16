import type { ProviderHealthCheckResult, ProviderHealthSnapshot, ProviderHealthStatus } from '../core/types';
import type { SqlExecutor, SqlRow } from '../infrastructure/db/sql-executor';
import type { ProviderHealthEvent, ProviderHealthMetrics, ProviderHealthStore } from './health-store';

interface HealthRow extends SqlRow {
  provider_id: string;
  health_status: ProviderHealthStatus;
  latency_ms: number | null;
  last_checked_at: string | Date | null;
  last_success_at: string | Date | null;
  last_failure_at: string | Date | null;
  consecutive_successes: number;
  consecutive_failures: number;
  circuit_open_until: string | Date | null;
}

interface MetricsRow extends SqlRow {
  total_checks: number | string;
  failed_checks: number | string;
  average_latency_ms: number | string | null;
}

export class DbProviderHealthStore implements ProviderHealthStore {
  constructor(private readonly db: SqlExecutor) {}

  async get(providerId: string): Promise<ProviderHealthSnapshot | undefined> {
    const rows = await this.db.query<HealthRow>(`
      select provider_id, health_status, latency_ms, last_checked_at, last_success_at,
             last_failure_at, consecutive_successes, consecutive_failures, circuit_open_until
      from ops.provider_health
      where provider_id = $1
      limit 1
    `, [providerId]);
    const row = rows[0];
    if (!row) return undefined;
    return {
      providerId: row.provider_id,
      status: row.health_status,
      ...(row.latency_ms !== null ? { latencyMs: row.latency_ms } : {}),
      ...(row.last_checked_at ? { lastCheckedAt: iso(row.last_checked_at) } : {}),
      ...(row.last_success_at ? { lastSuccessAt: iso(row.last_success_at) } : {}),
      ...(row.last_failure_at ? { lastFailureAt: iso(row.last_failure_at) } : {}),
      consecutiveSuccesses: row.consecutive_successes,
      consecutiveFailures: row.consecutive_failures,
      ...(row.circuit_open_until ? { circuitOpenUntil: iso(row.circuit_open_until) } : {}),
    };
  }

  async set(snapshot: ProviderHealthSnapshot): Promise<void> {
    const checkedAt = snapshot.lastCheckedAt ?? new Date().toISOString();
    await this.db.query(`
      insert into ops.provider_health (
        provider_id, health_status, last_checked_at, last_success_at, last_failure_at,
        latency_ms, consecutive_successes, consecutive_failures, circuit_open_until, updated_at
      ) values (
        $1, $2, $3,
        case when $2 = 'HEALTHY' then $3::timestamptz else null end,
        case when $2 in ('DOWN','DEGRADED') then $3::timestamptz else null end,
        $4, $5, $6, $7, now()
      )
      on conflict (provider_id) do update set
        health_status = excluded.health_status,
        last_checked_at = excluded.last_checked_at,
        last_success_at = case when excluded.health_status = 'HEALTHY' then excluded.last_checked_at else ops.provider_health.last_success_at end,
        last_failure_at = case when excluded.health_status in ('DOWN','DEGRADED') then excluded.last_checked_at else ops.provider_health.last_failure_at end,
        latency_ms = excluded.latency_ms,
        consecutive_successes = excluded.consecutive_successes,
        consecutive_failures = excluded.consecutive_failures,
        circuit_open_until = excluded.circuit_open_until,
        updated_at = now()
    `, [
      snapshot.providerId,
      snapshot.status,
      checkedAt,
      snapshot.latencyMs ?? null,
      snapshot.consecutiveSuccesses ?? 0,
      snapshot.consecutiveFailures ?? 0,
      snapshot.circuitOpenUntil ?? null,
    ]);
  }

  async record(event: ProviderHealthEvent): Promise<void> {
    await this.db.query(`
      insert into ops.provider_health_events (
        provider_id, status, latency_ms, http_status, error_class, created_at
      ) values ($1, $2, $3, $4, $5, $6)
    `, [
      event.providerId,
      event.status,
      event.latencyMs ?? null,
      event.httpStatus ?? null,
      event.errorClass ?? null,
      event.createdAt ?? new Date().toISOString(),
    ]);
  }

  async recordCheck(result: ProviderHealthCheckResult): Promise<void> {
    const work = async (db: SqlExecutor) => {
      const failed = result.status === 'DOWN' || result.status === 'DEGRADED';
      const healthy = result.status === 'HEALTHY';
      const errorMessage = result.errorMessage ? sanitizeErrorMessage(result.errorMessage) : null;

      await db.query(`
        insert into ops.provider_health (
          provider_id, health_status, last_checked_at, last_success_at, last_failure_at,
          latency_ms, consecutive_successes, consecutive_failures, circuit_open_until,
          last_error_code, last_error_message, updated_at
        ) values (
          $1, $2, $3,
          case when $2 = 'HEALTHY' then $3::timestamptz else null end,
          case when $2 in ('DOWN','DEGRADED') then $3::timestamptz else null end,
          $4,
          case when $2 = 'HEALTHY' then 1 else 0 end,
          case when $2 in ('DOWN','DEGRADED') then 1 else 0 end,
          $5, $6, $7, now()
        )
        on conflict (provider_id) do update set
          health_status = excluded.health_status,
          last_checked_at = excluded.last_checked_at,
          last_success_at = case
            when excluded.health_status = 'HEALTHY' then excluded.last_checked_at
            else ops.provider_health.last_success_at
          end,
          last_failure_at = case
            when excluded.health_status in ('DOWN','DEGRADED') then excluded.last_checked_at
            else ops.provider_health.last_failure_at
          end,
          latency_ms = excluded.latency_ms,
          consecutive_successes = case
            when excluded.health_status = 'HEALTHY' then ops.provider_health.consecutive_successes + 1
            when excluded.health_status in ('DOWN','DEGRADED') then 0
            else ops.provider_health.consecutive_successes
          end,
          consecutive_failures = case
            when excluded.health_status in ('DOWN','DEGRADED') then ops.provider_health.consecutive_failures + 1
            when excluded.health_status = 'HEALTHY' then 0
            else ops.provider_health.consecutive_failures
          end,
          circuit_open_until = excluded.circuit_open_until,
          last_error_code = case when excluded.health_status = 'HEALTHY' then null else excluded.last_error_code end,
          last_error_message = case when excluded.health_status = 'HEALTHY' then null else excluded.last_error_message end,
          updated_at = now()
      `, [
        result.providerId,
        result.status,
        result.checkedAt,
        result.latencyMs ?? null,
        result.circuitOpenUntil ?? null,
        result.errorCode ?? null,
        errorMessage,
      ]);

      const store = db === this.db ? this : new DbProviderHealthStore(db);
      await store.record({
        providerId: result.providerId,
        status: result.status,
        ...(result.latencyMs !== undefined ? { latencyMs: result.latencyMs } : {}),
        ...(result.errorCode ? { errorClass: result.errorCode } : {}),
        createdAt: result.checkedAt,
      });

      if (!healthy && !failed && result.status === 'DISABLED') {
        // Disabled is an administrative state, not an availability failure.
      }
    };

    if (this.db.transaction) {
      await this.db.transaction(async (tx) => { await work(tx); });
    } else {
      await work(this.db);
    }
  }

  async metrics(providerId: string, windowMinutes = 60): Promise<ProviderHealthMetrics> {
    const rows = await this.db.query<MetricsRow>(`
      select
        count(*)::int as total_checks,
        count(*) filter (where status in ('DOWN','DEGRADED'))::int as failed_checks,
        avg(latency_ms)::float8 as average_latency_ms
      from ops.provider_health_events
      where provider_id = $1
        and created_at >= now() - ($2::int * interval '1 minute')
    `, [providerId, Math.max(1, Math.floor(windowMinutes))]);
    const row = rows[0];
    const total = Number(row?.total_checks ?? 0);
    const failed = Number(row?.failed_checks ?? 0);
    const result: ProviderHealthMetrics = {
      providerId,
      windowMinutes,
      totalChecks: total,
      failedChecks: failed,
      errorRate: total === 0 ? 0 : failed / total,
    };
    if (row?.average_latency_ms !== null && row?.average_latency_ms !== undefined) {
      result.averageLatencyMs = Number(row.average_latency_ms);
    }
    return result;
  }
}

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function sanitizeErrorMessage(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 500);
}
