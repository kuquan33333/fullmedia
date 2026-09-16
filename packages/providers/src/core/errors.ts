export type ProviderErrorCode =
  | 'TIMEOUT'
  | 'NETWORK'
  | 'RATE_LIMITED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'UPSTREAM_4XX'
  | 'UPSTREAM_5XX'
  | 'INVALID_RESPONSE'
  | 'SCHEMA_MISMATCH'
  | 'SOURCE_UNAVAILABLE'
  | 'CIRCUIT_OPEN'
  | 'CAPABILITY_NOT_SUPPORTED'
  | 'PROVIDER_DISABLED'
  | 'ABORTED'
  | 'UNKNOWN';

export interface ProviderErrorOptions {
  providerId: string;
  code: ProviderErrorCode;
  message: string;
  retryable: boolean;
  statusCode?: number;
  cause?: unknown;
}

export class ProviderError extends Error {
  readonly providerId: string;
  readonly code: ProviderErrorCode;
  readonly retryable: boolean;
  readonly statusCode?: number;
  override readonly cause?: unknown;

  constructor(options: ProviderErrorOptions) {
    super(options.message);
    this.name = 'ProviderError';
    this.providerId = options.providerId;
    this.code = options.code;
    this.retryable = options.retryable;
    this.statusCode = options.statusCode;
    this.cause = options.cause;
  }
}

export function isProviderError(error: unknown): error is ProviderError {
  return error instanceof ProviderError;
}

export function toProviderError(error: unknown, providerId: string): ProviderError {
  if (isProviderError(error)) return error;

  if (error instanceof DOMException && error.name === 'AbortError') {
    return new ProviderError({
      providerId,
      code: 'ABORTED',
      message: 'Provider request was aborted',
      retryable: false,
      cause: error,
    });
  }

  return new ProviderError({
    providerId,
    code: 'UNKNOWN',
    message: error instanceof Error ? error.message : 'Unknown provider error',
    retryable: false,
    cause: error,
  });
}
