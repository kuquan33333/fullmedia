import { describe, expect, it } from 'vitest';
import type { HttpRequestOptions, HttpTransport, HttpTransportResponse } from '../../infrastructure/http/http-transport';
import type { ProviderRuntimeConfig } from '../../infrastructure/config/provider-config-repository';
import { IptvProvider, createIptvProviderConfig } from './iptv-provider';
import { parseM3u } from './m3u-parser';
import { parseXmltv, parseXmltvTimestamp } from './xmltv-parser';

const playlistA = `#EXTM3U x-tvg-url="https://guide.example.test/epg.xml"
#EXTINF:-1 tvg-id="vtv3.vn" tvg-name="VTV3 HD" tvg-logo="https://img.example.test/vtv3.png" group-title="VTV",VTV3 HD
#EXTVLCOPT:http-user-agent=FullMedia-Test
#EXTVLCOPT:http-referrer=https://example.test/
https://stream-a.example.test/vtv3/master.m3u8
#EXTINF:-1 tvg-id="htv7.vn" group-title="HTV",HTV7
https://stream-a.example.test/htv7/master.m3u8
`;

const playlistB = `#EXTM3U
#EXTINF:-1 tvg-id="vtv3.vn" tvg-name="VTV3" group-title="VTV",VTV3
https://stream-b.example.test/vtv3/master.m3u8
`;

const xmltv = `<?xml version="1.0" encoding="UTF-8"?>
<tv>
  <channel id="vtv3.vn">
    <display-name>VTV3 HD</display-name>
    <icon src="https://img.example.test/vtv3.png" />
  </channel>
  <programme start="20260916190000 +0700" stop="20260916200000 +0700" channel="vtv3.vn">
    <title lang="vi">Thời sự tối</title>
    <desc lang="vi">Bản tin trong ngày</desc>
    <category>News</category>
  </programme>
</tv>`;

class FixtureTransport implements HttpTransport {
  async request<T = unknown>(options: HttpRequestOptions): Promise<HttpTransportResponse<T>> {
    let data: string;
    if (options.url.includes('playlist-a')) data = playlistA;
    else if (options.url.includes('playlist-b')) data = playlistB;
    else if (options.url.includes('epg.xml')) data = xmltv;
    else throw new Error(`Unknown fixture URL: ${options.url}`);
    return {
      data: data as T,
      status: 200,
      headers: {},
      url: options.url,
      durationMs: 1,
      attempts: 1,
    };
  }
}

function runtimeConfig(): ProviderRuntimeConfig {
  return {
    identity: {
      id: '11111111-1111-4111-8111-111111111111',
      code: 'IPTV_TEST',
      displayName: 'IPTV Test',
      domain: 'TV',
      kind: 'IPTV_PLAYLIST',
      enabled: true,
      priority: 10,
      weight: 1,
      capabilities: ['TV_CHANNELS', 'TV_EPG', 'TV_PLAYBACK'],
    },
    authStrategy: 'NONE',
    headers: {},
    requestTemplate: {},
    timeoutMs: 5_000,
    retryPolicy: { attempts: 1, retryTimeout: true, retry5xx: true, retry429: true },
    cacheTtlSeconds: 300,
    mappingVersion: 1,
    configVersion: 1,
  };
}

describe('M3U parser', () => {
  it('parses IPTV metadata and HTTP headers', () => {
    const parsed = parseM3u(playlistA);
    expect(parsed.entries).toHaveLength(2);
    expect(parsed.epgUrls).toEqual(['https://guide.example.test/epg.xml']);
    expect(parsed.entries[0]).toMatchObject({
      externalId: 'vtv3.vn',
      name: 'VTV3 HD',
      group: 'VTV',
      isHd: true,
    });
    expect(parsed.entries[0]?.headers).toMatchObject({
      'user-agent': 'FullMedia-Test',
      referer: 'https://example.test/',
    });
  });
});

describe('XMLTV parser', () => {
  it('normalizes programme timestamps with timezone offsets', () => {
    expect(parseXmltvTimestamp('20260916190000 +0700')).toBe('2026-09-16T12:00:00.000Z');
    const parsed = parseXmltv(xmltv);
    expect(parsed.channels[0]?.externalId).toBe('vtv3.vn');
    expect(parsed.programmes[0]).toMatchObject({
      channelExternalId: 'vtv3.vn',
      title: 'Thời sự tối',
      startsAt: '2026-09-16T12:00:00.000Z',
      endsAt: '2026-09-16T13:00:00.000Z',
      category: 'News',
    });
  });
});

describe('IptvProvider', () => {
  it('merges duplicate channels into one channel with multiple playback candidates', async () => {
    const provider = new IptvProvider(
      new FixtureTransport(),
      createIptvProviderConfig(runtimeConfig(), [
        { id: 'a', name: 'Primary', url: 'https://fixture.test/playlist-a.m3u', epgUrl: 'https://guide.example.test/epg.xml', priority: 10 },
        { id: 'b', name: 'Backup', url: 'https://fixture.test/playlist-b.m3u', priority: 20 },
      ]),
    );
    const context = { requestId: 'tv-provider-test' };

    const channels = await provider.channels({ limit: 100 }, context);
    expect(channels.items).toHaveLength(2);
    expect(channels.items[0]?.providerId).toBe(provider.identity.id);

    const playback = await provider.resolvePlayback('vtv3.vn', context);
    expect(playback.primary.url).toContain('stream-a');
    expect(playback.primary.headers?.['user-agent']).toBe('FullMedia-Test');
    expect(playback.alternatives).toHaveLength(1);
    expect(playback.alternatives[0]?.url).toContain('stream-b');

    const epg = await provider.epg(
      {
        channelRef: 'vtv3.vn',
        from: '2026-09-16T11:00:00.000Z',
        to: '2026-09-16T14:00:00.000Z',
      },
      context,
    );
    expect(epg).toHaveLength(1);
    expect(epg[0]?.title).toBe('Thời sự tối');
  });
});
