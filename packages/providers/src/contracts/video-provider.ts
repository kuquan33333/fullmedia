import type { ProviderAdapter } from '../core/provider-adapter';
import type { PageQuery, PageResult, PlaybackDescriptor, ProviderRequestContext } from '../core/types';
import type { VideoChannel, VideoItem, VideoPlaylist } from './dtos';

export interface VideoHomeQuery extends PageQuery {
  category?: string;
}

export interface VideoProvider extends ProviderAdapter {
  home(query: VideoHomeQuery, context: ProviderRequestContext): Promise<PageResult<VideoItem>>;
  search(query: string, page: PageQuery, context: ProviderRequestContext): Promise<PageResult<VideoItem>>;
  video(videoRef: string, context: ProviderRequestContext): Promise<VideoItem>;
  channel(channelRef: string, context: ProviderRequestContext): Promise<VideoChannel>;
  playlists(channelRef: string, context: ProviderRequestContext): Promise<VideoPlaylist[]>;
  resolvePlayback(videoRef: string, context: ProviderRequestContext): Promise<PlaybackDescriptor>;
}

export function isVideoProvider(provider: ProviderAdapter): provider is VideoProvider {
  return provider.supports('VIDEO_DETAIL') || provider.supports('VIDEO_HOME');
}
