"use client";

// Generic social media analytics block. Renders any SocialReport
// (src/lib/integrations/social.ts) — Instagram today; TikTok, LinkedIn,
// Pinterest etc. later — so new social platforms need no new viz code.
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Users, Eye, Sparkles, Film, Heart, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SocialReport } from "@/lib/integrations/social";

const fmtNum = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;
const fmtSigned = (n: number) => (n > 0 ? `+${fmtNum(n)}` : fmtNum(n));
const shortDate = (d: string) => d.slice(5); // MM-DD

function MetricChart({
  title, icon: Icon, value, color, data, dataKey,
}: {
  title: string;
  icon: typeof Users;
  value: string;
  color: string;
  data: SocialReport["byDate"];
  dataKey: "reach" | "followerChange";
}) {
  const id = `social-grad-${dataKey}`;
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm text-ink-500">
          <Icon size={15} style={{ color }} /> {title}
        </CardTitle>
        <p className="text-2xl font-semibold text-ink-900">{value}</p>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="h-24">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" hide />
              <Tooltip
                contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }}
                labelFormatter={(l) => shortDate(String(l))}
                formatter={(v) => [fmtNum(Number(v)), title]}
              />
              <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} fill={`url(#${id})`} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
      <p className="text-xs text-ink-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-ink-900">{value}</p>
    </div>
  );
}

export function SocialAnalytics({ report, sample = false }: { report: SocialReport; sample?: boolean }) {
  const { profile, totals, byDate, topPosts, notes } = report;

  return (
    <div className={`space-y-5 ${sample ? "relative" : ""}`}>
      {sample && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
          <Sparkles size={14} /> Sample data — connect Instagram above to see this client&apos;s real numbers.
        </div>
      )}

      {/* Profile header */}
      <Card className={sample ? "opacity-70" : ""}>
        <CardContent className="flex flex-wrap items-center gap-4 p-5">
          {profile.picture ? (
            // eslint-disable-next-line @next/next/no-img-element -- external CDN avatar, unknown host
            <img src={profile.picture} alt="" className="h-12 w-12 rounded-full border border-slate-200 object-cover" />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-fuchsia-50 text-lg font-semibold text-fuchsia-600" aria-hidden>
              {(profile.username || profile.name).charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-ink-900">@{profile.username || profile.name}</p>
            <p className="truncate text-sm text-ink-500">{profile.name}</p>
          </div>
          <div className="flex gap-6 text-center">
            <div>
              <p className="text-lg font-semibold text-ink-900">{fmtNum(profile.followers)}</p>
              <p className="text-xs text-ink-400">Followers</p>
            </div>
            <div>
              <p className="text-lg font-semibold text-ink-900">{fmtNum(profile.following)}</p>
              <p className="text-xs text-ink-400">Following</p>
            </div>
            <div>
              <p className="text-lg font-semibold text-ink-900">{fmtNum(profile.mediaCount)}</p>
              <p className="text-xs text-ink-400">Posts</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${sample ? "opacity-70" : ""}`}>
        <MetricChart title="Reach" icon={Eye} value={fmtNum(totals.reach)} color="#d946ef" data={byDate} dataKey="reach" />
        <MetricChart title="Follower growth" icon={Users} value={fmtSigned(totals.followerGrowth)} color="#4f46e5" data={byDate} dataKey="followerChange" />
      </div>

      <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 ${sample ? "opacity-70" : ""}`}>
        <Stat label="Impressions" value={fmtNum(totals.impressions)} />
        <Stat label="Profile visits" value={fmtNum(totals.profileViews)} />
        <Stat label="Website clicks" value={fmtNum(totals.websiteClicks)} />
        <Stat label="Posts" value={fmtNum(totals.posts)} />
        <Stat label="Reels" value={fmtNum(totals.reels)} />
        <Stat label="Stories (24h)" value={fmtNum(totals.stories)} />
        <Stat label="Likes" value={fmtNum(totals.likes)} />
        <Stat label="Comments" value={fmtNum(totals.comments)} />
        <Stat label="Shares" value={fmtNum(totals.shares)} />
        <Stat label="Saves" value={fmtNum(totals.saves)} />
        <Stat label="Engagements" value={fmtNum(totals.engagements)} />
        <Stat label="Engagement rate" value={fmtPct(totals.engagementRate)} />
      </div>

      {topPosts.length > 0 && (
        <Card className={sample ? "opacity-70" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Heart size={15} className="text-ink-400" /> Top content
            </CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-400">
                  <th className="pb-2 font-medium">Content</th>
                  <th className="pb-2 text-right font-medium">Likes</th>
                  <th className="pb-2 text-right font-medium">Comments</th>
                  <th className="pb-2 text-right font-medium">Saves</th>
                  <th className="pb-2 text-right font-medium">Shares</th>
                </tr>
              </thead>
              <tbody>
                {topPosts.map((p) => (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="max-w-0 truncate py-2 pr-3 text-ink-800">
                      <span className={`mr-2 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${p.type === "reel" ? "bg-fuchsia-50 text-fuchsia-600" : "bg-slate-100 text-ink-500"}`}>
                        {p.type === "reel" && <Film size={10} aria-hidden />}
                        {p.type === "reel" ? "Reel" : "Post"}
                      </span>
                      {p.permalink ? (
                        <a href={p.permalink} target="_blank" rel="noopener noreferrer" className="hover:underline" title={p.caption}>
                          {p.caption || p.timestamp.slice(0, 10)}
                        </a>
                      ) : (
                        <span title={p.caption}>{p.caption || p.timestamp.slice(0, 10)}</span>
                      )}
                    </td>
                    <td className="py-2 text-right text-ink-600">{fmtNum(p.likes)}</td>
                    <td className="py-2 text-right text-ink-600">{fmtNum(p.comments)}</td>
                    <td className="py-2 text-right text-ink-600">{fmtNum(p.saves)}</td>
                    <td className="py-2 text-right text-ink-600">{fmtNum(p.shares)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {notes.length > 0 && (
        <div className="space-y-1">
          {notes.map((n) => (
            <p key={n} className="flex items-start gap-1.5 text-xs text-ink-400">
              <Info size={12} className="mt-0.5 shrink-0" /> {n}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
