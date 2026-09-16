import type { ProviderAdapter } from '../core/provider-adapter';
import type { PlaybackDescriptor, ProviderRequestContext } from '../core/types';
import type { FootballMatch, FootballStanding } from './dtos';

export interface FootballFixtureQuery {
  dateFrom: string;
  dateTo: string;
  competitionRef?: string;
  teamRef?: string;
}

export interface FootballStandingsQuery {
  competitionRef: string;
  season?: string;
}

export interface FootballDataProvider extends ProviderAdapter {
  fixtures(query: FootballFixtureQuery, context: ProviderRequestContext): Promise<FootballMatch[]>;
  match(matchRef: string, context: ProviderRequestContext): Promise<FootballMatch>;
  standings(query: FootballStandingsQuery, context: ProviderRequestContext): Promise<FootballStanding[]>;
}

export interface FootballStreamProvider extends ProviderAdapter {
  resolveMatchPlayback(matchRef: string, context: ProviderRequestContext): Promise<PlaybackDescriptor>;
}

export function isFootballDataProvider(provider: ProviderAdapter): provider is FootballDataProvider {
  return provider.supports('FOOTBALL_FIXTURES') || provider.supports('FOOTBALL_MATCH');
}

export function isFootballStreamProvider(provider: ProviderAdapter): provider is FootballStreamProvider {
  return provider.supports('FOOTBALL_PLAYBACK');
}
