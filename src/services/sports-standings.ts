// Personal-use widget (part of VITE_ENABLE_SPORTS): pulls current league
// standings from ESPN's public site API. No API key required, no first-party
// backend involved — this hits ESPN directly from the browser.
//
// League metadata (slug/label) is shared with sports-scores.ts's LEAGUES —
// same six leagues as the per-league score panels, same ESPN site-API sport
// slugs (standings and scoreboard live under the same sport/league path).
import { LEAGUES, type LeagueKey } from '@/services/sports-scores';

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

function getLeagueDef(key: LeagueKey) {
  const def = LEAGUES.find(l => l.key === key);
  if (!def) throw new Error(`Unknown league key: ${key}`);
  return def;
}

export async function fetchSingleLeagueStandings(key: LeagueKey, signal: AbortSignal): Promise<StandingsGroup[]> {
  const def = getLeagueDef(key);
  const url = `https://site.api.espn.com/apis/v2/sports/${def.slug}/standings`;
  const resp = await fetch(url, { signal });
  if (!resp.ok) throw new Error(`ESPN ${def.label} standings: ${resp.status}`);
  const data = await resp.json() as EspnStandingsResponse;
  return flattenGroups(data.children, def.label);
}
