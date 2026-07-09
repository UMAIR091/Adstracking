// Platform-agnostic social media report shape. Instagram fills it today;
// TikTok, LinkedIn, Pinterest, Facebook Pages etc. fill the same shape later so
// the sync pipeline, snapshot cache, UI (SocialAnalytics) and future report
// sections work for every social platform without per-platform plumbing.
// Metrics a platform can't provide stay 0 and the UI/report omit them.

export type SocialProfile = {
  id: string;
  username: string; // handle without the @
  name: string;
  picture: string | null;
  website: string | null;
  followers: number;
  following: number;
  mediaCount: number;
};

export type SocialTotals = {
  followers: number; // at snapshot time
  followerGrowth: number; // net new followers in the period
  reach: number;
  impressions: number; // "views" on newer Meta API versions
  profileViews: number;
  websiteClicks: number;
  posts: number; // feed posts published in the period
  reels: number; // reels/short-video published in the period
  stories: number; // active stories (Instagram only exposes the last 24h)
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  engagements: number; // likes + comments + shares + saves
  engagementRate: number; // engagements / followers, 0..1
};

export type SocialDay = {
  date: string; // YYYY-MM-DD
  reach: number;
  followerChange: number; // net new followers that day (0 when unavailable)
};

export type SocialPost = {
  id: string;
  type: "post" | "reel";
  caption: string;
  permalink: string | null;
  timestamp: string; // ISO
  likes: number;
  comments: number;
  saves: number;
  shares: number;
};

export type SocialReport = {
  platform: string; // matches the integration id, e.g. "instagram"
  profile: SocialProfile;
  totals: SocialTotals;
  previousTotals: SocialTotals | null; // prior equal-length period (best effort)
  byDate: SocialDay[];
  topPosts: SocialPost[];
  // Human-readable caveats surfaced in the UI (e.g. API limits on history).
  notes: string[];
};

export function emptySocialTotals(): SocialTotals {
  return {
    followers: 0, followerGrowth: 0, reach: 0, impressions: 0, profileViews: 0,
    websiteClicks: 0, posts: 0, reels: 0, stories: 0, likes: 0, comments: 0,
    shares: 0, saves: 0, engagements: 0, engagementRate: 0,
  };
}

export function engagementRate(engagements: number, followers: number): number {
  return followers > 0 ? engagements / followers : 0;
}
