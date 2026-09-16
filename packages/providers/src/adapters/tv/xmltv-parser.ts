import { XMLParser } from 'fast-xml-parser';

export interface XmltvChannel {
  externalId: string;
  displayNames: string[];
  iconUrl?: string;
}

export interface XmltvProgramme {
  externalId: string;
  channelExternalId: string;
  title: string;
  description?: string;
  startsAt: string;
  endsAt: string;
  category?: string;
  iconUrl?: string;
}

export interface XmltvParseResult {
  channels: XmltvChannel[];
  programmes: XmltvProgramme[];
  warnings: string[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  trimValues: true,
  parseTagValue: false,
  parseAttributeValue: false,
  allowBooleanAttributes: true,
  processEntities: false,
});

export function parseXmltv(input: string): XmltvParseResult {
  const warnings: string[] = [];
  let root: Record<string, unknown>;
  try {
    const parsed: unknown = parser.parse(stripBom(input));
    root = asRecord(asRecord(parsed).tv);
  } catch (error) {
    throw new Error(`Invalid XMLTV document: ${error instanceof Error ? error.message : 'parse failed'}`);
  }

  if (Object.keys(root).length === 0) throw new Error('XMLTV document does not contain <tv> root');

  const channels = asArray(root.channel).flatMap((value, index) => {
    const record = asRecord(value);
    const externalId = textValue(record['@_id']);
    if (!externalId) {
      warnings.push(`XMLTV channel at index ${index} is missing id`);
      return [];
    }
    const displayNames = asArray(record['display-name']).flatMap((item) => {
      const value = textValue(item);
      return value ? [value] : [];
    });
    const channel: XmltvChannel = { externalId, displayNames };
    const iconUrl = attributeValue(record.icon, 'src');
    if (iconUrl) channel.iconUrl = iconUrl;
    return [channel];
  });

  const programmes = asArray(root.programme).flatMap((value, index) => {
    const record = asRecord(value);
    const channelExternalId = textValue(record['@_channel']);
    const title = firstText(record.title);
    const startsAt = parseXmltvTimestamp(textValue(record['@_start']));
    const endsAt = parseXmltvTimestamp(textValue(record['@_stop']));

    if (!channelExternalId || !title || !startsAt || !endsAt) {
      warnings.push(`XMLTV programme at index ${index} is missing channel/title/start/stop`);
      return [];
    }
    if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
      warnings.push(`XMLTV programme at index ${index} has invalid time range`);
      return [];
    }

    const programme: XmltvProgramme = {
      externalId:
        textValue(record['@_id']) ??
        `xmltv:${stableHash(`${channelExternalId}|${startsAt}|${title}`)}`,
      channelExternalId,
      title,
      startsAt,
      endsAt,
    };
    const description = firstText(record.desc);
    const category = firstText(record.category);
    const iconUrl = attributeValue(record.icon, 'src');
    if (description) programme.description = description;
    if (category) programme.category = category;
    if (iconUrl) programme.iconUrl = iconUrl;
    return [programme];
  });

  return { channels, programmes, warnings };
}

export function parseXmltvTimestamp(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = value.trim().match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?(?:\s*([+-]\d{4}|Z))?/i);
  if (!match) return undefined;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? '0');
  if (
    month < 1 || month > 12 || day < 1 || day > 31 ||
    hour > 23 || minute > 59 || second > 59
  ) return undefined;

  let utcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const zone = match[7]?.toUpperCase();
  if (zone && zone !== 'Z') {
    const sign = zone.startsWith('-') ? -1 : 1;
    const hours = Number(zone.slice(1, 3));
    const minutes = Number(zone.slice(3, 5));
    if (hours > 23 || minutes > 59) return undefined;
    utcMs -= sign * (hours * 60 + minutes) * 60_000;
  }
  return new Date(utcMs).toISOString();
}

function firstText(value: unknown): string | undefined {
  for (const item of asArray(value)) {
    const text = textValue(item);
    if (text) return text;
  }
  return undefined;
}

function attributeValue(value: unknown, key: string): string | undefined {
  for (const item of asArray(value)) {
    const result = textValue(asRecord(item)[`@_${key}`]);
    if (result) return result;
  }
  return undefined;
}

function textValue(value: unknown): string | undefined {
  if (typeof value === 'string' || typeof value === 'number') {
    const text = String(value).trim();
    return text || undefined;
  }
  const record = asRecord(value);
  const nested = record['#text'];
  if (typeof nested === 'string' || typeof nested === 'number') {
    const text = String(nested).trim();
    return text || undefined;
  }
  return undefined;
}

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
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
