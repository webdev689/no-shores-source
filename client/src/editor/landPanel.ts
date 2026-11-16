import { button, make } from './dom.ts';

/** How far along a landmass's land is. */
export type LandState = 'waiting' | 'generating' | 'ready' | 'failed';

/** What a press on the land does: look around, shape the ground with a brush, or draw and remove places. */
export type LandTool =
  'look' | 'raise' | 'lower' | 'smooth' | 'flatten' | 'river' | 'road' | 'town' | 'port' | 'remove';

/** The brushes that shape the ground. */
export const BRUSHES: readonly LandTool[] = ['raise', 'lower', 'smooth', 'flatten'];
/** The tools that draw a course or an area point by point. */
export const DRAWN: readonly LandTool[] = ['river', 'road', 'town'];

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

/** What each place tool asks for, in a line. */
const TOOL_HINTS: Partial<Record<LandTool, string>> = {
  river: 'Click from the source down to the mouth; double-click or Enter to finish, Esc to cancel.',
  road: 'Click along the road; its points snap to ports, towns and other roads. Double-click or Enter to finish.',
  town: 'Click round the town’s edge; double-click or Enter to close it.',
  port: 'Click on the land by the coast.',
  remove: 'Click a river, road, town or port to remove it.',
};

/** Everything the Land panel shows. */
export interface LandPanelView {
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
  readonly exaggeration: number;
  readonly cursor: string;
  /** A fight's lines: both ships, the guns, the warning to brace, and what happened. */
  readonly fight: readonly string[];
  readonly status: string;
}

/** What the Land panel's controls ask for. */
export interface LandPanelHandlers {
  select(id: string): void;
  view(view: '2d' | '3d'): void;
  walk(): void;
  sail(): void;
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
  views.append(flat, solid, walk, sail);
  const walkHint = make(
    'p',
    'Walking: W A S D to move, Shift to run, C to dive, Space to rise, drag to look round, G to stop.',
    'hint',
  );
  const sailHint = make(
    'p',
    'Sailing: W and S climb and come down from oars to sails, A and D steer, Shift rows her sideways, B to stop.',
    'hint',
  );
  const fightHint = make(
    'p',
    'F calls a pirate, or sends her off. Hold the right mouse to aim where the balls should fall, and let go to fire.' +
      ' A left click holds fire, the wheel changes shot, and C braces.',
    'hint',
  );
  root.append(views, walkHint, sailHint, fightHint);

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
      sailHint.hidden = !view.sailing;
      fightHint.hidden = !view.sailing;
      exaggerationLabel.hidden = view.view !== '3d';
      exaggeration.value = String(view.exaggeration);
      exaggerationText.textContent = ` ${view.exaggeration}× in 3D`;
      cursor.textContent = view.cursor;
      if (view.fight.join('\n') !== shownFight) {
        shownFight = view.fight.join('\n');
        fight.replaceChildren(
          ...view.fight.map((line) => make('p', line, line.startsWith('BROADSIDE') ? 'warning' : 'told')),
        );
      }
      status.textContent = view.status;
    },
  };
}
