import { describe, expect, it } from 'vitest';
import {
  LUAN9X_EXPECTED_CHANNEL_COUNT,
  LUAN9X_EXPECTED_EPG_SOURCE_COUNT,
  LUAN9X_EXPECTED_STREAM_COUNT,
  LUAN9X_INITIAL_CHANNELS,
} from './index';

describe('Luan9x initial TV catalog', () => {
  it('contains all 100 channel declarations from the supplied playlist metadata', () => {
    expect(LUAN9X_INITIAL_CHANNELS).toHaveLength(LUAN9X_EXPECTED_CHANNEL_COUNT);
    expect(new Set(LUAN9X_INITIAL_CHANNELS.map((item) => item.canonicalKey)).size).toBe(LUAN9X_EXPECTED_CHANNEL_COUNT);
  });

  it('tracks the 96 channels that had an initial stream URL', () => {
    const playable = LUAN9X_INITIAL_CHANNELS.filter((item) => item.hasInitialStream);
    expect(playable).toHaveLength(LUAN9X_EXPECTED_STREAM_COUNT);
  });

  it('keeps metadata for the four channels that had no stream URL', () => {
    const missing = LUAN9X_INITIAL_CHANNELS
      .filter((item) => !item.hasInitialStream)
      .map((item) => item.name)
      .sort();

    expect(missing).toEqual([
      'TV BRICS',
      'ЛДПР ТВ HD',
      'Союз',
      'Три Ангела',
    ].sort());
  });

  it('locks the supplied header EPG source count for import verification', () => {
    expect(LUAN9X_EXPECTED_EPG_SOURCE_COUNT).toBe(27);
  });

  it('retains the main VTV and HTV channel groups', () => {
    const vtv = LUAN9X_INITIAL_CHANNELS.filter((item) => item.groupSlug === 'vtv');
    const htv = LUAN9X_INITIAL_CHANNELS.filter((item) => item.groupSlug === 'htv');
    expect(vtv).toHaveLength(10);
    expect(htv).toHaveLength(10);
    expect(vtv.map((item) => item.name)).toContain('VTV1 HD');
    expect(htv.map((item) => item.name)).toContain('HTV7');
  });
});
