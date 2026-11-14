import { button, make } from './dom.ts';

/** How far along a landmass's land is. */
export type LandState = 'waiting' | 'generating' | 'ready' | 'failed';

/** Everything the Land panel shows. */
export interface LandPanelView {
  readonly landmasses: readonly { readonly id: string; readonly state: LandState }[];
  readonly selected: string;
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
  root.append(make('p', 'The land the generator makes from your coasts. Pick a landmass to see it.', 'hint'));

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
        shown.state.textContent = STATE_TEXT[landmass.state];
      }
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
