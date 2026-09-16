import { fail, ok } from '../../../../../../src/http/api-response';
import { requestContext } from '../../../../../../src/http/request-context';
import { tvService } from '../../../../../../src/services/tv-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, routeContext: RouteContext): Promise<Response> {
  const context = requestContext(request);
  try {
    const { id } = await routeContext.params;
    const data = await tvService.channel(id);
    return ok(data, { requestId: context.requestId });
  } catch (error) {
    return fail(error, context.requestId);
  }
}
