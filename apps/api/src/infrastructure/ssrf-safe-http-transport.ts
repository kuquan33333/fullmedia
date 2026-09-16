import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { HttpRequestOptions, HttpTransport, HttpTransportResponse } from '@fullmedia/providers';

export interface SsrfSafeHttpTransportOptions {
  allowedHosts?: readonly string[];
}

export class SsrfSafeHttpTransport implements HttpTransport {
  private readonly allowedHosts: Set<string>;

  constructor(
    private readonly inner: HttpTransport,
    options: SsrfSafeHttpTransportOptions = {},
  ) {
    this.allowedHosts = new Set((options.allowedHosts ?? []).map(normalizeHost).filter(Boolean));
  }

  async request<T = unknown>(options: HttpRequestOptions): Promise<HttpTransportResponse<T>> {
    await assertSafeOutboundUrl(options.url, this.allowedHosts);
    return this.inner.request<T>(options);
  }
}

export async function assertSafeOutboundUrl(
  input: string,
  allowedHosts: ReadonlySet<string> = new Set(),
): Promise<void> {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error('Outbound URL is invalid');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Outbound protocol is not allowed: ${url.protocol}`);
  }
  if (url.username || url.password) {
    throw new Error('Credentials in outbound URLs are not allowed');
  }

  const host = normalizeHost(url.hostname);
  if (!host) throw new Error('Outbound URL hostname is missing');
  if (allowedHosts.has(host)) return;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    throw new Error('Private outbound hostname is not allowed');
  }

  if (isIP(host)) {
    if (!isPublicAddress(host)) throw new Error('Private outbound IP address is not allowed');
    return;
  }

  const records = await lookup(host, { all: true, verbatim: true });
  if (records.length === 0) throw new Error('Outbound hostname did not resolve');
  for (const record of records) {
    if (!isPublicAddress(record.address)) {
      throw new Error('Outbound hostname resolves to a private or non-routable address');
    }
  }
}

export function isPublicAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPublicIpv4(address);
  if (version === 6) return isPublicIpv6(address);
  return false;
}

function isPublicIpv4(address: string): boolean {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 0 || b === 168)) return false;
  if (a === 198 && (b === 18 || b === 19 || b === 51)) return false;
  if (a === 203 && b === 0) return false;
  if (a >= 224) return false;
  return true;
}

function isPublicIpv6(address: string): boolean {
  const normalized = address.toLowerCase().split('%')[0] ?? '';
  if (normalized === '::' || normalized === '::1') return false;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return false;
  if (/^fe[89ab]/.test(normalized)) return false;
  if (normalized.startsWith('ff')) return false;
  if (normalized.startsWith('2001:db8')) return false;
  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.slice('::ffff:'.length);
    if (isIP(mapped) === 4) return isPublicIpv4(mapped);
  }
  return true;
}

export function outboundHostAllowlistFromEnvironment(): string[] {
  return (process.env.FULLMEDIA_OUTBOUND_HOST_ALLOWLIST ?? '')
    .split(',')
    .map(normalizeHost)
    .filter(Boolean);
}

function normalizeHost(value: string): string {
  return value.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
}
