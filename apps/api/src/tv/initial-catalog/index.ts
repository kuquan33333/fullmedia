import { LUAN9X_CHANNELS_PART_1 } from './luan9x-part-1';
import { LUAN9X_CHANNELS_PART_2 } from './luan9x-part-2';
import { LUAN9X_CHANNELS_PART_3 } from './luan9x-part-3';
import { LUAN9X_CHANNELS_PART_4 } from './luan9x-part-4';
import { INITIAL_TV_GROUPS } from './types';

export * from './types';

export const LUAN9X_INITIAL_CHANNELS = [
  ...LUAN9X_CHANNELS_PART_1,
  ...LUAN9X_CHANNELS_PART_2,
  ...LUAN9X_CHANNELS_PART_3,
  ...LUAN9X_CHANNELS_PART_4,
] as const;

export const LUAN9X_INITIAL_GROUPS = INITIAL_TV_GROUPS;
export const LUAN9X_EXPECTED_CHANNEL_COUNT = 100;
export const LUAN9X_EXPECTED_STREAM_COUNT = 96;
export const LUAN9X_EXPECTED_EPG_SOURCE_COUNT = 27;
