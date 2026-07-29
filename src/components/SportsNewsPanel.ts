import { Panel } from './Panel';
import { escapeHtml, sanitizeUrl, unsafeRawHtml } from '@/utils/sanitize';
import { fetchAllSportsNews, type NewsBoard, type SportsHeadline } from '@/services/sports-news';

const REFRESH_MS = 15 * 60_000;

function renderHeadline(item: SportsHeadline): string {
  return `
    <div style="padding:6px 8px;border-bottom:1px solid rgba(255,255,255,0.06);font-size:12px">
      <a href="${sanitizeUrl(item.link)}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none">${escapeHtml(item.headline)}</a>
    </div>`;
}

function renderBoard(board: NewsBoard): string {
  return `
    <div style="margin-bottom:10px">
      <div style="font-size:11px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.05em;padding:4px 8px">${escapeHtml(board.leagueLabel)}</div>
      ${board.items.map(renderHeadline).join('')}
    </div>`;
}

export class SportsNewsPanel extends Panel {
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super({ id: 'sports-news', title: 'Sports Headlines', showCount: false, collapsible: true });
    void this.fetchData();
    this.refreshTimer = setInterval(() => void this.fetchData(), REFRESH_MS);
  }

  public async fetchData(): Promise<boolean> {
    try {
      const boards = await fetchAllSportsNews(this.signal);
      if (boards.length === 0) {
        this.showError('No headlines available', () => void this.fetchData());
        return false;
      }
      const html = boards.map(renderBoard).join('');
      this.setSafeContent(unsafeRawHtml(html, 'sports news panel — trusted static markup, escaped headline text, sanitized link URLs'));
      return true;
    } catch (e) {
      if (this.isAbortError(e)) return false;
      this.showError(e instanceof Error ? e.message : 'Failed to load headlines', () => void this.fetchData());
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
