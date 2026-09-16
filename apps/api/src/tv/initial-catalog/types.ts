export interface InitialTvChannelSeed {
  canonicalKey: string;
  name: string;
  groupSlug: string;
  sourceGroup?: string;
  tvgId?: string;
  logoUrl?: string;
  isHd: boolean;
  hasInitialStream: boolean;
}

export interface InitialTvGroupSeed {
  slug: string;
  name: string;
  sortOrder: number;
}

export const INITIAL_TV_GROUPS: readonly InitialTvGroupSeed[] = [
  { slug: 'vtv', name: 'VTV', sortOrder: 10 },
  { slug: 'htv', name: 'HTV', sortOrder: 20 },
  { slug: 'international', name: 'Quốc tế', sortOrder: 80 },
  { slug: 'cis', name: 'Nga & CIS', sortOrder: 81 },
  { slug: 'west-asia', name: 'Tây Á', sortOrder: 82 },
  { slug: 'education', name: 'Giáo dục · Khoa học · Công nghệ', sortOrder: 83 },
  { slug: 'news', name: 'Tin tức · Tài chính quốc tế', sortOrder: 84 },
  { slug: 'entertainment', name: 'Văn hóa · Nghệ thuật · Giải trí', sortOrder: 85 },
];
