import { fail, ok } from '../../../../../../../src/http/api-response';
import { requestContext } from '../../../../../../../src/http/request-context';
import { tvService } from '../../../../../../../src/services/tv-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, routeContext: RouteContext): Promise<Response> {
  const context = requestContext(request);
  try {
    const { id } = await routeContext.params;
    const url = new URL(request.url);
    const now = Date.now();
    const from = url.searchParams.get('from') ?? new Date(now - 60 * 60_000).toISOString();
    const to = url.searchParams.get('to') ?? new Date(now + 24 * 60 * 60_000).toISOString();
    const data = await tvService.epg(id, from, to);
    return ok(data, { requestId: context.requestId, from, to });
  } catch (error) {
    return fail(error, context.requestId);
  }
}
