import { button, make } from '../editor/dom.ts';
import type { Tint } from '../forge/compose.ts';
import type { ForgeLooks } from '../forge/looks.ts';
import type { HairColours, RaceSkins } from '../forge/skins.ts';
import type { Placed } from './figures.ts';

/** What the panel shows: the forge's tables, the figures, the chosen one, the speed and a status line. */
export interface PanelState {
  readonly looks: ForgeLooks;
  readonly skins: RaceSkins;
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

/** Layers the gear list leaves out: the bare bodies, hair and the ridden horse are chosen apart. */
const NOT_GEAR = /^(body|hair_|horse$)/;

const hex = (tint: Tint) => `#${tint.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
const fromHex = (text: string): Tint =>
  [1, 3, 5].map((spot) => parseInt(text.slice(spot, spot + 2), 16)) as unknown as Tint;

function labelled(text: string, control: HTMLElement): HTMLLabelElement {
  const label = make('label', '', 'row');
  label.append(make('span', text), control);
  return label;
}

function choice(options: readonly (readonly [string, string])[], value: string, onPick: (value: string) => void) {
  const select = make('select');
  for (const [key, text] of options) select.append(new Option(text, key, false, key === value));
  select.addEventListener('change', () => onPick(select.value));
  return select;
}

/** The Test Ground's panel: the figures, and the chosen one's body, dress, race, hair, move, facing and tints. */
export function startPanel(root: HTMLElement, handlers: PanelHandlers): (state: PanelState) => void {
  let filter = '';
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

  const dress = (state: PanelState, placed: Placed): HTMLElement[] => {
    const { looks, skins, hair } = state;
    const drawn = looks.bodies[placed.figure.body];
    const set = (patch: Partial<Placed['figure']>) => {
      placed.figure = { ...placed.figure, ...patch };
      handlers.change();
    };
    const bodies = Object.keys(looks.bodies).map((key) => [key, key] as const);
    const races = Object.keys(skins.bodies[placed.figure.body]?.races ?? {}).map((key) => [key, key] as const);
    const hairLayers = Object.keys(drawn?.layers ?? {}).filter((layer) => layer.startsWith('hair_'));
    const hairColours = Object.keys(hair.bodies[placed.figure.body]?.['*'] ?? {});
    const presets = Object.entries(looks.looks ?? {})
      .filter(([, look]) => look.body === placed.figure.body)
      .map(
        ([key, look]) => [key, `${key}: ${[look.race, ...look.gear, look.weapon].filter(Boolean).join(', ')}`] as const,
      );
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
    const search = make('input');
    Object.assign(search, { type: 'search', placeholder: 'Filter gear', value: filter });
    const gearList = make('div', '', 'gear');
    const listGear = () => {
      gearList.replaceChildren();
      const worn = new Set(placed.figure.gear);
      const layers = Object.keys(drawn?.layers ?? {}).filter(
        (layer) => !NOT_GEAR.test(layer) && layer.includes(filter),
      );
      for (const layer of layers.sort((first, second) => Number(worn.has(second)) - Number(worn.has(first)))) {
        const box = make('input');
        Object.assign(box, { type: 'checkbox', checked: worn.has(layer) });
        box.addEventListener('change', () => {
          const gear = placed.figure.gear.filter((each) => each !== layer);
          set({ gear: box.checked ? [...gear, layer] : gear });
        });
        const row = make('label', '', 'row');
        row.append(box, make('span', layer));
        gearList.append(row);
      }
    };
    search.addEventListener('input', () => {
      filter = search.value;
      listGear();
    });
    listGear();
    const dyeable = new Set(looks.dye ?? []);
    const tints = placed.figure.gear
      .filter((layer) => dyeable.has(layer))
      .map((layer) => {
        const picker = make('input');
        Object.assign(picker, { type: 'color', value: hex(placed.tints[layer] ?? [128, 128, 128]) });
        picker.addEventListener('change', () => {
          placed.tints = { ...placed.tints, [layer]: fromHex(picker.value) };
          handlers.change();
        });
        return labelled(layer, picker);
      });
    return [
      labelled(
        'Body',
        choice(bodies, placed.figure.body, (value) => set({ body: value, gear: [], hair: null, race: null })),
      ),
      labelled(
        'Dress as',
        choice([['', 'as now'], ...presets], '', (value) => {
          const look = looks.looks?.[value];
          if (look) set({ gear: [...look.gear, ...(look.weapon ? [look.weapon] : [])], race: look.race ?? null });
        }),
      ),
      labelled(
        'Race',
        choice([['', 'as rendered'], ...races], placed.figure.race ?? '', (value) => set({ race: value || null })),
      ),
      labelled(
        'Hair',
        choice(
          [['', 'none'], ...hairLayers.map((key) => [key, key] as const)],
          placed.figure.hair?.layer ?? '',
          (value) =>
            set({ hair: value ? { layer: value, colour: placed.figure.hair?.colour ?? hairColours[0] ?? '' } : null }),
        ),
      ),
      labelled(
        'Hair colour',
        choice(
          hairColours.map((key) => [key, key] as const),
          placed.figure.hair?.colour ?? '',
          (value) => placed.figure.hair && set({ hair: { ...placed.figure.hair, colour: value } }),
        ),
      ),
      labelled(
        'Move',
        choice(anims, placed.anim, (value) => {
          placed.anim = value;
          handlers.change();
        }),
      ),
      labelled('Facing', facing),
      labelled('Turn round', spin),
      make('h2', 'Tints'),
      ...(tints.length > 0 ? tints : [make('p', 'Wear a dyeable layer to tint it.', 'hint')]),
      make('h2', 'Gear'),
      search,
      gearList,
    ];
  };

  return (state: PanelState) => {
    status.textContent = state.status;
    // Rebuilt only when the figures or the chosen one change, so typing in a field keeps its focus.
    const figures = state.figures.map((each) => [each.id, each.anim, each.figure]);
    const key = JSON.stringify([figures, state.chosen?.id, state.walking]);
    if (key === shown) return;
    shown = key;
    const speed = make('input');
    Object.assign(speed, { type: 'number', min: '1', max: '30', value: String(state.fps) });
    speed.addEventListener('change', () => handlers.fps(Number(speed.value) || state.fps));
    const list = make('div', '', 'figures');
    for (const placed of state.figures) {
      const pick = button(`${placed.id}: ${placed.figure.body}, ${placed.anim}`, () => handlers.choose(placed.id));
      if (placed === state.chosen) pick.classList.add('active');
      list.append(pick);
    }
    body.replaceChildren(
      make('h2', 'Figures'),
      list,
      button('Add a figure', handlers.add),
      button('Remove the chosen', handlers.remove),
      labelled('Frames a second', speed),
      ...(state.walking ? [make('p', 'Walking: W A S D, Shift to run. G stops.', 'hint')] : []),
      ...(state.chosen ? [make('h2', 'Chosen figure'), ...dress(state, state.chosen)] : []),
    );
  };
}
