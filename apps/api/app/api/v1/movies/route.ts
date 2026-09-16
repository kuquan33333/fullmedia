import type { MovieSummary } from '@fullmedia/providers';
import { fail, ok } from '../../../../src/http/api-response';
import { requestContext } from '../../../../src/http/request-context';
import { movieService } from '../../../../src/services/movie-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const context = requestContext(request);
  try {
    const url = new URL(request.url);
    const search = optional(url.searchParams.get('q'));
    const cursor = optional(url.searchParams.get('cursor'));
    const limit = boundedInteger(url.searchParams.get('limit'), 24, 1, 50);

    if (search) {
      const data = await movieService.search(search, { ...(cursor ? { cursor } : {}), limit }, context);
      return ok(data, { requestId: context.requestId });
    }

    const type = movieType(url.searchParams.get('type'));
    const year = optionalInteger(url.searchParams.get('year'));
    const genre = optional(url.searchParams.get('genre'));
    const country = optional(url.searchParams.get('country'));
    const data = await movieService.list({
      ...(cursor ? { cursor } : {}),
      limit,
      ...(type ? { type } : {}),
      ...(year !== undefined ? { year } : {}),
      ...(genre ? { genre } : {}),
      ...(country ? { country } : {}),
    }, context);
    return ok(data, { requestId: context.requestId });
  } catch (error) {
    return fail(error, context.requestId);
  }
}

function optional(value: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function optionalInteger(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function boundedInteger(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function movieType(value: string | null): MovieSummary['type'] | undefined {
  if (value === 'MOVIE' || value === 'SERIES' || value === 'ANIME' || value === 'TV_SHOW') return value;
  return undefined;
}
