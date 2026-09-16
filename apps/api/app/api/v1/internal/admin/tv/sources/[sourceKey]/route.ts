import { ProviderError } from '@fullmedia/providers';
import { writeAdminAudit } from '../../../../../../../../src/audit/admin-audit';
import { fail, ok } from '../../../../../../../../src/http/api-response';
import { isInternalRequestAuthorized, unauthorizedInternalResponse } from '../../../../../../../../src/http/internal-auth';
import { requestContext } from '../../../../../../../../src/http/request-context';
import { getDatabase } from '../../../../../../../../src/infrastructure/database';
import { updateManagedTvSource, type ManagedTvSourceUpdate } from '../../../../../../../../src/tv/managed-tv-source-manager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ sourceKey: string }>;
}

export async function PATCH(request: Request, routeContext: RouteContext): Promise<Response> {
  const context = requestContext(request);
  if (!isInternalRequestAuthorized(request)) {
    return unauthorizedInternalResponse(context.requestId);
  }

  try {
    const { sourceKey } = await routeContext.params;
    const update = await readUpdate(request);
    const result = await updateManagedTvSource(sourceKey, update);

    await writeAdminAudit(getDatabase(), {
      action: 'TV_SOURCE_UPDATE',
      resourceType: 'IPTV_SOURCE',
      resourceId: sourceKey,
      after: result,
      requestId: context.requestId,
      request,
    });

    return ok(result, { requestId: context.requestId });
  } catch (error) {
    return fail(error, context.requestId);
  }
}

async function readUpdate(request: Request): Promise<ManagedTvSourceUpdate> {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    throw invalid('Content-Type application/json is required');
  }
  const value: unknown = await request.json();
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid('JSON body must be an object');
  const body = value as Record<string, unknown>;

  const enabled = typeof body.enabled === 'boolean' ? body.enabled : undefined;
  const priority = typeof body.priority === 'number' && Number.isFinite(body.priority)
    ? body.priority
    : undefined;
  if (enabled === undefined && priority === undefined) {
    throw invalid('At least one of enabled or priority is required');
  }
  return {
    ...(enabled !== undefined ? { enabled } : {}),
    ...(priority !== undefined ? { priority } : {}),
  };
}

function invalid(message: string): ProviderError {
  return new ProviderError({
    providerId: 'admin-tv-source',
    code: 'INVALID_REQUEST',
    message,
    retryable: false,
    statusCode: 400,
  });
}
