// The panel's two read-only tables: a server's audit log, a page of entries at a time, and its public leaderboard,
// which needs no sign-in and shows names and levels only.
import { button, element, linkButton, para, when, windowOf } from './dom.ts';
import type { PanelView } from './panelMain.ts';

interface AuditEntry {
  readonly id: number;
  readonly at: number;
  readonly actorName?: string;
  readonly actorId: string;
  readonly action: string;
  readonly target: string;
}
interface Board {
  readonly guild: { readonly name: string };
  readonly rows: ReadonlyArray<{
    readonly rank: number;
    readonly name: string;
    readonly level: number;
    readonly xp: number;
  }>;
}
/** How many rows the bot sends a page of the leaderboard: fewer means the last page. */
const BOARD_PAGE = 100;

const headRow = (words: readonly string[]): HTMLElement =>
  element('thead', {}, [
    element(
      'tr',
      {},
      words.map((word) => element('th', { scope: 'col' }, [word])),
    ),
  ]);
const row = (cells: readonly string[]): HTMLElement =>
  element(
    'tr',
    {},
    cells.map((cell) => element('td', {}, [cell])),
  );

export async function auditPage(view: PanelView, guildId: string, before = 0): Promise<void> {
  const asked = view.routeNow();
  const answer = await view.api.call<{ entries?: readonly AuditEntry[] }>(
    'GET',
    `/v1/panel/g/${guildId}/audit${before ? `?before=${before}` : ''}`,
  );
  if (!view.stands(asked)) return;
  if (!answer.ok) return view.fail(answer);
  const entries = answer.body.entries ?? [];
  const rows = entries.map((entry) =>
    row([when(entry.at), entry.actorName || entry.actorId, entry.action, entry.target]),
  );
  const last = entries.at(-1);
  const older = last ? [button('Older', () => void auditPage(view, guildId, last.id))] : [];
  view.show([
    view.bar(),
    windowOf('Audit log', [
      entries.length
        ? element('table', {}, [headRow(['When', 'Who', 'What', 'On']), element('tbody', {}, rows)])
        : para('Nothing yet.'),
      element('div', { class: 'acts' }, [...older, linkButton('Back', `#g=${guildId}`)]),
    ]),
  ]);
}

export async function leaderboardPage(view: PanelView, guildId: string): Promise<void> {
  const body = element('tbody');
  const note = element('p', { class: 'small', role: 'status' });
  const title = element('h2', {}, ['Leaderboard']);
  const asked = view.routeNow();
  let offset = 0;
  const more = button('More', () => void load());
  async function load(): Promise<void> {
    const answer = await view.api.call<Board>('GET', `/v1/public/levels/${guildId}?offset=${offset}`);
    if (!view.stands(asked)) return;
    if (!answer.ok) {
      note.textContent = answer.body.message ?? 'This leaderboard is not public.';
      more.hidden = true;
      return;
    }
    title.textContent = `${answer.body.guild.name}: leaderboard`;
    for (const entry of answer.body.rows)
      body.append(row([String(entry.rank), entry.name, String(entry.level), String(entry.xp)]));
    offset += answer.body.rows.length;
    more.hidden = answer.body.rows.length < BOARD_PAGE;
    note.textContent = body.children.length ? '' : 'No one has earned experience yet.';
  }
  view.show([
    element('section', { class: 'card panel-window' }, [
      title,
      element('table', {}, [headRow(['Rank', 'Member', 'Level', 'Experience']), body]),
      note,
      element('div', { class: 'acts' }, [more]),
    ]),
  ]);
  await load();
}
