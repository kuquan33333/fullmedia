import type { ProviderAdapter } from '../core/provider-adapter';
import type { ProviderCapability, ProviderDomain, ProviderKind } from '../core/types';

export interface ProviderFilter {
  domain?: ProviderDomain;
  kind?: ProviderKind;
  capability?: ProviderCapability;
  enabledOnly?: boolean;
}

export class ProviderRegistry {
  private readonly providers = new Map<string, ProviderAdapter>();

  register(provider: ProviderAdapter): void {
    if (this.providers.has(provider.identity.id)) {
      throw new Error(`Provider already registered: ${provider.identity.id}`);
    }
    this.providers.set(provider.identity.id, provider);
  }

  replace(provider: ProviderAdapter): void {
    this.providers.set(provider.identity.id, provider);
  }

  unregister(providerId: string): boolean {
    return this.providers.delete(providerId);
  }

  get(providerId: string): ProviderAdapter | undefined {
    return this.providers.get(providerId);
  }

  list(filter: ProviderFilter = {}): ProviderAdapter[] {
    return [...this.providers.values()].filter((provider) => {
      if (filter.domain && provider.identity.domain !== filter.domain) return false;
      if (filter.kind && provider.identity.kind !== filter.kind) return false;
      if (filter.enabledOnly !== false && !provider.identity.enabled) return false;
      if (filter.capability && !provider.supports(filter.capability)) return false;
      return true;
    });
  }
}
