import type { ProviderRequestContext } from '@fullmedia/providers';

export function requestContext(request: Request): ProviderRequestContext {
  const incomingRequestId = request.headers.get('x-request-id')?.trim();
  return {
    requestId: incomingRequestId || crypto.randomUUID(),
    signal: request.signal,
    locale: request.headers.get('accept-language')?.split(',')[0]?.trim() || 'vi-VN',
    timezone: request.headers.get('x-timezone')?.trim() || 'Asia/Ho_Chi_Minh',
  };
}
