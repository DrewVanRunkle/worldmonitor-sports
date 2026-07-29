import { Panel } from './Panel';
import { escapeHtml, unsafeRawHtml } from '@/utils/sanitize';
import { fetchAllStandings, type LeagueStandings, type StandingsGroup } from '@/services/sports-standings';

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

function renderLeague(league: LeagueStandings): string {
  return `
    <div style="margin-bottom:10px">
      <div style="font-size:11px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.05em;padding:4px 8px">${escapeHtml(league.leagueLabel)}</div>
      ${league.groups.map(renderGroup).join('')}
    </div>`;
}

export class SportsStandingsPanel extends Panel {
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super({ id: 'sports-standings', title: 'Sports Standings', showCount: false, collapsible: true });
    void this.fetchData();
    this.refreshTimer = setInterval(() => void this.fetchData(), REFRESH_MS);
  }

  public async fetchData(): Promise<boolean> {
    try {
      const leagues = await fetchAllStandings(this.signal);
      if (leagues.length === 0) {
        this.showError('No standings available', () => void this.fetchData());
        return false;
      }
      const html = leagues.map(renderLeague).join('');
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
