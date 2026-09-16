import { ProviderError } from '@fullmedia/providers';
import { writeAdminAudit } from '../../../../../../../../src/audit/admin-audit';
import { fail, ok } from '../../../../../../../../src/http/api-response';
import { isInternalRequestAuthorized, unauthorizedInternalResponse } from '../../../../../../../../src/http/internal-auth';
import { requestContext } from '../../../../../../../../src/http/request-context';
import { getDatabase } from '../../../../../../../../src/infrastructure/database';
import { importManagedTvPlaylist } from '../../../../../../../../src/tv/managed-tv-source-manager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ImportBody {
  sourceKey: string;
  playlistText: string;
  publish?: boolean;
  refreshIntervalMinutes?: number;
  basePriority?: number;
}

export async function POST(request: Request): Promise<Response> {
  const context = requestContext(request);
  if (!isInternalRequestAuthorized(request)) {
    return unauthorizedInternalResponse(context.requestId);
  }

  try {
    const input = await parseImportBody(request);
    const result = await importManagedTvPlaylist(input);

    await writeAdminAudit(getDatabase(), {
      action: 'TV_SOURCE_IMPORT',
      resourceType: 'IPTV_SOURCE',
      resourceId: result.sourceKey,
      after: {
        providerCode: result.providerCode,
        parsedStreamCount: result.parsedStreamCount,
        boundChannelCount: result.boundChannelCount,
        epgSourceCount: result.epgSourceCount,
        warningCount: result.warningCount,
        published: result.published,
        sourceFingerprint: result.sourceFingerprint,
      },
      requestId: context.requestId,
      request,
    });

    return ok(result, { requestId: context.requestId });
  } catch (error) {
    return fail(error, context.requestId);
  }
}

async function parseImportBody(request: Request): Promise<ImportBody> {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';

  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    const sourceKey = stringValue(form.get('sourceKey'));
    const fileValue = form.get('file') ?? form.get('playlist');
    const playlistText = fileValue instanceof File
      ? await fileValue.text()
      : stringValue(fileValue);
    return validateBody({
      sourceKey,
      playlistText,
      publish: optionalBoolean(form.get('publish')),
      refreshIntervalMinutes: optionalNumber(form.get('refreshIntervalMinutes')),
      basePriority: optionalNumber(form.get('basePriority')),
    });
  }

  if (contentType.includes('application/json')) {
    const value: unknown = await request.json();
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid('JSON body must be an object');
    const body = value as Record<string, unknown>;
    return validateBody({
      sourceKey: typeof body.sourceKey === 'string' ? body.sourceKey : '',
      playlistText: typeof body.playlistText === 'string' ? body.playlistText : '',
      publish: typeof body.publish === 'boolean' ? body.publish : undefined,
      refreshIntervalMinutes: numberValue(body.refreshIntervalMinutes),
      basePriority: numberValue(body.basePriority),
    });
  }

  if (contentType.includes('text/plain') || contentType.includes('application/x-mpegurl') || contentType.includes('application/vnd.apple.mpegurl')) {
    const url = new URL(request.url);
    return validateBody({
      sourceKey: url.searchParams.get('sourceKey') ?? '',
      playlistText: await request.text(),
      publish: optionalBoolean(url.searchParams.get('publish')),
      refreshIntervalMinutes: optionalNumber(url.searchParams.get('refreshIntervalMinutes')),
      basePriority: optionalNumber(url.searchParams.get('basePriority')),
    });
  }

  throw invalid('Use multipart/form-data, application/json, text/plain or an M3U content type');
}

function validateBody(value: ImportBody): ImportBody {
  const sourceKey = value.sourceKey.trim();
  const playlistText = value.playlistText.trim();
  if (!sourceKey) throw invalid('sourceKey is required');
  if (!playlistText.startsWith('#EXTM3U')) throw invalid('Uploaded content is not an M3U playlist');
  return {
    sourceKey,
    playlistText,
    ...(value.publish !== undefined ? { publish: value.publish } : {}),
    ...(value.refreshIntervalMinutes !== undefined ? { refreshIntervalMinutes: value.refreshIntervalMinutes } : {}),
    ...(value.basePriority !== undefined ? { basePriority: value.basePriority } : {}),
  };
}

function invalid(message: string): ProviderError {
  return new ProviderError({
    providerId: 'admin-tv-import',
    code: 'INVALID_REQUEST',
    message,
    retryable: false,
    statusCode: 400,
  });
}

function stringValue(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value : '';
}

function optionalBoolean(value: FormDataEntryValue | string | null): boolean | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return undefined;
}

function optionalNumber(value: FormDataEntryValue | string | null): number | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
