import { createHash } from 'node:crypto';
import type { SqlExecutor } from '@fullmedia/providers';

export interface AdminAuditEvent {
  action: string;
  resourceType: string;
  resourceId?: string;
  before?: Readonly<Record<string, unknown>>;
  after?: Readonly<Record<string, unknown>>;
  requestId?: string;
  request?: Request;
}

export async function writeAdminAudit(db: SqlExecutor, event: AdminAuditEvent): Promise<void> {
  await db.query(`
    insert into ops.admin_audit_logs (
      actor_user_id, action, resource_type, resource_id,
      before_json, after_json, request_id, ip_hash
    ) values (null, $1, $2, $3, $4::jsonb, $5::jsonb, $6, $7)
  `, [
    event.action,
    event.resourceType,
    event.resourceId ?? null,
    event.before ? JSON.stringify(redact(event.before)) : null,
    event.after ? JSON.stringify(redact(event.after)) : null,
    event.requestId ?? null,
    event.request ? hashIp(event.request) : null,
  ]);
}

function redact(value: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const blocked = /(?:secret|token|password|authorization|stream|playlisttext|sourceurl|source_ref|url)/i;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (blocked.test(key)) {
      output[key] = '[REDACTED]';
      continue;
    }
    output[key] = item;
  }
  return output;
}

function hashIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = forwarded || request.headers.get('x-real-ip')?.trim();
  if (!ip) return null;
  const salt = process.env.FULLMEDIA_AUDIT_IP_SALT?.trim() || 'fullmedia-ip-hash-v1';
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex');
}
