import { Panel } from './Panel';
import { escapeHtml, unsafeRawHtml } from '@/utils/sanitize';
import { fetchAllSportsScores, type SportsGame, type SportsScoreboard } from '@/services/sports-scores';

const REFRESH_MS = 60_000;

function stateColor(state: SportsGame['state']): string {
  if (state === 'in') return '#2ecc71';
  return 'var(--text-dim)';
}

function renderGame(game: SportsGame): string {
  const live = game.state === 'in';
  return `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 8px;border-bottom:1px solid rgba(255,255,255,0.06);font-size:12px">
      <div style="flex:1;min-width:0">
        <div style="display:flex;justify-content:space-between;gap:8px">
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(game.awayAbbr || game.awayTeam)}</span>
          <span style="font-weight:600">${escapeHtml(game.awayScore)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;gap:8px">
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(game.homeAbbr || game.homeTeam)}</span>
          <span style="font-weight:600">${escapeHtml(game.homeScore)}</span>
        </div>
      </div>
      <div style="flex-shrink:0;width:76px;text-align:right;font-size:10px;color:${stateColor(game.state)};${live ? 'font-weight:600' : ''}">${escapeHtml(game.statusDetail)}</div>
    </div>`;
}

function renderBoard(board: SportsScoreboard): string {
  return `
    <div style="margin-bottom:10px">
      <div style="font-size:11px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.05em;padding:4px 8px">${escapeHtml(board.leagueLabel)}</div>
      ${board.games.map(renderGame).join('')}
    </div>`;
}

export class SportsScoresPanel extends Panel {
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super({ id: 'sports-scores', title: 'Sports Scores', showCount: false, collapsible: true });
    void this.fetchData();
    this.refreshTimer = setInterval(() => void this.fetchData(), REFRESH_MS);
  }

  public async fetchData(): Promise<boolean> {
    try {
      const boards = await fetchAllSportsScores(this.signal);
      if (boards.length === 0) {
        this.showError('No games today', () => void this.fetchData());
        return false;
      }
      const html = boards.map(renderBoard).join('');
      this.setSafeContent(unsafeRawHtml(html, 'sports scores panel — trusted static markup, escaped team/score fields'));
      return true;
    } catch (e) {
      if (this.isAbortError(e)) return false;
      this.showError(e instanceof Error ? e.message : 'Failed to load scores', () => void this.fetchData());
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
