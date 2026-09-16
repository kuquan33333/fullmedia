import { fail, ok } from '../../../../../../src/http/api-response';
import { isInternalRequestAuthorized, unauthorizedInternalResponse } from '../../../../../../src/http/internal-auth';
import { requestContext } from '../../../../../../src/http/request-context';
import { getProviderRuntime, refreshProviderHealth } from '../../../../../../src/providers/provider-runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const context = requestContext(request);
  if (!isInternalRequestAuthorized(request)) {
    return unauthorizedInternalResponse(context.requestId);
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
