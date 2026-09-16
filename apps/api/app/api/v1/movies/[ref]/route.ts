import { fail, ok } from '../../../../../src/http/api-response';
import { requestContext } from '../../../../../src/http/request-context';
import { movieService } from '../../../../../src/services/movie-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ ref: string }>;
}

export async function GET(request: Request, routeContext: RouteContext): Promise<Response> {
  const context = requestContext(request);
  try {
    const { ref } = await routeContext.params;
    const data = await movieService.detail(ref, context);
    return ok(data, { requestId: context.requestId });
  } catch (error) {
    return fail(error, context.requestId);
  }
}
