import { fail, ok } from '../../../../../../../src/http/api-response';
import { isInternalRequestAuthorized, unauthorizedInternalResponse } from '../../../../../../../src/http/internal-auth';
import { requestContext } from '../../../../../../../src/http/request-context';
import { listManagedTvSources } from '../../../../../../../src/tv/managed-tv-source-manager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const context = requestContext(request);
  if (!isInternalRequestAuthorized(request)) {
    return unauthorizedInternalResponse(context.requestId);
  }

  try {
    const sources = await listManagedTvSources();
    return ok(sources, { requestId: context.requestId });
  } catch (error) {
    return fail(error, context.requestId);
  }
}
