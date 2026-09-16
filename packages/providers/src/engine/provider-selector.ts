import type { ProviderAdapter } from '../core/provider-adapter';
import type { ProviderHealthSnapshot, ProviderHealthStatus } from '../core/types';
import type { ProviderHealthStore } from '../health/health-store';

const HEALTH_RANK: Record<ProviderHealthStatus, number> = {
  HEALTHY: 0,
  UNKNOWN: 1,
  DEGRADED: 2,
  DOWN: 3,
  DISABLED: 4,
};

export interface ProviderSelector {
  select(candidates: ProviderAdapter[]): Promise<ProviderAdapter[]>;
}

export class DefaultProviderSelector implements ProviderSelector {
  constructor(private readonly healthStore?: ProviderHealthStore) {}

  async select(candidates: ProviderAdapter[]): Promise<ProviderAdapter[]> {
    const rows = await Promise.all(
      candidates.map(async (provider) => ({
        provider,
        health: await this.health(provider.identity.id),
      })),
    );

    return rows
      .filter(({ health }) => !this.isCircuitOpen(health))
      .sort((a, b) => {
        const healthDiff = HEALTH_RANK[a.health.status] - HEALTH_RANK[b.health.status];
        if (healthDiff !== 0) return healthDiff;

        const priorityDiff = a.provider.identity.priority - b.provider.identity.priority;
        if (priorityDiff !== 0) return priorityDiff;

        const latencyDiff = (a.health.latencyMs ?? Number.MAX_SAFE_INTEGER) - (b.health.latencyMs ?? Number.MAX_SAFE_INTEGER);
        if (latencyDiff !== 0) return latencyDiff;

        return b.provider.identity.weight - a.provider.identity.weight;
      })
      .map(({ provider }) => provider);
  }

  private async health(providerId: string): Promise<ProviderHealthSnapshot> {
    return (
      (await this.healthStore?.get(providerId)) ?? {
        providerId,
        status: 'UNKNOWN',
      }
    );
  }

  private isCircuitOpen(snapshot: ProviderHealthSnapshot): boolean {
    if (snapshot.status === 'DISABLED' || snapshot.status === 'DOWN') return true;
    if (!snapshot.circuitOpenUntil) return false;
    return new Date(snapshot.circuitOpenUntil).getTime() > Date.now();
  }
}
