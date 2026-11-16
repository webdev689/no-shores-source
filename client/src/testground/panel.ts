import { button, make } from '../editor/dom.ts';
import type { ForgeLooks } from '../forge/looks.ts';
import type { HairColours } from '../forge/skins.ts';
import { choice, dressControls, labelled } from './dressPanel.ts';
import type { Placed } from '../player/figures.ts';
import { CLEAR_FOES, FOE_KINDS } from './foeKinds.ts';

/** What the panel shows: the forge's tables, the figures (the player's own among them), the chosen one, the figures'
 *  speed, whether the player is playing, and a status line. */
export interface PanelState {
  readonly looks: ForgeLooks;
  readonly hair: HairColours;
  readonly figures: readonly Placed[];
  readonly chosen: Placed | null;
  readonly fps: number;
  readonly playerId: number;
  readonly playing: boolean;
  readonly status: string;
}

/** What the panel asks for. `change` follows any edit of the chosen figure, made in place. */
export interface PanelHandlers {
  add(): void;
  remove(): void;
  choose(id: number): void;
  change(): void;
  fps(value: number): void;
  /** Plays a move once on the player. */
  act(anim: string): void;
  /** Stands a foe of this kind before the player, or sends every foe away. */
  fight(kind: number): void;
}

/** DFO's controls, as the hint lists them. */
const CONTROLS = [
  'Click the view to play; Escape frees the mouse.',
  'W A S D move, the mouse looks, Shift runs, Space jumps (at a wall: grabs, vaults or mantles), C crouches or lets go.',
  'Into a wall too high to grab: climb. Hanging: A D shimmy, W climbs over.',
  'Z readies or puts away the weapon; right click swings, holding swings again. Q casts. Comma mounts.',
  'Left click or F guards; pressed just as a blow lands, it parries. V or Mouse5 dodges the way you move.',
  'The wheel moves between first and third person; Mouse4 switches straight.',
];

/** The Test Ground's panel: the figures, and the chosen one's move, facing and dress. */
export function startPanel(root: HTMLElement, handlers: PanelHandlers): (state: PanelState) => void {
  const garmentFilter = { text: '' };
  let shown = '';
  const status = make('p', '', 'status');
  const body = make('div');
  root.append(make('h1', 'Test Ground'), ...CONTROLS.map((line) => make('p', line, 'hint')), body, status);

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
    if (placed.id === state.playerId)
      return [
        labelled(
          'Play once',
          choice([['', 'a move…'], ...anims], '', (value) => value && handlers.act(value)),
        ),
      ];
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
    const figures = state.figures.map((each) => [each.id, each.anim, each.dress]);
    const key = JSON.stringify([figures, state.chosen?.id]);
    if (key === shown) return;
    shown = key;
    const speed = make('input');
    Object.assign(speed, { type: 'number', min: '1', max: '30', value: String(state.fps) });
    speed.addEventListener('change', () => handlers.fps(Number(speed.value) || state.fps));
    const list = make('div', '', 'figures');
    for (const placed of state.figures) {
      const who = placed.id === state.playerId ? 'You' : `${placed.id}`;
      const label = `${who}: ${placed.dress.race}, ${placed.dress.body}${placed.id === state.playerId ? '' : `, ${placed.anim}`}`;
      const pick = button(label, () => handlers.choose(placed.id));
      if (placed === state.chosen) pick.classList.add('active');
      list.append(pick);
    }
    const chosen = state.chosen;
    const foes = FOE_KINDS.map((kind) =>
      button(`${/^[aeiou]/i.test(kind.name) ? 'An' : 'A'} ${kind.name.toLowerCase()}`, () =>
        handlers.fight(kind.number),
      ),
    );
    body.replaceChildren(
      make('h2', 'Foes'),
      ...foes,
      button('Send every foe away', () => handlers.fight(CLEAR_FOES)),
      make('h2', 'Figures'),
      list,
      button('Add a figure ahead', handlers.add),
      button('Remove the chosen', handlers.remove),
      labelled('Figures’ frames a second', speed),
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
