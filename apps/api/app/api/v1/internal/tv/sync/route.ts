import { fail, ok } from '../../../../../../src/http/api-response';
import { requestContext } from '../../../../../../src/http/request-context';
import { tvIngestionService } from '../../../../../../src/tv/tv-ingestion-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const context = requestContext(request);
  if (!authorized(request)) {
    return Response.json(
      { data: null, meta: {}, error: { code: 'UNAUTHORIZED', message: 'Unauthorized', requestId: context.requestId } },
      { status: 401 },
    );
  }

  try {
    const data = await tvIngestionService.syncAll();
    return ok(data, { requestId: context.requestId });
  } catch (error) {
    return fail(error, context.requestId);
  }
}

function authorized(request: Request): boolean {
  const expected = process.env.FULLMEDIA_INTERNAL_TOKEN?.trim();
  if (!expected) return false;
  return request.headers.get('authorization') === `Bearer ${expected}`;
}
