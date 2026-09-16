import { fail, ok } from '../../../../../../src/http/api-response';
import { requestContext } from '../../../../../../src/http/request-context';
import { movieService } from '../../../../../../src/services/movie-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ ref: string }>;
}

interface PlaybackBody {
  episodeRef?: string;
}

export async function POST(request: Request, routeContext: RouteContext): Promise<Response> {
  const context = requestContext(request);
  try {
    const { ref } = await routeContext.params;
    const body = await parseBody(request);
    const data = await movieService.resolvePlayback(
      decodeURIComponent(ref),
      body.episodeRef,
      context,
    );
    return ok(data, { requestId: context.requestId });
  } catch (error) {
    return fail(error, context.requestId);
  }
}

async function parseBody(request: Request): Promise<PlaybackBody> {
  if (!request.headers.get('content-type')?.includes('application/json')) return {};
  const value: unknown = await request.json();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const episodeRef = (value as Record<string, unknown>).episodeRef;
  return typeof episodeRef === 'string' && episodeRef.trim()
    ? { episodeRef: episodeRef.trim() }
    : {};
}
