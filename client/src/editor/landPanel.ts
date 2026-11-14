import { button, make } from './dom.ts';

/** How far along a landmass's land is. */
export type LandState = 'waiting' | 'generating' | 'ready' | 'failed';

/** What a press on the land does: look around, or one of the sculpting brushes. */
export type LandTool = 'look' | 'raise' | 'lower' | 'smooth' | 'flatten';

/** The tools in their keys' order: 1 to 5. */
export const LAND_TOOLS: readonly (readonly [LandTool, string])[] = [
  ['look', 'Look'],
  ['raise', 'Raise'],
  ['lower', 'Lower'],
  ['smooth', 'Smooth'],
  ['flatten', 'Flatten'],
];

/** Everything the Land panel shows. */
export interface LandPanelView {
  readonly landmasses: readonly { readonly id: string; readonly state: LandState; readonly unsaved: boolean }[];
  readonly selected: string;
  readonly tool: LandTool;
  readonly radiusKm: number;
  readonly strength: number;
  readonly view: '2d' | '3d';
  readonly exaggeration: number;
  readonly cursor: string;
  readonly status: string;
}

/** What the Land panel's controls ask for. */
export interface LandPanelHandlers {
  select(id: string): void;
  view(view: '2d' | '3d'): void;
  exaggeration(times: number): void;
  tool(tool: LandTool): void;
  radius(kilometres: number): void;
  strength(value: number): void;
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
    const node = button(`${text} (${index + 1})`, () => handlers.tool(tool));
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
  views.append(flat, solid);
  root.append(views);

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
  const cursor = make('p', '', 'cursor');
  const status = make('p', '', 'status');
  root.append(cursor, status);
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
      const sculpting = view.tool !== 'look';
      radius.row.hidden = !sculpting;
      strength.row.hidden = !sculpting;
      radius.input.value = String(view.radiusKm);
      radius.text.textContent = ` ${view.radiusKm} km`;
      strength.input.max = view.tool === 'raise' || view.tool === 'lower' ? '500' : '100';
      strength.input.value = String(view.strength);
      strength.text.textContent = ` ${strengthText(view.tool, view.strength)}`;
      flat.classList.toggle('active', view.view === '2d');
      solid.classList.toggle('active', view.view === '3d');
      exaggerationLabel.hidden = view.view !== '3d';
      exaggeration.value = String(view.exaggeration);
      exaggerationText.textContent = ` ${view.exaggeration}× in 3D`;
      cursor.textContent = view.cursor;
      status.textContent = view.status;
    },
  };
}
