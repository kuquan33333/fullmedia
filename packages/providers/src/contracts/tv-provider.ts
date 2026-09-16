import type { ProviderAdapter } from '../core/provider-adapter';
import type { PageQuery, PageResult, PlaybackDescriptor, ProviderRequestContext } from '../core/types';
import type { EpgProgramme, TVChannel } from './dtos';

export interface TVChannelQuery extends PageQuery {
  group?: string;
  search?: string;
}

export interface TVEpgQuery {
  channelRef: string;
  from: string;
  to: string;
}

export interface TVProvider extends ProviderAdapter {
  channels(query: TVChannelQuery, context: ProviderRequestContext): Promise<PageResult<TVChannel>>;
  epg(query: TVEpgQuery, context: ProviderRequestContext): Promise<EpgProgramme[]>;
  resolvePlayback(channelRef: string, context: ProviderRequestContext): Promise<PlaybackDescriptor>;
}

export function isTVProvider(provider: ProviderAdapter): provider is TVProvider {
  return provider.supports('TV_CHANNELS');
}
