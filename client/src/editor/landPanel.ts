import { RANKS, SHIP_FACTIONS } from '../ships/shipBars.ts';
import type { Child } from '../ui/node.ts';
import type { Interface } from '../ui/ui.ts';
import { LEVEL_MOST } from '../rules/fleetRules.ts';
import { chooseCaptain, chosenCaptain } from './fleetLink.ts';
import { LAYOUT_LEGEND } from './layoutDrawing.ts';
import {
  type Block,
  bulleted,
  chooser,
  heading,
  inline,
  INK,
  listRow,
  paragraph,
  press,
  range,
  readable,
  row,
  said,
  spaced,
  stacked,
  words,
} from './panelKit.ts';
import { type SitePanelHandlers, type SitePanelView, siteFields, siteList } from './sitePanel.ts';

/** How far along a landmass's land is. */
export type LandState = 'waiting' | 'generating' | 'ready' | 'failed';

/** What a press on the land does: look around, shape the ground with a brush, or draw, place and remove places. */
export type LandTool =
  | 'look'
  | 'raise'
  | 'lower'
  | 'smooth'
  | 'flatten'
  | 'river'
  | 'road'
  | 'town'
  | 'port'
  | 'remove'
  | 'node'
  | 'spawn'
  | 'city';

/** The brushes that shape the ground. */
export const BRUSHES: readonly LandTool[] = ['raise', 'lower', 'smooth', 'flatten'];
/** The tools that draw a course or an area point by point. */
export const DRAWN: readonly LandTool[] = ['river', 'road', 'town', 'node'];

/** The tools in their keys' order: 1 to 9, then 0. */
export const LAND_TOOLS: readonly (readonly [LandTool, string])[] = [
  ['look', 'Look'],
  ['raise', 'Raise'],
  ['lower', 'Lower'],
  ['smooth', 'Smooth'],
  ['flatten', 'Flatten'],
  ['river', 'River'],
  ['road', 'Road'],
  ['town', 'Town'],
  ['port', 'Port'],
  ['remove', 'Remove'],
];

/** The tools for the port city and the nodes, with their keys. */
export const SITE_TOOLS: readonly (readonly [LandTool, string, string])[] = [
  ['node', 'Node', 'n'],
  ['spawn', 'Spawn', 'x'],
  ['city', 'City', 'h'],
];

/** What each place tool asks for, in a line. */
const TOOL_HINTS: Partial<Record<LandTool, string>> = {
  river: 'Click from the source down to the mouth; double-click or Enter to finish, Esc to cancel.',
  road: 'Click along the road; its points snap to ports, towns and other roads. Double-click or Enter to finish.',
  town: 'Click round the town’s edge; double-click or Enter to close it.',
  port: 'Click on the land by the coast.',
  remove: 'Click a river, road, town, port, node or spawn to remove it.',
  node: 'Click round the node’s section; double-click or Enter to close it. A spawn is set at its middle.',
  spawn: 'Click inside a node to add a spawn; Backspace takes the last spawn of the node under the cursor.',
  city: 'Click on the land by the coast to move the port city there.',
};

/** Everything the Land panel shows. */
export interface LandPanelView extends SitePanelView {
  readonly landmasses: readonly { readonly id: string; readonly state: LandState; readonly unsaved: boolean }[];
  readonly selected: string;
  readonly tool: LandTool;
  readonly radiusKm: number;
  readonly strength: number;
  readonly widthM: number;
  readonly depthM: number;
  readonly problems: readonly string[];
  readonly view: '2d' | '3d';
  readonly walking: boolean;
  readonly sailing: boolean;
  /** Whether the nodes' layouts are drawn over both views. */
  readonly layouts: boolean;
  /** Whether the layouts' buildings, props and solids are drawn in the 3D view. */
  readonly buildings: boolean;
  readonly exaggeration: number;
  readonly cursor: string;
  /** A fight's lines: both ships, the guns, the warning to brace, and what happened. */
  readonly fight: readonly string[];
  readonly status: string;
}

/** What the Land panel's controls ask for. */
export interface LandPanelHandlers extends SitePanelHandlers {
  select(id: string): void;
  view(view: '2d' | '3d'): void;
  walk(): void;
  sail(): void;
  layouts(): void;
  buildings(): void;
  exaggeration(times: number): void;
  tool(tool: LandTool): void;
  radius(kilometres: number): void;
  strength(value: number): void;
  width(metres: number): void;
  depth(metres: number): void;
  undo(): void;
  redo(): void;
  save(): void;
}

/** What a brush's strength means for each tool. */
export function strengthText(tool: LandTool, strength: number): string {
  if (tool === 'raise' || tool === 'lower') return `${strength} m a dab`;
  if (tool === 'smooth') return `${strength}% toward its neighbours a dab`;
  if (tool === 'flatten') return `${strength}% toward the level where the stroke starts`;
  return '';
}

const STATE_TEXT: Record<LandState, string> = {
  waiting: 'not generated yet',
  generating: 'generating…',
  ready: 'ready',
  failed: 'could not generate',
};

/** A slider in its own line with its words before and after, 10 px under what is above it. */
function sliding(
  ui: Interface,
  id: string,
  label: string,
  value: number,
  limits: { readonly low: number; readonly high: number; readonly step: number },
  said: (value: number) => string,
  set: (value: number) => void,
): Block {
  const made = range(ui, id, value, limits);
  if (made.value !== value) set(made.value);
  return { node: inline(label, made.node, said(made.value)), top: 10 };
}

/** The Land panel's nodes: the tools, the brush's and the places' settings, the history, the views, the
 *  landmasses, the port city and the nodes, the problems, the cursor's readout, the fight and the status. */
export function landPanel(ui: Interface, view: LandPanelView, handlers: LandPanelHandlers): Child[] {
  const tool = (each: LandTool, text: string) =>
    press(ui, `land-tool:${each}`, text, () => handlers.tool(each), { chosen: each === view.tool });
  const sculpting = BRUSHES.includes(view.tool);
  const pressing = view.tool === 'raise' || view.tool === 'lower';
  const road = view.tool === 'road';
  const toggle = (id: string, text: string, chosen: boolean, run: () => void) => press(ui, id, text, run, { chosen });
  const captain = chosenCaptain();
  const faction = chooser(
    ui,
    'captain-faction',
    String(captain.faction),
    SHIP_FACTIONS.filter((each) => each.faction > 0).map((each) => ({ value: String(each.faction), words: each.name })),
  );
  const rank = chooser(
    ui,
    'captain-rank',
    String(captain.rank),
    RANKS.map((name, index) => ({ value: String(index + 1), words: name })),
  );
  const levels = (none: string) => [
    { value: '0', words: none },
    ...Array.from({ length: LEVEL_MOST }, (unused, index) => ({
      value: String(index + 1),
      words: `level ${index + 1}`,
    })),
  ];
  const level = chooser(ui, 'captain-level', String(captain.level), levels('of no level'));
  const shipLevel = chooser(ui, 'captain-ship-level', String(captain.shipLevel), levels('unfitted'));
  const picked = [faction, rank, level, shipLevel].map((made) => Number(made.chosen));
  const held = [captain.faction, captain.rank, captain.level, captain.shipLevel];
  if (picked.some((value, index) => value !== held[index])) {
    const [chosenFaction = 0, chosenRank = 0, chosenLevel = 0, chosenShipLevel = 0] = picked;
    chooseCaptain({ faction: chosenFaction, rank: chosenRank, level: chosenLevel, shipLevel: chosenShipLevel });
  }
  const landmasses = view.landmasses.map(({ id, state, unsaved }) =>
    listRow(ui, `landmass:${id}`, id, id === view.selected, () => handlers.select(id), {
      gap: 8,
      children: [
        words(id, INK.words, { width: 'grow' }),
        words(`${STATE_TEXT[state]}${unsaved ? ' · unsaved' : ''}`, INK.dim),
      ],
    }),
  );
  const hint = (text: string, shown: boolean): Block => ({ node: shown && paragraph(text), top: 11, bottom: 11 });
  return stacked([
    said('The land the generator makes from your coasts. Pick a landmass, then shape it.'),
    { node: row(LAND_TOOLS.map(([each, text], index) => tool(each, `${text} (${(index + 1) % 10})`))) },
    { node: row(SITE_TOOLS.map(([each, text, key]) => tool(each, `${text} (${key.toUpperCase()})`))) },
    ...(sculpting
      ? [
          sliding(
            ui,
            'radius',
            'Radius',
            view.radiusKm,
            { low: 1, high: 200, step: 1 },
            (kilometres) => `${kilometres} km`,
            handlers.radius,
          ),
          sliding(
            ui,
            `strength:${pressing ? 'metres' : 'share'}`,
            'Strength',
            view.strength,
            { low: 1, high: pressing ? 500 : 100, step: 1 },
            (value) => strengthText(view.tool, value),
            handlers.strength,
          ),
        ]
      : []),
    ...(road || view.tool === 'river'
      ? [
          sliding(
            ui,
            `width:${view.tool}`,
            'Width',
            view.widthM,
            { low: road ? 2 : 5, high: road ? 30 : 300, step: 1 },
            (metres) => `${metres} m`,
            handlers.width,
          ),
        ]
      : []),
    ...(view.tool === 'river'
      ? [
          sliding(
            ui,
            'depth',
            'Depth',
            view.depthM,
            { low: 1, high: 30, step: 1 },
            (metres) => `${metres} m`,
            handlers.depth,
          ),
        ]
      : []),
    ...siteFields(ui, view, handlers),
    said(TOOL_HINTS[view.tool] ?? ''),
    {
      node: row([
        press(ui, 'undo', 'Undo (Ctrl+Z)', () => handlers.undo()),
        press(ui, 'redo', 'Redo (Ctrl+Y)', () => handlers.redo()),
        press(ui, 'land-save', 'Save', () => handlers.save()),
      ]),
    },
    {
      node: row([
        toggle('view-2d', '2D map (V)', view.view === '2d', () => handlers.view('2d')),
        toggle('view-3d', '3D view (V)', view.view === '3d', () => handlers.view('3d')),
        toggle('walk', 'Walk (G)', view.walking, () => handlers.walk()),
        toggle('sail', 'Sail (B)', view.sailing, () => handlers.sail()),
        toggle('layouts', 'Layouts (L)', view.layouts, () => handlers.layouts()),
        view.view === '3d' && toggle('buildings', 'Buildings (K)', view.buildings, () => handlers.buildings()),
      ]),
    },
    {
      node:
        view.layouts &&
        row(
          // An item never breaks across lines, so each name stays beside its colour.
          LAYOUT_LEGEND.map(([name, colour]) => ({
            padding: [0, 9, 0, 0],
            gap: 5,
            children: [
              { padding: [3, 0, 0, 0], children: [{ width: 7, height: 7, fill: readable(colour) }] },
              words(name, readable(colour)),
            ],
          })),
          0,
        ),
      top: 11,
      bottom: 11,
    },
    hint(
      'Walking: W A S D to move, Shift to run, C to dive, Space to rise, drag to look round, G to stop.',
      view.walking,
    ),
    hint('Sailing: W and S climb and come down from oars to sails, A and D steer, B to stop.', view.sailing),
    hint(
      'F calls a Tithe ship, or sends it off. Hold the right mouse to aim where the balls should fall, and let go to fire.' +
        ' A left click holds fire, the wheel changes shot, C braces, and Shift gives a burst of speed. In a fleet' +
        ' (?room= in the address), F calls a captain, X sends them all off, and Shift gives no burst.',
      view.sailing,
    ),
    {
      // The captain F calls in a fleet: its faction, rank and level, and the level the ship is fitted at.
      node:
        view.sailing &&
        row(
          [
            spaced(words('In a fleet, F calls')),
            spaced(faction.node),
            spaced(rank.node),
            // No space parts the level from the comma after it.
            { children: [level.node, spaced(words(', the ship'))] },
            shipLevel.node,
          ],
          2,
        ),
      top: 10,
    },
    ...(view.view === '3d'
      ? [
          sliding(
            ui,
            'exaggeration',
            'Height',
            view.exaggeration,
            { low: 1, high: 10, step: 0.5 },
            (times) => `${times}× in 3D`,
            handlers.exaggeration,
          ),
        ]
      : []),
    { node: heading('Landmasses'), top: 16, bottom: 6 },
    { node: { width: 'grow', direction: 'column', children: landmasses } },
    ...siteList(ui, view, handlers),
    { node: heading('Problems'), top: 16, bottom: 6 },
    {
      node: {
        width: 'grow',
        direction: 'column',
        children: (view.problems.length ? view.problems : ['None.']).map((text) =>
          bulleted(paragraph(text, INK.words)),
        ),
      },
    },
    said(view.cursor),
    ...view.fight.map((line) => ({
      node: paragraph(line, line.startsWith('Broadside') ? INK.warning : INK.dim),
      top: 2,
      bottom: 2,
    })),
    said(view.status),
  ]);
}
