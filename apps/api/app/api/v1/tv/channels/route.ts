import { fail, ok } from '../../../../../src/http/api-response';
import { requestContext } from '../../../../../src/http/request-context';
import { tvService } from '../../../../../src/services/tv-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const context = requestContext(request);
  try {
    const url = new URL(request.url);
    const group = optional(url.searchParams.get('group'));
    const search = optional(url.searchParams.get('search'));
    const cursor = optional(url.searchParams.get('cursor'));

    const data = await tvService.channels({
      ...(group ? { group } : {}),
      ...(search ? { search } : {}),
      ...(cursor ? { cursor } : {}),
      limit: boundedInteger(url.searchParams.get('limit'), 100, 1, 200),
    });
    return ok(data, { requestId: context.requestId });
  } catch (error) {
    return fail(error, context.requestId);
  }
}

function optional(value: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function boundedInteger(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
