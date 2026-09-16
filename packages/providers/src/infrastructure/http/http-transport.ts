import type { RetryPolicy } from '../../core/types';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';
export type HttpResponseType = 'json' | 'text';

export type HttpTransportErrorKind =
  | 'TIMEOUT'
  | 'ABORTED'
  | 'NETWORK'
  | 'HTTP_STATUS'
  | 'INVALID_JSON';

export class HttpTransportError extends Error {
  readonly kind: HttpTransportErrorKind;
  readonly status?: number;
  readonly retryable: boolean;
  override readonly cause?: unknown;

  constructor(options: {
    kind: HttpTransportErrorKind;
    message: string;
    retryable: boolean;
    status?: number;
    cause?: unknown;
  }) {
    super(options.message);
    this.name = 'HttpTransportError';
    this.kind = options.kind;
    this.retryable = options.retryable;
    if (options.status !== undefined) this.status = options.status;
    if (options.cause !== undefined) this.cause = options.cause;
  }
}

export interface HttpRequestOptions {
  url: string;
  method?: HttpMethod;
  query?: Readonly<Record<string, string | number | boolean | undefined>>;
  headers?: Readonly<Record<string, string>>;
  body?: BodyInit | null;
  timeoutMs?: number;
  retryPolicy?: RetryPolicy;
  signal?: AbortSignal;
  responseType?: HttpResponseType;
}

export interface HttpTransportResponse<T> {
  data: T;
  status: number;
  headers: Readonly<Record<string, string>>;
  url: string;
  durationMs: number;
  attempts: number;
}

export interface HttpTransport {
  request<T = unknown>(options: HttpRequestOptions): Promise<HttpTransportResponse<T>>;
}

export interface FetchHttpTransportDefaults {
  headers?: Readonly<Record<string, string>>;
  userAgent?: string;
  timeoutMs?: number;
  retryPolicy?: RetryPolicy;
}

const DEFAULT_RETRY_POLICY: RetryPolicy = {
  attempts: 2,
  retryTimeout: true,
  retry5xx: true,
  retry429: true,
};

export class FetchHttpTransport implements HttpTransport {
  constructor(private readonly defaults: FetchHttpTransportDefaults = {}) {}

  async request<T = unknown>(options: HttpRequestOptions): Promise<HttpTransportResponse<T>> {
    const method = options.method ?? 'GET';
    const timeoutMs = options.timeoutMs ?? this.defaults.timeoutMs ?? 8_000;
    const retryPolicy = options.retryPolicy ?? this.defaults.retryPolicy ?? DEFAULT_RETRY_POLICY;
    const maxAttempts = Math.max(1, retryPolicy.attempts);
    const url = buildUrl(options.url, options.query);
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const startedAt = Date.now();
      const timeoutController = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        timeoutController.abort();
      }, timeoutMs);
      const detach = linkAbortSignal(options.signal, timeoutController);

      try {
        const headers = new Headers(this.defaults.headers);
        if (this.defaults.userAgent && !headers.has('user-agent')) headers.set('user-agent', this.defaults.userAgent);
        for (const [key, value] of Object.entries(options.headers ?? {})) headers.set(key, value);
        if (!headers.has('accept')) headers.set('accept', 'application/json');

        const init: RequestInit = { method, headers, signal: timeoutController.signal };
        if (options.body !== undefined) init.body = options.body;

        const response = await fetch(url, init);
        if (!response.ok) {
          const retryable = isRetryableStatus(response.status, retryPolicy) && isIdempotent(method);
          const message = await safeErrorBody(response);
          const error = new HttpTransportError({
            kind: 'HTTP_STATUS',
            status: response.status,
            retryable,
            message: `HTTP ${response.status} from ${url}${message ? `: ${message}` : ''}`,
          });
          if (retryable && attempt < maxAttempts) {
            lastError = error;
            await backoff(attempt, options.signal);
            continue;
          }
          throw error;
        }

        const responseType = options.responseType ?? 'json';
        const raw = await response.text();
        let data: unknown = raw;
        if (responseType === 'json') {
          try {
            data = raw.length === 0 ? null : JSON.parse(raw);
          } catch (error) {
            throw new HttpTransportError({
              kind: 'INVALID_JSON',
              message: `Invalid JSON from ${url}`,
              retryable: false,
              cause: error,
            });
          }
        }

        return {
          data: data as T,
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          url: response.url || url,
          durationMs: Date.now() - startedAt,
          attempts: attempt,
        };
      } catch (error) {
        const normalized = normalizeFetchError(error, timedOut, options.signal);
        lastError = normalized;
        if (normalized.retryable && isIdempotent(method) && attempt < maxAttempts) {
          await backoff(attempt, options.signal);
          continue;
        }
        throw normalized;
      } finally {
        clearTimeout(timer);
        detach();
      }
    }

    throw normalizeFetchError(lastError, false, options.signal);
  }
}

function buildUrl(input: string, query?: HttpRequestOptions['query']): string {
  if (!query) return input;
  const url = new URL(input);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function isIdempotent(method: HttpMethod): boolean {
  return method === 'GET' || method === 'HEAD' || method === 'PUT' || method === 'DELETE';
}

function isRetryableStatus(status: number, policy: RetryPolicy): boolean {
  if (status === 429) return policy.retry429;
  if (status >= 500) return policy.retry5xx;
  return false;
}

function normalizeFetchError(error: unknown, timedOut: boolean, externalSignal?: AbortSignal): HttpTransportError {
  if (error instanceof HttpTransportError) return error;
  if (timedOut) return new HttpTransportError({ kind: 'TIMEOUT', message: 'HTTP request timed out', retryable: true, cause: error });
  if (externalSignal?.aborted) return new HttpTransportError({ kind: 'ABORTED', message: 'HTTP request was aborted', retryable: false, cause: error });
  if (error instanceof DOMException && error.name === 'AbortError') return new HttpTransportError({ kind: 'ABORTED', message: 'HTTP request was aborted', retryable: false, cause: error });
  return new HttpTransportError({ kind: 'NETWORK', message: error instanceof Error ? error.message : 'Network request failed', retryable: true, cause: error });
}

async function safeErrorBody(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 300).replace(/\s+/g, ' ').trim();
  } catch {
    return '';
  }
}

function linkAbortSignal(source: AbortSignal | undefined, target: AbortController): () => void {
  if (!source) return () => undefined;
  if (source.aborted) {
    target.abort();
    return () => undefined;
  }
  const onAbort = () => target.abort();
  source.addEventListener('abort', onAbort, { once: true });
  return () => source.removeEventListener('abort', onAbort);
}

async function backoff(attempt: number, signal?: AbortSignal): Promise<void> {
  const base = Math.min(2_000, 250 * 2 ** Math.max(0, attempt - 1));
  const jitter = Math.floor(Math.random() * 100);
  await sleep(base + jitter, signal);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new HttpTransportError({ kind: 'ABORTED', message: 'HTTP retry was aborted', retryable: false }));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(new HttpTransportError({ kind: 'ABORTED', message: 'HTTP retry was aborted', retryable: false }));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
