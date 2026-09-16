import type {
  ProviderCapability,
  ProviderConfig,
  ProviderHealthCheckResult,
  ProviderIdentity,
  ProviderRequestContext,
} from './types';

export interface ProviderAdapter<TConfig extends ProviderConfig = ProviderConfig> {
  readonly config: Readonly<TConfig>;
  readonly identity: Readonly<ProviderIdentity>;

  supports(capability: ProviderCapability): boolean;
  healthCheck(context: ProviderRequestContext): Promise<ProviderHealthCheckResult>;
}
