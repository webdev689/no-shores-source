// Pictures of the sea's own layer, headless (`tools/uiShot.mjs`): the ship's console in each view, the landing's
// confirmation over it, and the island's panel docked at Overlook, over sample draws. The game never imports it.
import type { Node } from '../ui/node.ts';
import type { Interface } from '../ui/ui.ts';
import type { Activities } from './activities.ts';
import { islandPanelNode } from './islandPanel.ts';
import { islandPanelOf } from './islandWords.ts';
import { landingAskNode } from './seaLandings.ts';
import { type ConsoleState, shipConsoleNode } from './shipConsole.ts';
import type { NodeInfo } from './worldData.ts';

/** Under way at ×200 for Overlook's harbour, a quarter of the way there, the wind from the east. */
const UNDER_WAY: ConsoleState = {
  ...{ level: 'oversea', name: 'The Gull', hull: 'Sloop', heading: 4.8, sailing: true, resumable: false },
  ...{ wind: { toward: 4.2, speed: 6.4 }, pace: 200, paceNow: 200, speed: 2_400, share: 0.27 },
  ...{ bound: "Overlook's harbour, to dock", line: 'Sailing · 31 km to go · 13 s' },
  ...{ water: "The Lantern Sea, Overlook's home waters", kept: { hull: 0.82, sail: 0.95, crew: 1 } },
  ...{ canLeave: true, canManage: true },
};
const nothing = () => undefined;
const ACTS = {
  level: nothing,
  map: nothing,
  voyage: nothing,
  sailOn: nothing,
  heaveTo: nothing,
  manage: nothing,
  leave: nothing,
};

/** The sea's ground under the layer. */
const over = (ui: Interface, children: Node[]): Node => ({
  width: ui.size.width,
  height: ui.size.height,
  fill: '#1c3d57',
  children,
});

export const consoleOverseaShot = (ui: Interface): Node =>
  over(ui, [shipConsoleNode(ui, UNDER_WAY, ACTS, ui.size.width)]);

export const consoleSealevelShot = (ui: Interface): Node =>
  over(ui, [
    shipConsoleNode(
      ui,
      { ...UNDER_WAY, level: 'sealevel', paceNow: 1, speed: 12, bound: null, share: null, line: 'Sailing straight on' },
      ACTS,
      ui.size.width,
    ),
  ]);

export const landingAskShot = (ui: Interface): Node =>
  over(ui, [
    shipConsoleNode(
      ui,
      { ...UNDER_WAY, sailing: false, share: null, bound: null, line: 'At anchor' },
      ACTS,
      ui.size.width,
    ),
    landingAskNode(ui, { aim: { kind: 'dock', port: 'Overlook', harbour: [0, 0] }, near: false }, nothing),
  ]);

const WHERE = { continent: 'continent-1', ring: [], spawns: [], centre: [0, 0] as const };
const node = (id: string, kind: NodeInfo['kind'], name: string, more: object = {}) =>
  ({ ...WHERE, id, kind, name, ...more }) as unknown as NodeInfo;
/** Saltmere as docked at Overlook: its city, its three patrol zones, two Elite Dungeons, missions, boss and outpost. */
const SALTMERE = {
  id: 'continent-1',
  plan: {
    id: 'overlook',
    name: 'Overlook',
    harbour: [420, 60],
    ruined: false,
    social: {
      moorings: [
        [0, 0, 0],
        [1, 1, 0],
        [2, 2, 0],
      ],
    },
  },
  nodes: [
    node('overlook-social', 'social', 'Overlook', {
      stations: ['mage', 'vault', 'armorsmith', 'weaponsmith', 'tailor', 'tack', 'veiled', 'mail'].map((kind) => ({
        kind,
      })),
    }),
    node('saltgrass-downs', 'patrol', 'The Saltgrass Downs', {
      resources: [{ holds: 'iron' }, { holds: 'herbs' }, { holds: 'iron' }, {}],
      foes: [
        [0, 0],
        [1, 1],
        [2, 2],
        [3, 3],
      ],
    }),
    node('gullwing-vale', 'patrol', 'The Gullwing Vale'),
    node('driftwood-moors', 'patrol', 'The Driftwood Moors'),
    node('krakens-grotto', 'dungeon', "Kraken's Grotto"),
    node('pearl-tomb', 'dungeon', 'The Pearl Tomb'),
    node('burned-mill', 'mission', 'The Burned Mill', { locked: true }),
    node('shrine-of-tides', 'mission', 'Shrine of Tides'),
    node('maw', 'boss', 'The Maw of the Shallows'),
    node('tern-strand', 'outpost', 'Tern Strand'),
  ],
} as unknown as Parameters<typeof islandPanelOf>[0];
const DRAWN = {
  ofTheDay: [{ continent: 'continent-1', patrol: 'saltgrass-downs', number: 1 }],
  dayModifier: 'burn-shadow',
  weekElite: { place: 'krakens-grotto', modifiers: ['brawler'], level: 26, opens: 24 },
  weekAbyss: { place: 'coral-halls', modifiers: ['trickle'], level: 30, opens: 28 },
  bands: {
    'continent-1': [
      [1, 5],
      [10, 14],
      [20, 24],
    ],
  },
  modifiers: {
    'burn-shadow': { name: 'Burn (Shadow)', words: '' },
    brawler: { name: 'Brawler', words: '' },
    trickle: { name: 'Trickle', words: '' },
  },
} as unknown as Activities;
const OUTLINE = [
  [-900, -300],
  [-400, -700],
  [300, -650],
  [800, -200],
  [700, 300],
  [420, 60],
  [100, 500],
  [-500, 450],
  [-950, 100],
] as const;

/** The island's panel docked at Overlook, `chosen` the entry opened. */
const panelShot =
  (chosen: string | null) =>
  (ui: Interface): Node => {
    const panel = islandPanelOf(SALTMERE, true, {
      activities: DRAWN,
      gates: null,
      named: (id) => (id === 'coral-halls' ? 'The Coral Halls' : id),
    });
    const chart = { id: 'continent-1', outline: OUTLINE, harbour: [420, 60] as const, ship: [600, 260] as const };
    const acts = { choose: nothing, act: nothing, back: nothing };
    return over(ui, [islandPanelNode(ui, panel, chosen, chart, acts)]);
  };

export const islandPortShot = panelShot(null);
export const islandPatrolShot = panelShot('saltgrass-downs');
export const islandDungeonShot = panelShot('krakens-grotto');
