export interface M3uEntry {
  externalId: string;
  name: string;
  tvgName?: string;
  logoUrl?: string;
  group?: string;
  streamUrl: string;
  sourceKey: string;
  headers: Readonly<Record<string, string>>;
  isHd: boolean;
  attributes: Readonly<Record<string, string>>;
}

export interface M3uParseResult {
  entries: M3uEntry[];
  epgUrls: string[];
  warnings: string[];
}

interface PendingEntry {
  name?: string;
  attributes: Record<string, string>;
  headers: Record<string, string>;
}

export function parseM3u(input: string): M3uParseResult {
  const text = stripBom(input);
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const entries: M3uEntry[] = [];
  const warnings: string[] = [];
  const epgUrls = new Set<string>();
  let pending: PendingEntry | undefined;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) continue;

    if (line.startsWith('#EXTM3U')) {
      const attributes = parseAttributes(line.slice('#EXTM3U'.length));
      for (const key of ['x-tvg-url', 'url-tvg']) {
        const value = attributes[key];
        if (value) {
          for (const url of value.split(',').map((item) => item.trim()).filter(Boolean)) epgUrls.add(url);
        }
      }
      continue;
    }

    if (line.startsWith('#EXTINF:')) {
      const { metadata, name } = splitExtInf(line.slice('#EXTINF:'.length));
      pending = { name, attributes: parseAttributes(metadata), headers: {} };
      continue;
    }

    if (line.startsWith('#EXTVLCOPT:')) {
      if (!pending) pending = { attributes: {}, headers: {} };
      const option = line.slice('#EXTVLCOPT:'.length);
      const equals = option.indexOf('=');
      if (equals > 0) {
        const key = option.slice(0, equals).trim().toLowerCase();
        const value = option.slice(equals + 1).trim();
        if (key === 'http-user-agent') pending.headers['user-agent'] = value;
        else if (key === 'http-referrer' || key === 'http-referer') pending.headers.referer = value;
        else if (key === 'http-origin') pending.headers.origin = value;
      }
      continue;
    }

    if (line.startsWith('#EXTHTTP:')) {
      if (!pending) pending = { attributes: {}, headers: {} };
      try {
        const parsed: unknown = JSON.parse(line.slice('#EXTHTTP:'.length));
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          for (const [key, value] of Object.entries(parsed)) {
            if (typeof value === 'string') pending.headers[normalizeHeaderName(key)] = value;
          }
        }
      } catch {
        warnings.push(`Invalid #EXTHTTP JSON at line ${index + 1}`);
      }
      continue;
    }

    if (line.startsWith('#')) continue;

    if (!isSupportedStreamUrl(line)) {
      warnings.push(`Unsupported stream URL at line ${index + 1}`);
      pending = undefined;
      continue;
    }

    const attributes = pending?.attributes ?? {};
    const displayName = clean(pending?.name) ?? clean(attributes['tvg-name']) ?? clean(attributes['tvg-id']);
    if (!displayName) {
      warnings.push(`Missing channel name before line ${index + 1}`);
      pending = undefined;
      continue;
    }

    const externalId = clean(attributes['tvg-id']) ?? clean(attributes['tvg-name']) ?? slugify(displayName);
    const entry: M3uEntry = {
      externalId,
      name: displayName,
      streamUrl: line,
      sourceKey: `m3u:${slugify(externalId)}:${stableHash(line)}`,
      headers: { ...(pending?.headers ?? {}) },
      isHd: inferHd(displayName, attributes),
      attributes: { ...attributes },
    };
    const tvgName = clean(attributes['tvg-name']);
    const logoUrl = clean(attributes['tvg-logo']);
    const group = clean(attributes['group-title']);
    if (tvgName) entry.tvgName = tvgName;
    if (logoUrl) entry.logoUrl = logoUrl;
    if (group) entry.group = group;
    entries.push(entry);
    pending = undefined;
  }

  return { entries, epgUrls: [...epgUrls], warnings };
}

export function groupM3uEntries(entries: readonly M3uEntry[]): Map<string, M3uEntry[]> {
  const grouped = new Map<string, M3uEntry[]>();
  for (const entry of entries) {
    const key = normalizeExternalId(entry.externalId);
    const current = grouped.get(key) ?? [];
    current.push(entry);
    grouped.set(key, current);
  }
  return grouped;
}

export function normalizeExternalId(value: string): string {
  return value.trim().toLocaleLowerCase('vi-VN');
}

function splitExtInf(value: string): { metadata: string; name?: string } {
  let quote: '"' | "'" | undefined;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if ((char === '"' || char === "'") && value[index - 1] !== '\\') {
      quote = quote === char ? undefined : quote ?? char;
      continue;
    }
    if (char === ',' && !quote) {
      const name = clean(value.slice(index + 1));
      return { metadata: value.slice(0, index), ...(name ? { name } : {}) };
    }
  }
  return { metadata: value };
}

function parseAttributes(value: string): Record<string, string> {
  const output: Record<string, string> = {};
  const expression = /([A-Za-z0-9_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s]+))/g;
  for (const match of value.matchAll(expression)) {
    const key = match[1]?.toLowerCase();
    const item = match[2] ?? match[3] ?? match[4];
    if (key && item !== undefined) output[key] = item.trim();
  }
  return output;
}

function inferHd(name: string, attributes: Readonly<Record<string, string>>): boolean {
  const haystack = `${name} ${attributes.quality ?? ''} ${attributes['tvg-name'] ?? ''}`;
  return /(?:^|\W)(?:hd|fhd|uhd|1080p?|2160p?|4k)(?:$|\W)/i.test(haystack);
}

function isSupportedStreamUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol.toLowerCase();
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizeHeaderName(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'referrer') return 'referer';
  return normalized;
}

function clean(value: string | undefined): string | undefined {
  const result = value?.trim();
  return result ? result : undefined;
}

function slugify(value: string): string {
  const slug = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'channel';
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function stripBom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}
