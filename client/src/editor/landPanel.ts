import { RANKS, SHIP_FACTIONS } from '../ships/shipBars.ts';
import { button, make } from './dom.ts';
import { LAYOUT_LEGEND } from './layoutDrawing.ts';
import { chooseCaptain, chosenCaptain } from './fleetLink.ts';
import { LEVEL_MOST } from '../rules/fleetRules.ts';
import { buildSitePanel, type SitePanelHandlers, type SitePanelView } from './sitePanel.ts';

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

/** Builds the Land panel once into `root`; `update` refreshes what changed. */
export function buildLandPanel(root: HTMLElement, handlers: LandPanelHandlers) {
  root.replaceChildren();
  root.append(make('p', 'The land the generator makes from your coasts. Pick a landmass, then shape it.', 'hint'));

  const tools = make('div', '', 'row');
  const toolButtons = LAND_TOOLS.map(([tool, text], index) => {
    const node = button(`${text} (${(index + 1) % 10})`, () => handlers.tool(tool));
    tools.append(node);
    return [tool, node] as const;
  });
  root.append(tools);
  const siteTools = make('div', '', 'row');
  for (const [tool, text, key] of SITE_TOOLS) {
    const node = button(`${text} (${key.toUpperCase()})`, () => handlers.tool(tool));
    siteTools.append(node);
    toolButtons.push([tool, node]);
  }
  root.append(siteTools);
  const slider = (label: string, min: number, max: number, onInput: (value: number) => void) => {
    const row = make('label', '', 'brush');
    const input = make('input');
    Object.assign(input, { type: 'range', min: String(min), max: String(max), step: '1' });
    const text = make('span');
    input.addEventListener('input', () => onInput(Number(input.value)));
    row.append(label, input, text);
    root.append(row);
    return { row, input, text };
  };
  const radius = slider('Radius ', 1, 200, (value) => handlers.radius(value));
  const strength = slider('Strength ', 1, 500, (value) => handlers.strength(value));
  const width = slider('Width ', 2, 300, (value) => handlers.width(value));
  const depth = slider('Depth ', 1, 30, (value) => handlers.depth(value));
  const siteFields = make('div');
  root.append(siteFields);
  const hint = make('p', '', 'hint');
  root.append(hint);
  const history = make('div', '', 'row');
  history.append(
    button('Undo (Ctrl+Z)', () => handlers.undo()),
    button('Redo (Ctrl+Y)', () => handlers.redo()),
  );
  history.append(button('Save', () => handlers.save()));
  root.append(history);

  const views = make('div', '', 'row');
  const flat = button('2D map (V)', () => handlers.view('2d'));
  const solid = button('3D view (V)', () => handlers.view('3d'));
  const walk = button('Walk (G)', () => handlers.walk());
  const sail = button('Sail (B)', () => handlers.sail());
  const layouts = button('Layouts (L)', () => handlers.layouts());
  const buildings = button('Buildings (K)', () => handlers.buildings());
  views.append(flat, solid, walk, sail, layouts, buildings);
  const legend = make('p', '', 'hint');
  legend.append(
    ...LAYOUT_LEGEND.map(([name, colour]) => {
      const key = make('span', `■ ${name}`);
      // An item never breaks across lines, so each name stays beside its colour.
      Object.assign(key.style, { color: colour, display: 'inline-block', marginRight: '0.8em' });
      return key;
    }),
  );
  const walkHint = make(
    'p',
    'Walking: W A S D to move, Shift to run, C to dive, Space to rise, drag to look round, G to stop.',
    'hint',
  );
  const sailHint = make(
    'p',
    'Sailing: W and S climb and come down from oars to sails, A and D steer, B to stop.',
    'hint',
  );
  const fightHint = make(
    'p',
    'F calls a pirate, or sends it off. Hold the right mouse to aim where the balls should fall, and let go to fire.' +
      ' A left click holds fire, the wheel changes shot, C braces, and Shift gives a burst of speed. In a fleet' +
      ' (?room= in the address), F calls a captain, X sends them all off, and Shift gives no burst.',
    'hint',
  );
  // The captain F calls in a fleet: its faction, rank and level, and the level the ship is fitted at.
  const calling = make('label', 'In a fleet, F calls ', 'brush');
  const pick = (options: readonly (readonly [number, string])[], value: number) => {
    const select = make('select');
    for (const [key, text] of options) select.append(new Option(text, String(key), false, key === value));
    select.addEventListener('change', () =>
      chooseCaptain({
        faction: Number(faction.value),
        rank: Number(rank.value),
        level: Number(level.value),
        shipLevel: Number(shipLevel.value),
      }),
    );
    return select;
  };
  const faction = pick(
    SHIP_FACTIONS.map((each) => [each.faction, each.name] as const),
    chosenCaptain().faction,
  );
  const rank = pick(
    RANKS.map((name, index) => [index + 1, name] as const),
    chosenCaptain().rank,
  );
  const levels = (none: string) => [
    [0, none] as const,
    ...Array.from({ length: LEVEL_MOST }, (unused, index) => [index + 1, `level ${index + 1}`] as const),
  ];
  const level = pick(levels('of no level'), chosenCaptain().level);
  const shipLevel = pick(levels('unfitted'), chosenCaptain().shipLevel);
  calling.append(faction, ' ', rank, ' ', level, ', the ship ', shipLevel);
  root.append(views, legend, walkHint, sailHint, fightHint, calling);

  const exaggerationLabel = make('label', '', 'brush');
  const exaggeration = make('input');
  Object.assign(exaggeration, { type: 'range', min: '1', max: '10', step: '0.5' });
  const exaggerationText = make('span');
  exaggeration.addEventListener('input', () => handlers.exaggeration(Number(exaggeration.value)));
  exaggerationLabel.append('Height ', exaggeration, exaggerationText);
  root.append(exaggerationLabel);

  root.append(make('h2', 'Landmasses'));
  const list = make('ol', '', 'slots');
  root.append(list);
  const siteList = make('div');
  root.append(siteList);
  const sites = buildSitePanel(siteFields, siteList, handlers);
  root.append(make('h2', 'Problems'));
  const problems = make('ul', '', 'problems');
  root.append(problems);
  const cursor = make('p', '', 'cursor');
  const fight = make('div', '', 'fight');
  const status = make('p', '', 'status');
  root.append(cursor, fight, status);
  let shownFight = '';
  let shownIds = '';
  let rows = new Map<string, { row: HTMLLIElement; state: HTMLSpanElement }>();

  return {
    update(view: LandPanelView): void {
      const ids = view.landmasses.map((landmass) => landmass.id).join('\n');
      if (ids !== shownIds) {
        shownIds = ids;
        rows = new Map(
          view.landmasses.map(({ id }) => {
            const row = make('li');
            // These rows carry no swatch: the name takes the list's first column whole.
            row.style.gridTemplateColumns = '1fr auto';
            const name = make('span', id, 'name');
            name.dataset['id'] = id;
            const state = make('span', '', 'area');
            row.append(name, state);
            row.addEventListener('click', () => handlers.select(id));
            return [id, { row, state }] as const;
          }),
        );
        list.replaceChildren(...[...rows.values()].map(({ row }) => row));
      }
      for (const landmass of view.landmasses) {
        const shown = rows.get(landmass.id);
        if (!shown) continue;
        shown.row.classList.toggle('active', landmass.id === view.selected);
        shown.state.textContent = `${STATE_TEXT[landmass.state]}${landmass.unsaved ? ' · unsaved' : ''}`;
      }
      for (const [tool, node] of toolButtons) node.classList.toggle('active', tool === view.tool);
      const sculpting = BRUSHES.includes(view.tool);
      radius.row.hidden = !sculpting;
      strength.row.hidden = !sculpting;
      width.row.hidden = view.tool !== 'river' && view.tool !== 'road';
      depth.row.hidden = view.tool !== 'river';
      width.input.min = view.tool === 'road' ? '2' : '5';
      width.input.max = view.tool === 'road' ? '30' : '300';
      width.input.value = String(view.widthM);
      width.text.textContent = ` ${view.widthM} m`;
      depth.input.value = String(view.depthM);
      depth.text.textContent = ` ${view.depthM} m`;
      hint.textContent = TOOL_HINTS[view.tool] ?? '';
      problems.replaceChildren(...(view.problems.length ? view.problems : ['None.']).map((text) => make('li', text)));
      radius.input.value = String(view.radiusKm);
      radius.text.textContent = ` ${view.radiusKm} km`;
      strength.input.max = view.tool === 'raise' || view.tool === 'lower' ? '500' : '100';
      strength.input.value = String(view.strength);
      strength.text.textContent = ` ${strengthText(view.tool, view.strength)}`;
      flat.classList.toggle('active', view.view === '2d');
      solid.classList.toggle('active', view.view === '3d');
      walk.classList.toggle('active', view.walking);
      walkHint.hidden = !view.walking;
      sail.classList.toggle('active', view.sailing);
      layouts.classList.toggle('active', view.layouts);
      legend.hidden = !view.layouts;
      buildings.classList.toggle('active', view.buildings);
      buildings.hidden = view.view !== '3d';
      sailHint.hidden = !view.sailing;
      fightHint.hidden = !view.sailing;
      calling.hidden = !view.sailing;
      exaggerationLabel.hidden = view.view !== '3d';
      exaggeration.value = String(view.exaggeration);
      exaggerationText.textContent = ` ${view.exaggeration}× in 3D`;
      sites.update(view);
      cursor.textContent = view.cursor;
      if (view.fight.join('\n') !== shownFight) {
        shownFight = view.fight.join('\n');
        fight.replaceChildren(
          ...view.fight.map((line) => make('p', line, line.startsWith('Broadside') ? 'warning' : 'told')),
        );
      }
      status.textContent = view.status;
    },
  };
}
