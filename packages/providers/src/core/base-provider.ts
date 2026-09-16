import { ProviderError } from './errors';
import type { ProviderAdapter } from './provider-adapter';
import type {
  ProviderCapability,
  ProviderConfig,
  ProviderHealthCheckResult,
  ProviderIdentity,
  ProviderRequestContext,
} from './types';

export abstract class BaseProvider<TConfig extends ProviderConfig = ProviderConfig>
  implements ProviderAdapter<TConfig>
{
  readonly config: Readonly<TConfig>;

  protected constructor(config: TConfig) {
    this.config = Object.freeze(config);
  }

  get identity(): Readonly<ProviderIdentity> {
    return this.config.identity;
  }

  supports(capability: ProviderCapability): boolean {
    return this.identity.capabilities.includes(capability);
  }

  protected requireCapability(capability: ProviderCapability): void {
    if (!this.supports(capability)) {
      throw new ProviderError({
        providerId: this.identity.id,
        code: 'CAPABILITY_NOT_SUPPORTED',
        message: `${this.identity.code} does not support ${capability}`,
        retryable: false,
      });
    }
  }

  protected assertEnabled(): void {
    if (!this.identity.enabled) {
      throw new ProviderError({
        providerId: this.identity.id,
        code: 'PROVIDER_DISABLED',
        message: `${this.identity.code} is disabled`,
        retryable: false,
      });
    }
  }

  abstract healthCheck(context: ProviderRequestContext): Promise<ProviderHealthCheckResult>;
}
