// Personal-use widget (VITE_ENABLE_SPORTS): pulls today's scoreboard from
// ESPN's public site API. No API key required, no first-party backend
// involved — this hits ESPN directly from the browser.

export interface SportsGame {
  id: string;
  shortName: string;
  state: 'pre' | 'in' | 'post';
  statusDetail: string;
  homeTeam: string;
  homeAbbr: string;
  homeScore: string;
  awayTeam: string;
  awayAbbr: string;
  awayScore: string;
  venueName?: string;
  venueCity?: string;
  venueState?: string;
}

export interface SportsScoreboard {
  leagueLabel: string;
  games: SportsGame[];
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

interface EspnCompetitor {
  homeAway: 'home' | 'away';
  score?: string;
  team: { displayName: string; abbreviation: string };
}

interface EspnVenue {
  fullName?: string;
  address?: { city?: string; state?: string; country?: string };
}

interface EspnEvent {
  id: string;
  shortName: string;
  status?: { type?: { state?: string; shortDetail?: string } };
  competitions?: Array<{ competitors?: EspnCompetitor[]; venue?: EspnVenue }>;
}

interface EspnScoreboardResponse {
  events?: EspnEvent[];
}

function formatEspnDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

async function fetchLeagueScoreboard(def: LeagueDef, signal: AbortSignal, date?: Date): Promise<SportsGame[]> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/${def.slug}/scoreboard${date ? `?dates=${formatEspnDate(date)}` : ''}`;
  const resp = await fetch(url, { signal });
  if (!resp.ok) throw new Error(`ESPN ${def.label} scoreboard: ${resp.status}`);
  const data = await resp.json() as EspnScoreboardResponse;

  const games: SportsGame[] = [];
  for (const event of data.events ?? []) {
    const competition = event.competitions?.[0];
    const competitors = competition?.competitors ?? [];
    const home = competitors.find(c => c.homeAway === 'home');
    const away = competitors.find(c => c.homeAway === 'away');
    if (!home || !away) continue;
    const venue = competition?.venue;
    games.push({
      id: event.id,
      shortName: event.shortName,
      state: (event.status?.type?.state as SportsGame['state']) ?? 'pre',
      statusDetail: event.status?.type?.shortDetail ?? '',
      homeTeam: home.team.displayName,
      homeAbbr: home.team.abbreviation,
      homeScore: home.score ?? '',
      awayTeam: away.team.displayName,
      awayAbbr: away.team.abbreviation,
      awayScore: away.score ?? '',
      venueName: venue?.fullName,
      venueCity: venue?.address?.city,
      venueState: venue?.address?.state,
    });
  }
  return games;
}

export async function fetchAllSportsScores(signal: AbortSignal, date?: Date): Promise<SportsScoreboard[]> {
  const results = await Promise.allSettled(
    LEAGUES.map(async def => ({ label: def.label, games: await fetchLeagueScoreboard(def, signal, date) })),
  );
  const boards: SportsScoreboard[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value.games.length > 0) {
      boards.push({ leagueLabel: result.value.label, games: result.value.games });
    }
  }
  return boards;
}
