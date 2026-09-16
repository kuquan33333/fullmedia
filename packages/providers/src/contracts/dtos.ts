export interface CanonicalRef {
  id: string;
  providerId?: string;
  externalId?: string;
}

export interface MovieSummary extends CanonicalRef {
  title: string;
  originalTitle?: string;
  posterUrl?: string;
  backdropUrl?: string;
  releaseYear?: number;
  type: 'MOVIE' | 'SERIES' | 'ANIME' | 'TV_SHOW';
  status?: string;
  genres?: string[];
  countries?: string[];
}

export interface MovieDetail extends MovieSummary {
  overview?: string;
  runtimeMinutes?: number;
  ageRating?: string;
  metadata?: Readonly<Record<string, unknown>>;
}

export interface Episode extends CanonicalRef {
  titleId: string;
  seasonNumber?: number;
  episodeNumber: number;
  name?: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
}

export interface TVChannel extends CanonicalRef {
  name: string;
  shortName?: string;
  logoUrl?: string;
  group?: string;
  isHd?: boolean;
}

export interface EpgProgramme extends CanonicalRef {
  channelId: string;
  title: string;
  description?: string;
  startsAt: string;
  endsAt: string;
  category?: string;
}

export interface FootballCompetition extends CanonicalRef {
  name: string;
  shortName?: string;
  logoUrl?: string;
  countryCode?: string;
}

export interface FootballTeam extends CanonicalRef {
  name: string;
  shortName?: string;
  logoUrl?: string;
  countryCode?: string;
}

export type FootballMatchStatus =
  | 'SCHEDULED'
  | 'PRE_MATCH'
  | 'LIVE'
  | 'HALFTIME'
  | 'FINISHED'
  | 'POSTPONED'
  | 'CANCELLED'
  | 'SUSPENDED';

export interface FootballMatch extends CanonicalRef {
  competitionId: string;
  homeTeam: FootballTeam;
  awayTeam: FootballTeam;
  kickoffAt: string;
  status: FootballMatchStatus;
  minute?: number;
  homeScore?: number;
  awayScore?: number;
  updatedAt?: string;
}

export interface FootballStanding {
  competitionId: string;
  season: string;
  team: FootballTeam;
  position: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}

export interface VideoChannel extends CanonicalRef {
  title: string;
  avatarUrl?: string;
  bannerUrl?: string;
}

export interface VideoItem extends CanonicalRef {
  channelId?: string;
  type: 'VIDEO' | 'SHORT' | 'LIVE';
  title: string;
  description?: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
  publishedAt?: string;
  embeddable?: boolean;
}

export interface VideoPlaylist extends CanonicalRef {
  channelId?: string;
  title: string;
  description?: string;
  thumbnailUrl?: string;
}
