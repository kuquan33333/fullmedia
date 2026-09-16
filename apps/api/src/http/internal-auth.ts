import { timingSafeEqual } from 'node:crypto';

export function isInternalRequestAuthorized(request: Request): boolean {
  const expected = process.env.FULLMEDIA_INTERNAL_TOKEN?.trim();
  if (!expected) return false;

  const authorization = request.headers.get('authorization')?.trim();
  if (!authorization?.startsWith('Bearer ')) return false;
  const supplied = authorization.slice('Bearer '.length);

  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  if (expectedBuffer.length !== suppliedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, suppliedBuffer);
}

export function unauthorizedInternalResponse(requestId: string): Response {
  return Response.json(
    {
      data: null,
      meta: {},
      error: {
        code: 'UNAUTHORIZED',
        message: 'Unauthorized',
        requestId,
      },
    },
    { status: 401 },
  );
}
