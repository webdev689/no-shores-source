import { button, make } from '../editor/dom.ts';
import type { ForgeLooks } from '../forge/looks.ts';
import type { HairColours } from '../forge/skins.ts';
import { choice, dressControls, labelled } from './dressPanel.ts';
import type { Placed } from './figures.ts';

/** What the panel shows: the forge's tables, the figures, the chosen one, the speed, whether the view walks, and a
 *  status line. */
export interface PanelState {
  readonly looks: ForgeLooks;
  readonly hair: HairColours;
  readonly figures: readonly Placed[];
  readonly chosen: Placed | null;
  readonly fps: number;
  readonly walking: boolean;
  readonly status: string;
}

/** What the panel asks for. `change` follows any edit of the chosen figure, made in place. */
export interface PanelHandlers {
  add(): void;
  remove(): void;
  choose(id: number): void;
  change(): void;
  fps(value: number): void;
}

/** The Test Ground's panel: the figures, and the chosen one's move, facing and dress. */
export function startPanel(root: HTMLElement, handlers: PanelHandlers): (state: PanelState) => void {
  const garmentFilter = { text: '' };
  let shown = '';
  const status = make('p', '', 'status');
  const body = make('div');
  root.append(
    make('h1', 'Test Ground'),
    make(
      'p',
      'Right-drag turns, middle-drag pans, the wheel zooms. Click the ground to move the chosen figure, or click a ' +
        'figure to choose it. G walks: W A S D, Shift to run.',
      'hint',
    ),
    body,
    status,
  );

  const moving = (state: PanelState, placed: Placed): HTMLElement[] => {
    const drawn = state.looks.bodies[placed.dress.body];
    const anims = Object.keys(drawn?.anims ?? {})
      .sort()
      .map((key) => [key, `${key} (${drawn?.anims[key]?.frames ?? 0})`] as const);
    const facing = make('input');
    Object.assign(facing, {
      type: 'range',
      min: '0',
      max: '359',
      value: String(Math.round((placed.facing * 180) / Math.PI)),
    });
    facing.addEventListener('input', () => {
      placed.facing = (Number(facing.value) * Math.PI) / 180;
    });
    const spin = make('input');
    Object.assign(spin, { type: 'checkbox', checked: placed.spin });
    spin.addEventListener('change', () => {
      placed.spin = spin.checked;
    });
    return [
      labelled(
        'Move',
        choice(anims, placed.anim, (value) => {
          placed.anim = value;
          handlers.change();
        }),
      ),
      labelled('Facing', facing),
      labelled('Turn round', spin),
    ];
  };

  return (state: PanelState) => {
    status.textContent = state.status;
    // Rebuilt only when the figures or the chosen one change, so typing in a field keeps its focus.
    const figures = state.figures.map((each) => [each.id, each.anim, each.dress, each.tints]);
    const key = JSON.stringify([figures, state.chosen?.id, state.walking]);
    if (key === shown) return;
    shown = key;
    const speed = make('input');
    Object.assign(speed, { type: 'number', min: '1', max: '30', value: String(state.fps) });
    speed.addEventListener('change', () => handlers.fps(Number(speed.value) || state.fps));
    const list = make('div', '', 'figures');
    for (const placed of state.figures) {
      const label = `${placed.id}: ${placed.dress.race}, ${placed.dress.body}, ${placed.anim}`;
      const pick = button(label, () => handlers.choose(placed.id));
      if (placed === state.chosen) pick.classList.add('active');
      list.append(pick);
    }
    const chosen = state.chosen;
    body.replaceChildren(
      make('h2', 'Figures'),
      list,
      button('Add a figure', handlers.add),
      button('Remove the chosen', handlers.remove),
      labelled('Frames a second', speed),
      ...(state.walking ? [make('p', 'Walking: W A S D, Shift to run. G stops.', 'hint')] : []),
      ...(chosen
        ? [
            make('h2', 'Chosen figure'),
            ...moving(state, chosen),
            ...dressControls(state.looks, state.hair, chosen, garmentFilter, handlers.change),
          ]
        : []),
    );
  };
}
