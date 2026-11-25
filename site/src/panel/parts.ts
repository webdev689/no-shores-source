// A module's tables and acts, drawn from what the module declares. A table loads when opened and pages with the
// bot's own cursor; an act's form is drawn from its inputs' shape and shows the bot's answer beside it.
import { type Level, atLeast } from '../../../server/bot/law/access.ts';
import type { BotModule, ModuleAction, ModuleView } from '../../../server/bot/law/modules.ts';
import type { Channel, Role } from './context.ts';
import { answerWords, element } from './dom.ts';
import { bindForm } from './form.ts';
import type { PanelApi } from './panelApi.ts';

interface Rows {
  readonly rows?: ReadonlyArray<Record<string, unknown>>;
  readonly next?: unknown;
  readonly note?: string;
}
interface Lists {
  readonly channels: readonly Channel[];
  readonly roles: readonly Role[];
}

/** A cell's words: a time in seconds as a date, anything else as text. */
function cellText(key: string, value: unknown): string {
  if (key === 'when' && typeof value === 'number' && value > 0) return new Date(value * 1000).toLocaleString();
  return value === null || value === undefined ? '' : String(value);
}

/** One table, loaded when its button is pressed. `base` is the module's API path. */
export function viewPart(api: PanelApi, base: string, view: ModuleView): HTMLElement {
  const body = element('tbody');
  const note = element('p', { class: 'small', role: 'status' });
  const heads = view.columns.map((column) => element('th', { scope: 'col' }, [column.label]));
  const table = element('table', {}, [element('thead', {}, [element('tr', {}, heads)]), body]);
  table.hidden = true;
  let next = '';
  const more = element('button', { type: 'button', class: 'button' }, ['Show']);
  more.addEventListener('click', async () => {
    more.disabled = true;
    const answer = await api.call<Rows>('GET', `${base}/v/${view.id}${next ? `?${next}` : ''}`);
    more.disabled = false;
    if (!answer.ok) {
      note.textContent = answerWords(answer);
      return;
    }
    table.hidden = false;
    for (const row of answer.body.rows ?? []) {
      const cells = view.columns.map((column) => element('td', {}, [cellText(column.key, row[column.key])]));
      body.append(element('tr', {}, cells));
    }
    next = String(answer.body.next ?? '');
    note.textContent = answer.body.note ?? (body.children.length ? '' : 'Nothing here yet.');
    more.textContent = 'More';
    more.hidden = !next;
  });
  return element('div', { class: 'part' }, [element('h3', {}, [view.title]), more, table, note]);
}

/** One act: its form, its button, and the bot's answer. */
export function actionPart(api: PanelApi, base: string, action: ModuleAction, lists: Lists): HTMLElement {
  const starting = Object.fromEntries(
    Object.entries(action.inputs).map(([key, field]) => [key, 'default' in field ? field.default : undefined]),
  );
  const form = bindForm(action.inputs, starting, { ...lists, disabled: false });
  const status = element('p', { class: 'status', role: 'status' });
  const run = element('button', { type: 'button', class: 'button' }, [action.label]);
  run.addEventListener('click', async () => {
    if (action.confirm && !window.confirm(action.confirm)) return;
    run.disabled = true;
    status.textContent = 'Working...';
    const answer = await api.call('POST', `${base}/a/${action.id}`, { input: form.read() });
    run.disabled = false;
    if (!answer.ok && answer.body.error === 'invalid') {
      form.mark(answer.body.errors ?? []);
      status.textContent = 'Some fields need a fix.';
      return;
    }
    form.mark([]);
    status.textContent = answerWords(answer);
  });
  return element('div', { class: 'part' }, [
    element('h3', {}, [action.label]),
    form.element,
    element('div', { class: 'acts' }, [run]),
    status,
  ]);
}

/** The tables and acts a person at `level` may use; empty when the module declares none. */
export function moduleParts(
  api: PanelApi,
  guildId: string,
  shape: BotModule,
  level: Level,
  lists: Lists,
): { views: HTMLElement[]; actions: HTMLElement[] } {
  const base = `/v1/panel/g/${guildId}/m/${shape.id}`;
  return {
    views: (shape.views ?? []).filter((view) => atLeast(level, view.level)).map((view) => viewPart(api, base, view)),
    actions: (shape.actions ?? [])
      .filter((action) => atLeast(level, action.level))
      .map((action) => actionPart(api, base, action, lists)),
  };
}
