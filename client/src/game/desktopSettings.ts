// Settings' App part, shown only in the desktop app: the graphics API the app draws with (chosen where there is more
// than one, on Windows), the card it draws on, and the app's own version and update. A change of API comes into force
// when the app starts again, and an update downloaded installs as the app closes; each has its press to do it now.
import { type DesktopInfo, type GraphicsApi, askDesktop, desktop } from '../desktop.ts';
import type { Child, Node } from '../ui/node.ts';
import { button, choice } from '../ui/controls.ts';
import type { PlainContext } from './menuPage.ts';
import { PRESS_PADDING, headingNode, hintNode } from './menuPages.ts';

/** The words a player reads for each API, and for each backend Chromium may name. */
const API_WORDS: Readonly<Record<GraphicsApi, string>> = {
  auto: 'Auto',
  d3d12: 'Direct3D 12',
  d3d11: 'Direct3D 11',
  vulkan: 'Vulkan',
  metal: 'Metal',
};
const BACKEND_WORDS: Readonly<Record<string, string>> = {
  d3d12: 'Direct3D 12',
  d3d11: 'Direct3D 11',
  vulkan: 'Vulkan',
  metal: 'Metal',
};

/** What the app draws with, in the player's words: the API and the card, as far as the game has learned them. */
export function drawingWords(graphics: DesktopInfo['graphics']): string {
  const api =
    BACKEND_WORDS[graphics.running.toLowerCase()] ?? (graphics.launched === 'auto' ? '' : API_WORDS[graphics.launched]);
  if (api === '' && graphics.adapter === '') return '';
  if (graphics.adapter === '') return `Drawing with ${api}.`;
  return api === '' ? `Drawing on ${graphics.adapter}.` : `Drawing with ${api} on ${graphics.adapter}.`;
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
  const options = graphics.choices.map((api) => ({ value: api, words: API_WORDS[api] }));
  const apiRow =
    options.length > 1
      ? (() => {
          const { node, chosen } = choice(ui, 'graphics-api', graphics.chosen, options);
          if (chosen !== graphics.chosen) askDesktop({ ask: 'graphics', api: chosen as GraphicsApi });
          return row('Graphics API', { ...node, label: `Graphics API, ${API_WORDS[chosen as GraphicsApi] ?? chosen}` });
        })()
      : null;
  const held = graphics.held
    ? `${API_WORDS[graphics.chosen]} could not start on this card, so the app draws with another.`
    : '';
  const restart = graphics.restart || update.state === 'ready';
  const press =
    update.state === 'manual'
      ? button(ui, 'desktop-download', 'Download', () => askDesktop({ ask: 'download' }), { padding: PRESS_PADDING })
      : restart
        ? button(ui, 'desktop-restart', 'Restart now', () => askDesktop({ ask: 'restart' }), { padding: PRESS_PADDING })
        : null;
  const said = [
    drawingWords(graphics),
    held,
    graphics.restart ? 'The change comes into force when the app starts again.' : '',
    updateWords(update),
  ].filter((words) => words !== '');
  return [
    { height: 14 },
    headingNode('App'),
    { height: 4 },
    apiRow,
    ...said.map((words) => hintNode(words)),
    row('Version', { text: { words: info.version } }, press),
  ];
}
