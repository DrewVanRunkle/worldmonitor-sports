// Personal-use widget (VITE_ENABLE_SPORTS_NEWS): pulls league headlines from
// ESPN's public site API. No API key required, no first-party backend
// involved — this hits ESPN directly from the browser.

export interface SportsHeadline {
  id: string;
  headline: string;
  link: string;
  publishedMs: number;
  imageUrl: string | null;
}

export interface NewsBoard {
  leagueLabel: string;
  items: SportsHeadline[];
}

interface LeagueDef {
  slug: string;
  label: string;
}

const LEAGUES: LeagueDef[] = [
  { slug: 'football/nfl', label: 'NFL' },
  { slug: 'basketball/nba', label: 'NBA' },
  { slug: 'baseball/mlb', label: 'MLB' },
  { slug: 'hockey/nhl', label: 'NHL' },
  { slug: 'soccer/eng.1', label: 'Premier League' },
  { slug: 'soccer/usa.1', label: 'MLS' },
];

const MAX_ITEMS_PER_LEAGUE = 5;

interface EspnNewsImage {
  url?: string;
}

interface EspnNewsArticle {
  headline: string;
  published?: string;
  links?: { web?: { href?: string } };
  images?: EspnNewsImage[];
}

interface EspnNewsResponse {
  articles?: EspnNewsArticle[];
}

async function fetchLeagueNews(def: LeagueDef, signal: AbortSignal): Promise<SportsHeadline[]> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/${def.slug}/news`;
  const resp = await fetch(url, { signal });
  if (!resp.ok) throw new Error(`ESPN ${def.label} news: ${resp.status}`);
  const data = await resp.json() as EspnNewsResponse;

  const items: SportsHeadline[] = [];
  for (const article of (data.articles ?? []).slice(0, MAX_ITEMS_PER_LEAGUE)) {
    const link = article.links?.web?.href ?? '';
    if (!article.headline || !link) continue;
    items.push({
      id: link,
      headline: article.headline,
      link,
      publishedMs: article.published ? Date.parse(article.published) : Date.now(),
      imageUrl: article.images?.[0]?.url ?? null,
    });
  }
  return items;
}

export async function fetchAllSportsNews(signal: AbortSignal): Promise<NewsBoard[]> {
  const results = await Promise.allSettled(
    LEAGUES.map(async def => ({ label: def.label, items: await fetchLeagueNews(def, signal) })),
  );
  const boards: NewsBoard[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value.items.length > 0) {
      boards.push({ leagueLabel: result.value.label, items: result.value.items });
    }
  }
  return boards;
}
