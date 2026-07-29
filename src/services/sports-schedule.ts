// Personal-use widget (VITE_ENABLE_SPORTS_SCHEDULE): pulls the next few days
// of scheduled games from ESPN's public site API. No API key required, no
// first-party backend involved — this hits ESPN directly from the browser.

export interface ScheduledGame {
  id: string;
  shortName: string;
  dateMs: number;
  statusDetail: string;
  homeTeam: string;
  homeAbbr: string;
  awayTeam: string;
  awayAbbr: string;
}

export interface ScheduleBoard {
  leagueLabel: string;
  games: ScheduledGame[];
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

const LOOKAHEAD_DAYS = 7;
const MAX_GAMES_PER_LEAGUE = 8;

interface EspnCompetitor {
  homeAway: 'home' | 'away';
  team: { displayName: string; abbreviation: string };
}

interface EspnEvent {
  id: string;
  shortName: string;
  date: string;
  status?: { type?: { shortDetail?: string } };
  competitions?: Array<{ competitors?: EspnCompetitor[] }>;
}

interface EspnScoreboardResponse {
  events?: EspnEvent[];
}

function formatYyyymmdd(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

async function fetchLeagueSchedule(def: LeagueDef, signal: AbortSignal): Promise<ScheduledGame[]> {
  const now = Date.now();
  const start = new Date(now);
  const end = new Date(now + LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);
  const dates = `${formatYyyymmdd(start)}-${formatYyyymmdd(end)}`;
  const url = `https://site.api.espn.com/apis/site/v2/sports/${def.slug}/scoreboard?dates=${dates}`;
  const resp = await fetch(url, { signal });
  if (!resp.ok) throw new Error(`ESPN ${def.label} schedule: ${resp.status}`);
  const data = await resp.json() as EspnScoreboardResponse;

  const games: ScheduledGame[] = [];
  for (const event of data.events ?? []) {
    const dateMs = Date.parse(event.date);
    if (!Number.isFinite(dateMs) || dateMs < now) continue;
    const competitors = event.competitions?.[0]?.competitors ?? [];
    const home = competitors.find(c => c.homeAway === 'home');
    const away = competitors.find(c => c.homeAway === 'away');
    if (!home || !away) continue;
    games.push({
      id: event.id,
      shortName: event.shortName,
      dateMs,
      statusDetail: event.status?.type?.shortDetail ?? '',
      homeTeam: home.team.displayName,
      homeAbbr: home.team.abbreviation,
      awayTeam: away.team.displayName,
      awayAbbr: away.team.abbreviation,
    });
  }
  games.sort((a, b) => a.dateMs - b.dateMs);
  return games.slice(0, MAX_GAMES_PER_LEAGUE);
}

export async function fetchAllSchedules(signal: AbortSignal): Promise<ScheduleBoard[]> {
  const results = await Promise.allSettled(
    LEAGUES.map(async def => ({ label: def.label, games: await fetchLeagueSchedule(def, signal) })),
  );
  const boards: ScheduleBoard[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value.games.length > 0) {
      boards.push({ leagueLabel: result.value.label, games: result.value.games });
    }
  }
  return boards;
}
