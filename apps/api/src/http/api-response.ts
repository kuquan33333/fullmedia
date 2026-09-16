import { ProviderError } from '@fullmedia/providers';

export interface ApiEnvelope<T> {
  data: T | null;
  meta: Record<string, unknown>;
  error: null | {
    code: string;
    message: string;
    requestId: string;
    retryable?: boolean;
  };
}

export function ok<T>(data: T, meta: Record<string, unknown> = {}, status = 200): Response {
  return Response.json({ data, meta, error: null } satisfies ApiEnvelope<T>, { status });
}

export function fail(error: unknown, requestId: string): Response {
  if (error instanceof ProviderError) {
    return Response.json(
      {
        data: null,
        meta: {},
        error: {
          code: error.code,
          message: publicProviderMessage(error),
          requestId,
          retryable: error.retryable,
        },
      } satisfies ApiEnvelope<never>,
      { status: providerStatus(error) },
    );
  }

  console.error('[FULLMEDIA API]', requestId, error);
  return Response.json(
    {
      data: null,
      meta: {},
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        requestId,
      },
    } satisfies ApiEnvelope<never>,
    { status: 500 },
  );
}

function providerStatus(error: ProviderError): number {
  if (error.code === 'INVALID_REQUEST') return 400;
  if (error.code === 'NOT_FOUND') return 404;
  if (error.code === 'RATE_LIMITED') return 503;
  if (error.code === 'TIMEOUT') return 504;
  if (error.code === 'INVALID_RESPONSE' || error.code === 'SCHEMA_MISMATCH') return 502;
  if (error.code === 'SOURCE_UNAVAILABLE' || error.code === 'UPSTREAM_5XX' || error.code === 'NETWORK') return 503;
  return 502;
}

function publicProviderMessage(error: ProviderError): string {
  if (error.code === 'INVALID_REQUEST') return 'Invalid request';
  if (error.code === 'NOT_FOUND') return 'Content was not found';
  if (error.retryable) return 'Content provider is temporarily unavailable';
  return 'Content provider request failed';
}
