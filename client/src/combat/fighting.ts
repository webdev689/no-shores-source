import type { Look, FightEvent, FlyingShot, SeenPlayer } from '../network/messages.ts';
import { inputBytes } from '../network/messages.ts';
import { Prediction } from '../network/prediction.ts';
import type { RoomLink, Snapshot } from '../network/roomConnection.ts';
import type { CombatRules, Fired, Glanced } from '../rules/combatRules.ts';
import { type Body, type Controls, type MovementRules, bodyOf, floatsOfControls } from '../rules/movementRules.ts';
import { type FighterView, fighterView, glanceFrom, glanceView } from '../rules/fighters.ts';

/** Where the combat crate keeps, in a fighter's whole numbers, its arms, its swings so far (a swing begun moves it on)
 *  and its action's kind (0 at rest, 12 for the dead). */
const ARMS_AT = 22 + 1;
const BLOWS_AT = 22 + 21;
const ACTION_AT = 22 + 23;
/** Where it keeps the ticks since a parry window passed unused (0 once a press may open another), and where its arms
 *  code keeps the ranged weapon's number. */
const MISSED_PARRY_AT = 22 + 19;
const RANGED_SHIFT = 8;
const IDLE = 0;
const DEAD = 12;
/** A ranged weapon raised to aim (a bow's draw), as the combat crate numbers the action. */
const DRAW = 10;
/** The most bytes of dress the room takes (room's DRESS_LIMIT); a longer one is refused as no input at all. */
const DRESS_LIMIT = 4096;
const STROKES = [1, 2, 3, 4, 5, 6] as const;

/** The fighter holding these arms, as the room sets them from each input before it steps it (combat's
 *  `Fighter::holding`): taken up only at rest or dead, never in the middle of a swing, a guard, a draw or a reload. */
function armed(fighter: Float64Array, arms: number): Float64Array {
  if (fighter[ACTION_AT] !== IDLE && fighter[ACTION_AT] !== DEAD) return fighter;
  const holding = fighter.slice();
  holding[ARMS_AT] = arms;
  return holding;
}

/** The strokes, 1 to 6, whose reach (`reach`, feet to a body's middle) takes in a target `apart` metres away; all six
 *  with no target, or when none reaches it. */
export function strokesReaching(apart: number | null, reach: (stroke: number) => number): number[] {
  const reaching = apart === null ? [] : STROKES.filter((stroke) => reach(stroke) >= apart);
  return reaching.length > 0 ? reaching : [...STROKES];
}

/** A foe as the page keeps it: its kind, the room's glance at it now and at the snapshot before, and the room ticks
 *  between the two. */
export interface KeptFoe {
  readonly id: number;
  readonly kind: number;
  readonly view: FighterView;
  readonly before: FighterView | null;
  readonly ticks: number;
}

/** The fight's buttons for the ticks of a frame: a swing held (and the stroke the next one takes, 1 to 6), a shot's
 *  trigger held, the guard held, a dodge pressed, the look's pitch, a ranged weapon held up to aim and the point an
 *  aimed shot is laid on (the crosshair's; along the look if none), and whether the swing, the trigger or the guard
 *  was pressed since the last frame (even let go again). */
export interface FightButtons {
  readonly swing: boolean;
  readonly shoot: boolean;
  readonly guard: boolean;
  readonly dodge: boolean;
  readonly pitch: number;
  readonly aim?: boolean;
  readonly mark?: readonly [number, number, number] | null;
  readonly swingPressed?: boolean;
  readonly shootPressed?: boolean;
  readonly guardPressed?: boolean;
}

const NO_BUTTONS: FightButtons = { swing: false, shoot: false, guard: false, dodge: false, pitch: 0 };

/**
 * A button whose every press reaches the rules, which see a press as the button coming in: a press is in the next
 * tick's intent even if it was let go before that tick, and one made while the button was already in (the other
 * binding held) lets it out for a tick first.
 */
class Latch {
  private queued = false;
  private was = false;

  press(): void {
    this.queued = true;
  }

  /** Whether the button is in this tick's intent, `held` the button now. */
  tick(held: boolean): boolean {
    let now = held;
    if (this.queued) {
      now = !this.was;
      this.queued = !now;
    }
    this.was = now;
    return now;
  }
}

/** One input kept until the room takes it: its intent and the fighters it was predicted among, so a replay takes the
 *  same steps the room does, and the shot its tick let go as last predicted. */
interface Asked {
  readonly intent: Float64Array;
  readonly view: readonly Glanced[];
  readonly arms: number;
  fired: Fired | null;
}

/**
 * The page's side of a fight in a room, wherever the room runs: each tick's intent sent with what the player looks
 * like and holds, the player's fighter predicted by the same rules the room takes it by and set by the room's word,
 * and the foes, other players, shots and events of its snapshots kept for drawing.
 */
export class Fighting {
  private readonly rules: CombatRules;
  private readonly link: RoomLink;
  private readonly random: () => number;
  private readonly prediction = new Prediction<Asked>();
  private fighter: Float64Array | null = null;
  private seen = 0n;
  private view: Glanced[] = [];
  private buttons: FightButtons = NO_BUTTONS;
  private readonly latches = { swing: new Latch(), shoot: new Latch(), guard: new Latch(), dodge: new Latch() };
  private readonly spawnsQueued: number[] = [];
  private sentDress = '';
  /** The stroke the next swing takes, 1 to 6: chosen at random among those that reach the soft lock's target, as
   *  Daggerfall Unity's click chooses among all six, and again once used. */
  stroke: number;
  /** Swings the player's fighter has begun since the page last asked. */
  swingsBegun = 0;
  /** Times the player's fighter lowered an aimed weapon unfired, since the page last asked. */
  drawsDropped = 0;
  /** The shots the player's fighter let go, as its own ticks predicted them, since the page last asked: each once,
   *  when first predicted, or when the room's word made an input let go a shot it had not. */
  fired: Fired[] = [];
  arms = 0;
  look: Look = { anim: 'idle', frame: 0, facing: 0 };
  dress = '';
  readonly foes = new Map<number, KeptFoe>();
  readonly others = new Map<number, SeenPlayer>();
  events: FightEvent[] = [];
  shots: readonly FlyingShot[] = [];
  private shotsReceived: FlyingShot[] = [];

  constructor(rules: CombatRules, link: RoomLink, random: () => number = Math.random) {
    this.rules = rules;
    this.link = link;
    this.random = random;
    this.stroke = this.roll();
  }

  get player(): number {
    return this.link.player;
  }

  /** The room tick of the last snapshot taken. */
  get roomTick(): number {
    return Number(this.seen);
  }

  /** The player's fighter as the page predicts it, or null before the room's first word. */
  get own(): FighterView | null {
    return this.fighter ? fighterView(this.fighter) : null;
  }

  /** The fight's buttons for the ticks this frame steps; each press is kept until a tick takes it. */
  press(buttons: FightButtons): void {
    this.buttons = buttons;
    if (buttons.swingPressed) this.latches.swing.press();
    if (buttons.shootPressed) this.latches.shoot.press();
    if (buttons.guardPressed) this.latches.guard.press();
    if (buttons.dodge) this.latches.dodge.press();
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

  /** Whether a press of the guard now could open a parry window, as the rules have it: never with a ranged weapon in
   *  hand, nor hard on the heels of a window left unused. */
  get parryOpen(): boolean {
    const fighter = this.fighter;
    if (!fighter) return false;
    const ranged = ((fighter[ARMS_AT] ?? 0) >> RANGED_SHIFT) & 0xff;
    return ranged === 0 && (fighter[MISSED_PARRY_AT] ?? 0) === 0;
  }

  /** Where the soft lock's target stands, as last seen; null with no lock. */
  get targetAt(): { readonly x: number; readonly y: number } | null {
    const target = this.own?.target ?? null;
    return (target === null ? undefined : (this.foes.get(target)?.view ?? this.others.get(target)?.body)) ?? null;
  }

  /** The strokes that reach the soft lock's target from where the player stands now (all six with none). */
  private reaching(): number[] {
    const own = this.own;
    const there = this.targetAt;
    const apart = own && there ? Math.hypot(there.x - own.x, there.y - own.y) : null;
    return strokesReaching(apart, (stroke) => this.rules.strokeReach(this.arms, stroke));
  }

  private roll(): number {
    const strokes = this.reaching();
    return strokes[Math.floor(this.random() * strokes.length)] ?? 1;
  }

  /** The dress to send with this tick's input: a changed one that fits the room; one too long is never sent, and the
   *  room keeps the last that fit. */
  private dressToSend(): string | undefined {
    if (this.dress === this.sentDress || new TextEncoder().encode(this.dress).length > DRESS_LIMIT) return undefined;
    this.sentDress = this.dress;
    return this.dress;
  }

  private tick(body: Body, controls: Controls): Body {
    if (!this.fighter) return body;
    const { pitch } = this.buttons;
    const swing = this.latches.swing.tick(this.buttons.swing);
    // The stroke rolled is kept while it reaches; once it does not and another would, it is rolled again.
    if (swing && !this.reaching().includes(this.stroke)) this.stroke = this.roll();
    const intent = new Float64Array([
      ...floatsOfControls(controls),
      swing ? this.stroke : 0,
      this.latches.guard.tick(this.buttons.guard) ? 1 : 0,
      this.latches.dodge.tick(false) ? 1 : 0,
      this.latches.shoot.tick(this.buttons.shoot) ? 1 : 0,
      pitch,
      this.buttons.aim ? 1 : 0,
      ...(this.buttons.mark ?? [Number.NaN, Number.NaN, Number.NaN]),
    ]);
    const dress = this.dressToSend();
    const view = this.view;
    const arms = this.arms;
    const asked: Asked = { intent, view, arms, fired: null };
    const sequence = this.prediction.next(asked);
    const parts = { intent, look: this.look, arms, seen: this.seen, spawn: this.spawnsQueued.shift() ?? 0 };
    this.link.send(inputBytes(sequence, dress === undefined ? parts : { ...parts, dress }));
    const before = this.fighter[BLOWS_AT] ?? 0;
    const drawing = this.fighter[ACTION_AT] === DRAW;
    const predicted = this.rules.predict(armed(this.fighter, arms), intent, this.player, view);
    this.fighter = predicted.fighter;
    asked.fired = predicted.fired;
    if (predicted.fired) this.fired.push(predicted.fired);
    if (drawing && this.fighter[ACTION_AT] === IDLE) this.drawsDropped += 1;
    if ((this.fighter[BLOWS_AT] ?? 0) !== before) {
      this.swingsBegun += 1;
      this.stroke = this.roll();
    }
    return bodyOf(Array.from(this.fighter.subarray(0, 22)));
  }

  /** Takes a room's snapshot: the player's fighter set by the room's word with every input it has not taken stepped on
   *  top; every other player and foe kept, each foe with its glance at the snapshot before; its shots and events. */
  receive(snapshot: Snapshot): void {
    const ticks = Math.max(1, Number(snapshot.tick - this.seen));
    this.seen = snapshot.tick;
    const view: Glanced[] = [];
    this.others.clear();
    for (const seen of snapshot.players) {
      if (seen.player === this.player) {
        this.fighter = this.prediction.corrected(seen.fighter, seen.acknowledged, (fighter, asked) => {
          const replayed = this.rules.predict(armed(fighter, asked.arms), asked.intent, this.player, asked.view);
          // A shot this input let go only as replayed on the room's word is the player's too; one it let go before
          // has been drawn already.
          if (replayed.fired && !asked.fired) this.fired.push(replayed.fired);
          asked.fired = replayed.fired ?? asked.fired;
          return replayed.fighter;
        });
        continue;
      }
      this.others.set(seen.player, seen);
      view.push({ id: seen.player, glance: glanceFrom(seen.fighter) });
    }
    const present = new Set<number>();
    for (const foe of snapshot.foes) {
      present.add(foe.id);
      const kept = this.foes.get(foe.id);
      const glanced = glanceView(foe.glance);
      this.foes.set(foe.id, { id: foe.id, kind: foe.kind, view: glanced, before: kept?.view ?? null, ticks });
      view.push({ id: foe.id, glance: foe.glance });
    }
    for (const id of this.foes.keys()) if (!present.has(id)) this.foes.delete(id);
    this.view = view;
    this.shots = snapshot.shots;
    this.shotsReceived.push(...snapshot.shots);
    this.events.push(...snapshot.events);
  }

  /** Lets the room's clock run, for a room in the page. */
  pump(seconds: number): void {
    this.link.pump(seconds);
  }

  /** Every snapshot's shots since the page last asked, each snapshot's handed over once: a ball's line comes in the
   *  one snapshot after it was fired. */
  takeShots(): FlyingShot[] {
    const shots = this.shotsReceived;
    this.shotsReceived = [];
    return shots;
  }

  /** The events since the page last asked, handed over once. */
  takeEvents(): FightEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }
}
