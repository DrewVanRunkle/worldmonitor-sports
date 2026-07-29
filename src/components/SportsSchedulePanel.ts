import { Panel } from './Panel';
import { escapeHtml, unsafeRawHtml } from '@/utils/sanitize';
import { fetchAllSchedules, type ScheduleBoard, type ScheduledGame } from '@/services/sports-schedule';

const REFRESH_MS = 15 * 60_000;

function formatGameTime(dateMs: number): string {
  const date = new Date(dateMs);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const timePart = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return timePart;
  const datePart = date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  return `${datePart} ${timePart}`;
}

function renderGame(game: ScheduledGame): string {
  return `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 8px;border-bottom:1px solid rgba(255,255,255,0.06);font-size:12px">
      <div style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
        ${escapeHtml(game.awayAbbr || game.awayTeam)} @ ${escapeHtml(game.homeAbbr || game.homeTeam)}
      </div>
      <div style="flex-shrink:0;font-size:10px;color:var(--text-dim);text-align:right">${escapeHtml(formatGameTime(game.dateMs))}</div>
    </div>`;
}

function renderBoard(board: ScheduleBoard): string {
  return `
    <div style="margin-bottom:10px">
      <div style="font-size:11px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.05em;padding:4px 8px">${escapeHtml(board.leagueLabel)}</div>
      ${board.games.map(renderGame).join('')}
    </div>`;
}

export class SportsSchedulePanel extends Panel {
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super({ id: 'sports-schedule', title: 'Upcoming Games', showCount: false, collapsible: true });
    void this.fetchData();
    this.refreshTimer = setInterval(() => void this.fetchData(), REFRESH_MS);
  }

  public async fetchData(): Promise<boolean> {
    try {
      const boards = await fetchAllSchedules(this.signal);
      if (boards.length === 0) {
        this.showError('No upcoming games', () => void this.fetchData());
        return false;
      }
      const html = boards.map(renderBoard).join('');
      this.setSafeContent(unsafeRawHtml(html, 'sports schedule panel — trusted static markup, escaped team/time fields'));
      return true;
    } catch (e) {
      if (this.isAbortError(e)) return false;
      this.showError(e instanceof Error ? e.message : 'Failed to load schedule', () => void this.fetchData());
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
