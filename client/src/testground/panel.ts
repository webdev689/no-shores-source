import { button, make } from '../editor/dom.ts';
import type { ForgeLooks } from '../forge/looks.ts';
import type { HairColours } from '../forge/skins.ts';
import { choice, dressControls, labelled } from './dressPanel.ts';
import type { Placed } from '../player/figures.ts';
import type { FoeAsk } from '../network/messages.ts';
import { type FoeType, factionsOf, rankChoices } from '../rules/roster.ts';
import { ELEMENTS } from '../player/gear.ts';

/** What the panel shows: the forge's tables, the figures (the player's own among them), the chosen one, the figures'
 *  speed, whether the player is playing, and a status line. */
export interface PanelState {
  readonly looks: ForgeLooks;
  readonly hair: HairColours;
  readonly figures: readonly Placed[];
  /** The figures of other players in the room, whose moves the room sets each tick. */
  readonly remote: ReadonlySet<Placed>;
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
  /** Stands a foe of a type and a rank, with a shield if asked, at a level (0, a foe of none) before the player, or
   *  sends every foe away. */
  fight(foe: FoeAsk, level: number): void;
}

/** DFO's controls, as the hint lists them. */
const CONTROLS = [
  'Click the view to play; Escape frees the mouse.',
  'W A S D move, the mouse looks, Shift runs, Space jumps (at a wall: grabs, vaults or mantles), C crouches or lets go.',
  'Into a wall too high to grab: climb. Hanging: A D shimmy, W climbs over.',
  'Z readies or puts away the weapon; 1 draws Melee, 2 Ranged. Right click swings, holding swings again. Comma mounts.',
  'R casts the Anima, Q and G the Tenets; Dusk Daggers aims while Q is held and casts on release.',
  'Left click or F guards; pressed just as a blow lands, it parries. V or Mouse5 dodges the way you move.',
  'A bow, crossbow or gun: left click fires at the locked foe; hold right click to aim (a bow charges), left click fires.',
  'The wheel moves between first and third person; Mouse4 switches straight.',
];

/** The foes the panel stands: a faction, one of its types (with where it is met) and one of the ranks that type comes
 *  in, each list following the one before, its level and its shield; then spawn one, or send every foe away. */
function foeControls(roster: readonly FoeType[], fight: PanelHandlers['fight']): HTMLElement {
  const section = make('div');
  const asked = { level: 0, shield: 0 };
  const shield = make('select');
  ['No shield', ...ELEMENTS.flatMap((each) => (each ? [`${each.name} shield`] : []))].forEach((name, element) =>
    shield.append(Object.assign(make('option', name), { value: String(element) })),
  );
  shield.addEventListener('change', () => (asked.shield = Number(shield.value) || 0));
  const level = make('input');
  Object.assign(level, { type: 'number', min: '0', max: '30', value: '0' });
  level.addEventListener('change', () => {
    asked.level = Math.min(30, Math.max(0, Math.round(Number(level.value) || 0)));
  });
  const factions = factionsOf(roster);
  let [faction] = factions[0] ?? [0];
  let type = roster.find((each) => each.faction === faction);
  let rank = type?.ranks[0] ?? 0;
  const show = () => {
    const types = roster.filter((each) => each.faction === faction);
    const typeOptions = types.map((each) => [String(each.type), `${each.name} (${each.domain})`] as const);
    section.replaceChildren(
      labelled(
        'Faction',
        choice(
          factions.map(([number, name]) => [String(number), name] as const),
          String(faction),
          (value) => {
            faction = Number(value);
            type = roster.find((each) => each.faction === faction);
            rank = type?.ranks[0] ?? 0;
            show();
          },
        ),
      ),
      labelled(
        'Type',
        choice(typeOptions, String(type?.type ?? ''), (value) => {
          type = types.find((each) => each.type === Number(value));
          rank = type?.ranks[0] ?? 0;
          show();
        }),
      ),
      labelled(
        'Rank',
        choice(type ? rankChoices(type) : [], String(rank), (value) => {
          rank = Number(value);
        }),
      ),
      labelled('Level (0: none)', level),
      labelled('Shield', shield),
      button('Spawn', () => type && fight({ type: type.type, rank, shield: asked.shield }, asked.level)),
      button('Clear', () => fight('clear', 0)),
    );
  };
  show();
  return section;
}

/** The Test Ground's panel: the foes to stand from the rules' `roster`, the figures, and the chosen one's move, facing
 *  and dress. */
export function startPanel(
  root: HTMLElement,
  roster: readonly FoeType[],
  handlers: PanelHandlers,
): (state: PanelState) => void {
  const garmentFilter = { text: '' };
  let shown = '';
  const status = make('p', '', 'status');
  const body = make('div');
  const foes = foeControls(roster, handlers.fight);
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
    // Rebuilt only when the figures, the chosen one or the forge's looks (once they load) change, so typing in a
    // field keeps its focus; another player's move changes every tick, so it is left out.
    const moveShown = (placed: Placed) => placed.id !== state.playerId && !state.remote.has(placed);
    const figures = state.figures.map((each) => [each.id, moveShown(each) ? each.anim : '', each.dress]);
    const key = JSON.stringify([figures, state.chosen?.id, Object.keys(state.looks.bodies).length]);
    if (key === shown) return;
    shown = key;
    const speed = make('input');
    Object.assign(speed, { type: 'number', min: '1', max: '30', value: String(state.fps) });
    speed.addEventListener('change', () => handlers.fps(Number(speed.value) || state.fps));
    const list = make('div', '', 'figures');
    for (const placed of state.figures) {
      const who = placed.id === state.playerId ? 'You' : `${placed.id}`;
      const label = `${who}: ${placed.dress.race}, ${placed.dress.body}${moveShown(placed) ? `, ${placed.anim}` : ''}`;
      const pick = button(label, () => handlers.choose(placed.id));
      if (placed === state.chosen) pick.classList.add('active');
      list.append(pick);
    }
    const chosen = state.chosen;
    body.replaceChildren(
      make('h2', 'Foes'),
      foes,
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
