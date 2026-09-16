import type { ProviderHealthSnapshot } from '../core/types';

export interface ProviderHealthStore {
  get(providerId: string): Promise<ProviderHealthSnapshot | undefined>;
  set(snapshot: ProviderHealthSnapshot): Promise<void>;
}

export class InMemoryProviderHealthStore implements ProviderHealthStore {
  private readonly items = new Map<string, ProviderHealthSnapshot>();

  async get(providerId: string): Promise<ProviderHealthSnapshot | undefined> {
    return this.items.get(providerId);
  }

  async set(snapshot: ProviderHealthSnapshot): Promise<void> {
    this.items.set(snapshot.providerId, snapshot);
  }
}
