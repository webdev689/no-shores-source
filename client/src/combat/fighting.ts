import type { Look, FightEvent, FlyingShot, SeenPlayer } from '../network/messages.ts';
import { inputBytes } from '../network/messages.ts';
import { Prediction } from '../network/prediction.ts';
import type { RoomLink, Snapshot } from '../network/roomConnection.ts';
import type { FightRules, Glanced } from '../rules/fightRules.ts';
import { type Body, type Controls, type MovementRules, bodyOf, floatsOfControls } from '../rules/movementRules.ts';
import { type FighterView, fighterView, glanceFrom, glanceView } from '../rules/fighters.ts';

/** Where the combat crate keeps, in a fighter's whole numbers, its arms, its swings so far (a swing begun moves it on)
 *  and its action's kind (12 for the dead). */
const ARMS_AT = 22 + 1;
const BLOWS_AT = 22 + 21;
const ACTION_AT = 22 + 23;
const DEAD = 12;

/** The fighter holding these arms, as the room sets them from each input before it steps it: the dead hold theirs. */
function armed(fighter: Float64Array, arms: number): Float64Array {
  if (fighter[ACTION_AT] === DEAD) return fighter;
  const holding = fighter.slice();
  holding[ARMS_AT] = arms;
  return holding;
}

/** A foe as the page keeps it: its kind, and the room's glance at it now and the tick before. */
export interface KeptFoe {
  readonly id: number;
  readonly kind: number;
  readonly view: FighterView;
  readonly before: FighterView | null;
}

/** The fight's buttons for the ticks of a frame: a swing held (and the stroke the next one takes, 1 to 6), a shot
 *  held, the guard held, a dodge pressed (kept for the next tick), and the look's pitch. */
export interface FightButtons {
  readonly swing: boolean;
  readonly shoot: boolean;
  readonly guard: boolean;
  readonly dodge: boolean;
  readonly pitch: number;
}

const NO_BUTTONS: FightButtons = { swing: false, shoot: false, guard: false, dodge: false, pitch: 0 };

/** One input kept until the room takes it: its intent and the fighters it was predicted among, so a replay takes the
 *  same steps the room does. */
interface Asked {
  readonly intent: Float64Array;
  readonly view: readonly Glanced[];
  readonly arms: number;
}

/**
 * The page's side of a fight in a room, wherever the room runs: each tick's intent sent with what the player looks
 * like and holds, the player's fighter predicted by the same rules the room takes it by and set by the room's word,
 * and the foes, other players, shots and events of its snapshots kept for drawing.
 */
export class Fighting {
  private readonly rules: FightRules;
  private readonly link: RoomLink;
  private readonly prediction = new Prediction<Asked>();
  private fighter: Float64Array | null = null;
  private seen = 0n;
  private view: Glanced[] = [];
  private buttons: FightButtons = NO_BUTTONS;
  private dodgeQueued = false;
  private readonly spawnsQueued: number[] = [];
  private sentDress = '';
  /** The stroke the next swing takes, 1 to 6: chosen at random, as DFO's first person chooses, and again once used. */
  stroke = 1 + Math.floor(Math.random() * 6);
  /** Swings the player's fighter has begun since the page last asked. */
  swingsBegun = 0;
  arms = 0;
  look: Look = { anim: 'idle', frame: 0, facing: 0 };
  dress = '';
  readonly foes = new Map<number, KeptFoe>();
  readonly others = new Map<number, SeenPlayer>();
  events: FightEvent[] = [];
  shots: readonly FlyingShot[] = [];

  constructor(rules: FightRules, link: RoomLink) {
    this.rules = rules;
    this.link = link;
  }

  get player(): number {
    return this.link.player;
  }

  /** The player's fighter as the page predicts it, or null before the room's first word. */
  get own(): FighterView | null {
    return this.fighter ? fighterView(this.fighter) : null;
  }

  /** The fight's buttons for the ticks this frame steps; a dodge pressed is kept until a tick takes it. */
  press(buttons: FightButtons): void {
    this.buttons = buttons;
    this.dodgeQueued ||= buttons.dodge;
  }

  /** Asks the room to stand a foe of this kind before the player (or to send every foe away): one ask an input, in the
   *  order asked. */
  ask(kind: number): void {
    this.spawnsQueued.push(kind);
  }

  /** The movement rules as the page's tick loop steps them, but each tick's body the fighter's: its intent sent to the
   *  room and its fighter predicted among the fighters the player last saw. Before the room's first word, it stands. */
  steps(movement: MovementRules): MovementRules {
    return { ...movement, step: (body, controls) => this.tick(body, controls) };
  }

  private tick(body: Body, controls: Controls): Body {
    if (!this.fighter) return body;
    const { swing, shoot, guard, pitch } = this.buttons;
    const intent = new Float64Array([
      ...floatsOfControls(controls),
      swing ? this.stroke : 0,
      guard ? 1 : 0,
      this.dodgeQueued ? 1 : 0,
      shoot ? 1 : 0,
      pitch,
    ]);
    this.dodgeQueued = false;
    const dress = this.dress === this.sentDress ? undefined : this.dress;
    this.sentDress = this.dress;
    const view = this.view;
    const arms = this.arms;
    const sequence = this.prediction.next({ intent, view, arms });
    const parts = { intent, look: this.look, arms, seen: this.seen, spawn: this.spawnsQueued.shift() ?? 0 };
    this.link.send(inputBytes(sequence, dress === undefined ? parts : { ...parts, dress }));
    const before = this.fighter[BLOWS_AT] ?? 0;
    this.fighter = this.rules.predict(armed(this.fighter, arms), intent, this.player, view);
    if ((this.fighter[BLOWS_AT] ?? 0) !== before) {
      this.swingsBegun += 1;
      this.stroke = 1 + Math.floor(Math.random() * 6);
    }
    return bodyOf(Array.from(this.fighter.subarray(0, 22)));
  }

  /** Takes a room's snapshot: the player's fighter set by the room's word with every input it has not taken stepped on
   *  top; every other player and foe kept, each foe with its glance a tick before; its shots and events. */
  receive(snapshot: Snapshot): void {
    this.seen = snapshot.tick;
    const view: Glanced[] = [];
    this.others.clear();
    for (const seen of snapshot.players) {
      if (seen.player === this.player) {
        this.fighter = this.prediction.corrected(seen.fighter, seen.acknowledged, (fighter, asked) =>
          this.rules.predict(armed(fighter, asked.arms), asked.intent, this.player, asked.view),
        );
        continue;
      }
      this.others.set(seen.player, seen);
      view.push({ id: seen.player, glance: glanceFrom(seen.fighter) });
    }
    const present = new Set<number>();
    for (const foe of snapshot.foes) {
      present.add(foe.id);
      const kept = this.foes.get(foe.id);
      this.foes.set(foe.id, { id: foe.id, kind: foe.kind, view: glanceView(foe.glance), before: kept?.view ?? null });
      view.push({ id: foe.id, glance: foe.glance });
    }
    for (const id of this.foes.keys()) if (!present.has(id)) this.foes.delete(id);
    this.view = view;
    this.shots = snapshot.shots;
    this.events.push(...snapshot.events);
  }

  /** Lets the room's clock run, for a room in the page. */
  pump(seconds: number): void {
    this.link.pump(seconds);
  }

  /** The events since the page last asked, handed over once. */
  takeEvents(): FightEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }
}
