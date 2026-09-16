import { ok } from '../../../../src/http/api-response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  return ok({ status: 'ok', service: 'fullmedia-api', now: new Date().toISOString() });
}
