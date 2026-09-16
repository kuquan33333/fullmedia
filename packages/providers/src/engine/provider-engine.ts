import { ProviderError, toProviderError } from '../core/errors';
import type { ProviderAdapter } from '../core/provider-adapter';
import type {
  ProviderAttempt,
  ProviderCapability,
  ProviderDomain,
  ProviderExecutionResult,
  ProviderRequestContext,
} from '../core/types';
import type { ProviderRegistry } from '../registry/provider-registry';
import type { ProviderSelector } from './provider-selector';

export interface ProviderExecutionOptions<TProvider extends ProviderAdapter, TResult> {
  domain: ProviderDomain;
  capability: ProviderCapability;
  context: ProviderRequestContext;
  isProvider: (provider: ProviderAdapter) => provider is TProvider;
  invoke: (provider: TProvider, context: ProviderRequestContext) => Promise<TResult>;
  maxProviders?: number;
}

export class ProviderEngine {
  constructor(
    private readonly registry: ProviderRegistry,
    private readonly selector: ProviderSelector,
  ) {}

  async execute<TProvider extends ProviderAdapter, TResult>(
    options: ProviderExecutionOptions<TProvider, TResult>,
  ): Promise<ProviderExecutionResult<TResult>> {
    const candidates = this.registry
      .list({
        domain: options.domain,
        capability: options.capability,
        enabledOnly: true,
      })
      .filter(options.isProvider);

    const selected = (await this.selector.select(candidates)).filter(options.isProvider);
    const limited = selected.slice(0, Math.max(1, options.maxProviders ?? selected.length));
    const attempts: ProviderAttempt[] = [];
    let lastError: ProviderError | undefined;

    for (const provider of limited) {
      const startedAt = Date.now();
      try {
        const data = await options.invoke(provider, options.context);
        attempts.push({
          providerId: provider.identity.id,
          providerCode: provider.identity.code,
          success: true,
          durationMs: Date.now() - startedAt,
        });

        return {
          data,
          providerId: provider.identity.id,
          providerCode: provider.identity.code,
          fallbackCount: Math.max(0, attempts.length - 1),
          attempts,
        };
      } catch (error) {
        const providerError = toProviderError(error, provider.identity.id);
        lastError = providerError;
        attempts.push({
          providerId: provider.identity.id,
          providerCode: provider.identity.code,
          success: false,
          durationMs: Date.now() - startedAt,
          errorCode: providerError.code,
        });

        if (!providerError.retryable) throw providerError;
      }
    }

    throw (
      lastError ??
      new ProviderError({
        providerId: 'provider-engine',
        code: 'SOURCE_UNAVAILABLE',
        message: `No provider available for ${options.domain}/${options.capability}`,
        retryable: true,
      })
    );
  }
}
