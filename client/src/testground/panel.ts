import type { ForgeLooks } from '../forge/looks.ts';
import type { HairColours } from '../forge/skins.ts';
import type { Node } from '../ui/node.ts';
import type { Interface } from '../ui/ui.ts';
import { type OwnHands, dressNodes } from './dressPanel.ts';
import { field, heading, presses, hint, labelled, numberIn, pick, press, title, slide, tick } from './panelKit.ts';
import type { Placed } from '../player/figures.ts';
import type { Measured } from '../network/linkMeasure.ts';
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
  /** The kinds the player's gear wears in its Melee and Ranged loadouts (the gear crate's numbers, 0 for none), which
   *  their hands hold; null before the room first sends their gear. */
  readonly worn: { readonly melee: number; readonly ranged: number } | null;
  /** The light picked for the player's left (a forge layer), held where the room's arms allow it; or null. */
  readonly light: string | null;
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
  /** Wears a loadout of this kind (the gear crate's number) through the player's gear, so the room fights with it. */
  wear(kind: number): void;
  /** Carries a light (a forge layer, or null for none) in the player's left. */
  carry(light: string | null): void;
  /** Stands a foe of a type and a rank, with a shield if asked, at a level (0, a foe of none) before the player, or
   *  sends every foe away. */
  fight(foe: FoeAsk, level: number): void;
}

/** DFO's controls, as the hint lists them. */
const CONTROLS = [
  'Click the view to play; Escape frees the mouse.',
  'W A S D move, the mouse looks, Shift runs, Space jumps (at a wall: grabs, vaults or mantles), C crouches or lets go.',
  'Into a wall too high to grab: climb. Hanging: A D shimmy, W climbs over.',
  'Z readies or puts away the weapon; 1 draws Melee, 2 Ranged. Right click swings, holding swings again. Comma mounts, with a horse worn in the Mount slot.',
  'R casts the Anima, Q and G the Tenets; Dusk Daggers aims while Q is held and casts on release.',
  'Left click or F guards; pressed just as a blow lands, it parries. V or Mouse5 dodges the way you move.',
  'A bow, crossbow or gun: left click fires at the locked foe; hold right click to aim (a bow charges), left click fires.',
  'The wheel moves between first and third person; Mouse4 switches straight.',
];

/** The player's own hands, when the chosen figure is theirs: what their gear wears and the light carried, and the asks
 *  that change them. */
function own(state: PanelState, chosen: Placed, { wear, carry }: PanelHandlers): OwnHands | null {
  return chosen.id === state.playerId && state.worn ? { worn: state.worn, wear, light: state.light, carry } : null;
}

/** The Test Ground's panel: the foes to stand from the rules' `roster`, the figures, and the chosen one's move, facing
 *  and dress. */
export class Panel {
  private readonly roster: readonly FoeType[];
  private readonly handlers: PanelHandlers;
  private faction: number;
  private type: FoeType | undefined;
  private rank: number;
  /** The shield's element, by the gear crate's numbers: 0 for none. */
  private shield = 0;

  constructor(roster: readonly FoeType[], handlers: PanelHandlers) {
    this.roster = roster;
    this.handlers = handlers;
    [this.faction] = factionsOf(roster)[0] ?? [0];
    this.type = roster.find((each) => each.faction === this.faction);
    this.rank = this.type?.ranks[0] ?? 0;
  }

  /** The foes the panel stands: a faction, one of its types (with where it is met) and one of the ranks that type
   *  comes in, each list following the one before, its level and its shield; then spawn one, or send every foe away. */
  private foes(ui: Interface): Node[] {
    // Read as each list is built, so a faction picked this frame shows its own types at once.
    const types = () => this.roster.filter((each) => each.faction === this.faction);
    const level = Math.round(numberIn(ui, 'tg:foe:level', 0, 0, 30, 0));
    const shields = ['No shield', ...ELEMENTS.flatMap((each) => (each ? [`${each.name} shield`] : []))];
    return [
      labelled(
        'Faction',
        pick(
          ui,
          'tg:foe:faction',
          factionsOf(this.roster).map(([number, name]) => [String(number), name] as const),
          String(this.faction),
          (value) => {
            this.faction = Number(value);
            this.type = this.roster.find((each) => each.faction === this.faction);
            this.rank = this.type?.ranks[0] ?? 0;
          },
        ),
      ),
      labelled(
        'Type',
        pick(
          ui,
          'tg:foe:type',
          types().map((each) => [String(each.type), `${each.name} (${each.domain})`] as const),
          String(this.type?.type ?? ''),
          (value) => {
            this.type = types().find((each) => each.type === Number(value));
            this.rank = this.type?.ranks[0] ?? 0;
          },
        ),
      ),
      labelled(
        'Rank',
        pick(ui, 'tg:foe:rank', this.type ? rankChoices(this.type) : [], String(this.rank), (value) => {
          this.rank = Number(value);
        }),
      ),
      labelled('Level (0: none)', field('tg:foe:level', 'Level (0: none)', { width: 60 })),
      labelled(
        'Shield',
        pick(
          ui,
          'tg:foe:shield',
          shields.map((name, element) => [String(element), name] as const),
          String(this.shield),
          (value) => (this.shield = Number(value) || 0),
        ),
      ),
      presses([
        press(ui, 'tg:foe:spawn', 'Spawn', () => {
          if (this.type) this.handlers.fight({ type: this.type.type, rank: this.rank, shield: this.shield }, level);
        }),
        press(ui, 'tg:foe:clear', 'Clear', () => this.handlers.fight('clear', 0)),
      ]),
    ];
  }

  /** The chosen figure's move: the player's plays once; another's is set, with its facing and whether it turns. */
  private moving(ui: Interface, state: PanelState, placed: Placed): Node[] {
    const { handlers } = this;
    const drawn = state.looks.bodies[placed.dress.body];
    const anims = Object.keys(drawn?.anims ?? {})
      .sort()
      .map((key) => [key, `${key} (${drawn?.anims[key]?.frames ?? 0})`] as const);
    if (placed.id === state.playerId)
      return [
        labelled(
          'Play once',
          pick(ui, 'tg:fig:act', [['', 'a move…'], ...anims], '', (value) => value && handlers.act(value)),
        ),
      ];
    const degrees = Math.round((placed.facing * 180) / Math.PI);
    const facing = slide(ui, 'tg:fig:facing', degrees, { low: 0, high: 359, step: 1 });
    if (facing.value !== degrees) placed.facing = (facing.value * Math.PI) / 180;
    const spin = tick(ui, 'tg:fig:spin', '', placed.spin);
    placed.spin = spin.ticked;
    return [
      labelled(
        'Move',
        pick(ui, 'tg:fig:move', anims, placed.anim, (value) => {
          placed.anim = value;
          handlers.change();
        }),
      ),
      labelled('Facing', { ...facing.node, label: `Facing: ${facing.value} degrees` }),
      labelled('Turn round', { ...spin.node, label: `Turn round: ${spin.ticked ? 'on' : 'off'}` }),
    ];
  }

  /** The panel as `state` has it. */
  node(ui: Interface, state: PanelState): Node[] {
    const { handlers } = this;
    const moveShown = (placed: Placed) => placed.id !== state.playerId && !state.remote.has(placed);
    const typed = ui.fieldText('tg:fig:fps', String(state.fps)).trim();
    const fps = Number(typed);
    if (typed !== '' && Number.isFinite(fps) && Math.min(30, Math.max(1, fps)) !== state.fps) handlers.fps(fps);
    const figures = state.figures.map((placed) => {
      const who = placed.id === state.playerId ? 'You' : `${placed.id}`;
      const words = `${who}: ${placed.dress.race}, ${placed.dress.body}${moveShown(placed) ? `, ${placed.anim}` : ''}`;
      return press(ui, `tg:fig:${placed.id}`, words, () => handlers.choose(placed.id), {
        active: placed === state.chosen,
        width: 'grow',
      });
    });
    const chosen = state.chosen;
    return [
      title('Test Ground'),
      ...CONTROLS.map((words) => hint(words)),
      heading('Foes'),
      ...this.foes(ui),
      heading('Figures'),
      { direction: 'column', gap: 4, width: 'grow', children: figures },
      presses([
        press(ui, 'tg:fig:add', 'Add a figure ahead', handlers.add),
        press(ui, 'tg:fig:remove', 'Remove the chosen', handlers.remove),
      ]),
      labelled('Figures’ frames a second', field('tg:fig:fps', 'Figures’ frames a second', { width: 60 })),
      ...(chosen
        ? [
            heading('Chosen figure'),
            ...this.moving(ui, state, chosen),
            ...dressNodes(ui, state.looks, state.hair, chosen, handlers.change, own(state, chosen, handlers)),
          ]
        : []),
      hint(state.status),
    ];
  }
}

/** The room's readout, joined with `?room=`: its name, the player's number in it, and the link's lag (how much it
 *  strays) and loss as the page measures them. */
export function roomLine(room: string, player: number, measured: Measured): string {
  const lag = `lag ${Math.round(measured.lagMs)} ms (±${Math.round(measured.strayMs)})`;
  return `Room ${room}, player ${player}: ${lag}, ${Math.round(measured.lost * 100)}% lost.`;
}
