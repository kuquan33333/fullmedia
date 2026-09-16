import { ProviderError } from '@fullmedia/providers';
import { writeAdminAudit } from '../../../../../../../../src/audit/admin-audit';
import { fail, ok } from '../../../../../../../../src/http/api-response';
import { isInternalRequestAuthorized, unauthorizedInternalResponse } from '../../../../../../../../src/http/internal-auth';
import { requestContext } from '../../../../../../../../src/http/request-context';
import { getDatabase } from '../../../../../../../../src/infrastructure/database';
import { setManagedTvSourceEnabled } from '../../../../../../../../src/tv/managed-tv-source-manager';

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
    const enabled = await readEnabled(request);
    await setManagedTvSourceEnabled(sourceKey, enabled);

    await writeAdminAudit(getDatabase(), {
      action: enabled ? 'TV_SOURCE_ENABLE' : 'TV_SOURCE_DISABLE',
      resourceType: 'IPTV_SOURCE',
      resourceId: sourceKey,
      after: { enabled },
      requestId: context.requestId,
      request,
    });

    return ok({ sourceKey, enabled }, { requestId: context.requestId });
  } catch (error) {
    return fail(error, context.requestId);
  }
}

async function readEnabled(request: Request): Promise<boolean> {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    throw invalid('Content-Type application/json is required');
  }
  const value: unknown = await request.json();
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid('JSON body must be an object');
  const enabled = (value as Record<string, unknown>).enabled;
  if (typeof enabled !== 'boolean') throw invalid('enabled must be boolean');
  return enabled;
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
