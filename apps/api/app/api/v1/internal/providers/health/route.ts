import { fail, ok } from '../../../../../../../src/http/api-response';
import { requestContext } from '../../../../../../../src/http/request-context';
import { getProviderRuntime, refreshProviderHealth } from '../../../../../../../src/providers/provider-runtime';

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
    await refreshProviderHealth();
    const runtimeState = await getProviderRuntime();
    const snapshots = await Promise.all(
      runtimeState.registry.list({ enabledOnly: false }).map(async (provider) => ({
        code: provider.identity.code,
        health: await runtimeState.healthStore.get(provider.identity.id),
      })),
    );
    return ok(snapshots, { requestId: context.requestId });
  } catch (error) {
    return fail(error, context.requestId);
  }
}

function authorized(request: Request): boolean {
  const expected = process.env.FULLMEDIA_INTERNAL_TOKEN?.trim();
  if (!expected) return false;
  return request.headers.get('authorization') === `Bearer ${expected}`;
}
