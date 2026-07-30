import { Panel } from './Panel';
import { escapeHtml, unsafeRawHtml } from '@/utils/sanitize';
import { fetchSingleLeagueStandings, type StandingsGroup } from '@/services/sports-standings';
import { isLeagueInSeason, type LeagueKey } from '@/services/sports-scores';

const REFRESH_MS = 15 * 60_000;

function renderGroup(group: StandingsGroup): string {
  return `
    <div style="margin-bottom:6px">
      <div style="font-size:10px;color:var(--text-dim);padding:2px 8px">${escapeHtml(group.groupLabel)}</div>
      ${group.teams.map(team => `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:4px 8px;font-size:12px">
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0">${escapeHtml(team.abbr || team.name)}</span>
          <span style="flex-shrink:0;font-variant-numeric:tabular-nums;color:var(--text-dim)">${escapeHtml(team.wins)}-${escapeHtml(team.losses)}${team.ties && team.ties !== '0' ? `-${escapeHtml(team.ties)}` : ''}</span>
        </div>`).join('')}
    </div>`;
}

/** Shared base for the per-league standings panels below — same pattern as
 *  SportsLeaguePanel.ts's multiple exported panel classes from one file, so
 *  vite.config.ts's PANEL_CLUSTER only needs a single "SportsStandings" entry. */
abstract class SportsLeagueStandingsPanel extends Panel {
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private readonly leagueKey: LeagueKey;

  constructor(id: string, title: string, leagueKey: LeagueKey) {
    super({ id, title, showCount: false, collapsible: true });
    this.leagueKey = leagueKey;
    void this.fetchData();
    this.refreshTimer = setInterval(() => void this.fetchData(), REFRESH_MS);
  }

  public async fetchData(): Promise<boolean> {
    try {
      if (!isLeagueInSeason(this.leagueKey)) {
        this.setSafeContent(unsafeRawHtml(
          '<div style="text-align:center;padding:12px;font-size:12px;color:var(--text-dim)">Off-season</div>',
          'sports standings panel — off-season state',
        ));
        return true;
      }

      const groups = await fetchSingleLeagueStandings(this.leagueKey, this.signal);
      if (groups.length === 0) {
        this.showError('No standings available', () => void this.fetchData());
        return false;
      }
      const html = groups.map(renderGroup).join('');
      this.setSafeContent(unsafeRawHtml(html, 'sports standings panel — trusted static markup, escaped team/record fields'));
      return true;
    } catch (e) {
      if (this.isAbortError(e)) return false;
      this.showError(e instanceof Error ? e.message : 'Failed to load standings', () => void this.fetchData());
      return false;
    }
  }

  public destroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    super.destroy();
  }
}

export class NflStandingsPanel extends SportsLeagueStandingsPanel {
  constructor() { super('sports-standings-nfl', 'NFL Standings', 'nfl'); }
}

export class NbaStandingsPanel extends SportsLeagueStandingsPanel {
  constructor() { super('sports-standings-nba', 'NBA Standings', 'nba'); }
}

export class MlbStandingsPanel extends SportsLeagueStandingsPanel {
  constructor() { super('sports-standings-mlb', 'MLB Standings', 'mlb'); }
}

export class NhlStandingsPanel extends SportsLeagueStandingsPanel {
  constructor() { super('sports-standings-nhl', 'NHL Standings', 'nhl'); }
}

export class EplStandingsPanel extends SportsLeagueStandingsPanel {
  constructor() { super('sports-standings-epl', 'Premier League Standings', 'epl'); }
}

export class MlsStandingsPanel extends SportsLeagueStandingsPanel {
  constructor() { super('sports-standings-mls', 'MLS Standings', 'mls'); }
}
