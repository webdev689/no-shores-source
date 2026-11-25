// Settings' App part, shown only in the desktop app: the graphics API the app draws with (chosen where there is more
// than one, on Windows), the card it draws on, and the app's own version and update. A change of API comes into force
// when the app starts again, and an update downloaded installs as the app closes; each has its press to do it now.
import { API_NAMES, type DesktopInfo, GRAPHICS_APIS, type GraphicsApi, askDesktop, desktop } from '../desktop.ts';
import type { Child, Node } from '../ui/node.ts';
import { button, choice } from '../ui/controls.ts';
import type { PlainContext } from './menuPage.ts';
import { PRESS_PADDING, headingNode, hintNode } from './menuPages.ts';

/** The graphics API's list, which Settings shuts as it is shown again. */
export const API_LIST = 'graphics-api';

/** What the app draws with, in the player's words: the API and the card, as far as the game has learned them. */
export function drawingWords(graphics: DesktopInfo['graphics']): string {
  const running = GRAPHICS_APIS.find((api) => api !== 'auto' && api === graphics.running.toLowerCase());
  const api = running ? API_NAMES[running] : graphics.launched === 'auto' ? '' : API_NAMES[graphics.launched];
  if (api === '' && graphics.adapter === '') return '';
  if (graphics.adapter === '') return `Drawing with ${api}.`;
  return api === '' ? `Drawing on ${graphics.adapter}.` : `Drawing with ${api} on ${graphics.adapter}.`;
}

/** What starting again brings, in the player's words, or nothing where it changes nothing. */
export function restartWords(graphics: DesktopInfo['graphics']): string {
  if (graphics.restart === null) return '';
  const name = API_NAMES[graphics.restart];
  return graphics.restart === graphics.launched
    ? `Started again, the app reaches ${name} another way.`
    : `Started again, the app draws with ${name}.`;
}

/** The update in the player's words. */
export function updateWords(update: DesktopInfo['update']): string {
  switch (update.state) {
    case 'none':
      return '';
    case 'downloading':
      return `Downloading version ${update.version}: ${update.percent}%.`;
    case 'ready':
      return `Version ${update.version} is ready. It installs when you close the app.`;
    case 'manual':
      return `Version ${update.version} is out. Download it to update.`;
  }
}

/** The App part's rows, or none in a browser. `row` lays a setting's name beside its control, as Settings does. */
export function desktopNodes({ ui }: PlainContext, row: (name: string, ...children: Child[]) => Node): Child[] {
  const info = desktop();
  if (!info) return [];
  const { graphics, update } = info;
  const options = graphics.choices.map((api) => ({ value: api, words: API_NAMES[api] }));
  const apiRow =
    options.length > 1
      ? (() => {
          const { node, chosen, picked } = choice(ui, API_LIST, graphics.chosen, options);
          // Picked again, the API held off this card is asked for anew, to be tried again.
          if (picked) askDesktop({ ask: 'graphics', api: chosen as GraphicsApi });
          return row('Graphics API', { ...node, label: `Graphics API, ${API_NAMES[chosen as GraphicsApi] ?? chosen}` });
        })()
      : null;
  const held = graphics.held
    ? `${API_NAMES[graphics.chosen]} could not start on this card, so the app draws with another.`
    : '';
  const presses = [
    update.state === 'manual' &&
      button(ui, 'desktop-download', 'Download', () => askDesktop({ ask: 'download' }), { padding: PRESS_PADDING }),
    (graphics.restart !== null || update.state === 'ready') &&
      button(ui, 'desktop-restart', 'Restart now', () => askDesktop({ ask: 'restart' }), { padding: PRESS_PADDING }),
  ];
  const said = [drawingWords(graphics), held, restartWords(graphics), updateWords(update)].filter(
    (words) => words !== '',
  );
  return [
    { height: 14 },
    headingNode('App'),
    { height: 4 },
    apiRow,
    ...said.map((words) => hintNode(words)),
    row('Version', { text: { words: info.version } }, ...presses),
  ];
}
