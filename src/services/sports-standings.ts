// Personal-use widget (VITE_ENABLE_SPORTS_STANDINGS): pulls current league
// standings from ESPN's public site API. No API key required, no first-party
// backend involved — this hits ESPN directly from the browser.

export interface StandingsTeam {
  id: string;
  name: string;
  abbr: string;
  wins: string;
  losses: string;
  ties: string;
  winPct: string;
}

export interface StandingsGroup {
  groupLabel: string;
  teams: StandingsTeam[];
}

export interface LeagueStandings {
  leagueLabel: string;
  groups: StandingsGroup[];
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
];

interface EspnStandingStat {
  name: string;
  displayValue: string;
}

interface EspnStandingsEntry {
  team: { displayName: string; abbreviation: string };
  stats?: EspnStandingStat[];
}

interface EspnStandingsGroup {
  name?: string;
  standings?: { entries?: EspnStandingsEntry[] };
  groups?: EspnStandingsGroup[];
}

interface EspnStandingsResponse {
  children?: EspnStandingsGroup[];
}

function statValue(stats: EspnStandingStat[] | undefined, name: string): string {
  return stats?.find(s => s.name === name)?.displayValue ?? '';
}

function flattenGroups(groups: EspnStandingsGroup[] | undefined, label: string): StandingsGroup[] {
  const out: StandingsGroup[] = [];
  for (const group of groups ?? []) {
    const entries = group.standings?.entries;
    if (entries?.length) {
      out.push({
        groupLabel: group.name ?? label,
        teams: entries.map((entry, i) => ({
          id: `${entry.team.abbreviation}-${i}`,
          name: entry.team.displayName,
          abbr: entry.team.abbreviation,
          wins: statValue(entry.stats, 'wins'),
          losses: statValue(entry.stats, 'losses'),
          ties: statValue(entry.stats, 'ties'),
          winPct: statValue(entry.stats, 'winPercent'),
        })),
      });
    }
    if (group.groups?.length) {
      out.push(...flattenGroups(group.groups, group.name ?? label));
    }
  }
  return out;
}

async function fetchLeagueStandings(def: LeagueDef, signal: AbortSignal): Promise<StandingsGroup[]> {
  const url = `https://site.api.espn.com/apis/v2/sports/${def.slug}/standings`;
  const resp = await fetch(url, { signal });
  if (!resp.ok) throw new Error(`ESPN ${def.label} standings: ${resp.status}`);
  const data = await resp.json() as EspnStandingsResponse;
  return flattenGroups(data.children, def.label);
}

export async function fetchAllStandings(signal: AbortSignal): Promise<LeagueStandings[]> {
  const results = await Promise.allSettled(
    LEAGUES.map(async def => ({ label: def.label, groups: await fetchLeagueStandings(def, signal) })),
  );
  const boards: LeagueStandings[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value.groups.length > 0) {
      boards.push({ leagueLabel: result.value.label, groups: result.value.groups });
    }
  }
  return boards;
}
