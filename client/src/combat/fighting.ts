import type {
  FoeAsk,
  FightEvent,
  FlyingShot,
  InputParts,
  Look,
  SeenFoe,
  SeenPlayer,
  Standing,
} from '../network/messages.ts';
import type { ArtState, CastAsk } from '../network/artMessages.ts';
import type { GearAsk } from '../network/gearMessages.ts';
import { inputBytes } from '../network/messages.ts';
import { Prediction } from '../network/prediction.ts';
import type { ArrivalSeen } from '../network/arrivalMessages.ts';
import type { PublicEvent } from '../network/publicMessages.ts';
import type { RoomLink, Snapshot } from '../network/roomConnection.ts';
import type { CombatRules, Fired, Glanced } from '../rules/combatRules.ts';
import { BODY_FLOATS, type Body, type Controls, type MovementRules, bodyOf } from '../rules/movementRules.ts';
import { type FighterView, fighterView, glanceFrom, glanceView, intentOf, trimmed } from '../rules/fighters.ts';
import type { AbilityState } from './abilityBar.ts';
import { type AimRing, abilitiesAt } from './casting.ts';
import { EVENT } from './cues.ts';
import { Foresight } from './foresight.ts';
import { SpellEffects } from './spellEffects.ts';

/** Where the combat crate keeps, in a fighter's whole numbers, its arms, its swings so far (a swing begun moves it on)
 *  and its action's kind (0 at rest, 1 swinging, 12 for the dead), a swing's stroke the first of its numbers. */
const ARMS_AT = BODY_FLOATS + 1;
const BLOWS_AT = BODY_FLOATS + 21;
const ACTION_AT = BODY_FLOATS + 23;
/** Where it keeps the ticks since a parry window passed unused (0 once a press may open another), and where its arms
 *  code keeps the ranged weapon's number. */
const MISSED_PARRY_AT = BODY_FLOATS + 19;
const RANGED_SHIFT = 8;
const IDLE = 0;
const ATTACK = 1;
/** A ranged weapon raised to aim (a bow's draw), as the combat crate numbers the action. */
const DRAW = 10;
/** The most bytes of dress the room takes (room's DRESS_LIMIT); a longer one is refused as no input at all. */
const DRESS_LIMIT = 4096;
/** The most shots and events kept for the next frame to show. */
const QUEUED_MOST = 256;
const STROKES = [1, 2, 3, 4, 5, 6] as const;
/** The player's strokes in the order their swings chain, at the owner's word, each drawn differently: the side cut,
 *  the overhead and the thrust (the combat crate's left, down and up). */
export const CHAIN = [3, 1, 6] as const;
/** Ticks without a swing (a second, at the room's 60 a second) after which the chain starts over at its first. */
const CHAIN_RESTS = 60;

/** The stroke a swing takes in the chain after `last` (from the chain's first with none): the next that reaches the
 *  soft lock's target (`reaching`), passing over those that do not; else the first that reaches. */
export function chained(last: number | null, reaching: readonly number[]): number {
  const from = CHAIN.findIndex((stroke) => stroke === last);
  for (let step = 1; step <= CHAIN.length; step++) {
    const stroke = CHAIN[(from + step) % CHAIN.length] ?? CHAIN[0];
    if (reaching.includes(stroke)) return stroke;
  }
  return reaching[0] ?? CHAIN[0];
}

/** The strokes, 1 to 6, whose reach (`reach`, feet to a body's middle) takes in a target `apart` metres away; all six
 *  with no target, or when none reaches it. */
export function strokesReaching(apart: number | null, reach: (stroke: number) => number): number[] {
  const reaching = apart === null ? [] : STROKES.filter((stroke) => reach(stroke) >= apart);
  return reaching.length > 0 ? reaching : [...STROKES];
}

/** A foe as the page keeps it: as the room sent it (its role, type, rank, faction, phase and alert), the room's glance
 *  at it now and at the snapshot before, and the room ticks between the two. */
export interface KeptFoe extends Omit<SeenFoe, 'glance'> {
  readonly view: FighterView;
  readonly before: FighterView | null;
  readonly ticks: number;
}

/** The fight's buttons for the ticks of a frame: a swing held (and the stroke the next one takes, 1 to 6), a shot's
 *  trigger held, the guard held, a dodge pressed, a drink pressed, the look's pitch, a ranged weapon held up to aim and
 *  the point an aimed shot is laid on (the crosshair's; along the look if none), and whether the swing, the trigger or
 *  the guard was pressed since the last frame (even let go again). */
export interface FightButtons {
  readonly swing: boolean;
  readonly shoot: boolean;
  readonly guard: boolean;
  readonly dodge: boolean;
  readonly heal?: boolean;
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
  /** The room's tick it is expected to be stepped at: a Breach's run stands that tick's blocks under it. */
  readonly tick: number;
  fired: Fired | null;
  /** Whether its tick's blow was foreseen to hit, so a replay foresees it no more. */
  foresaw: boolean;
}

/**
 * The page's side of a fight in a room, wherever the room runs: each tick's intent sent with what the player looks
 * like and holds, the player's fighter predicted by the same rules the room takes it by and set by the room's word,
 * and the foes, other players, shots and events of its snapshots kept for drawing.
 */
export class Fighting {
  private readonly rules: CombatRules;
  private readonly link: RoomLink;
  private prediction = new Prediction<Asked>();
  /** The link's welcomes the page has followed: one more means the player joined the room again. */
  private joined: number;
  private fighter: Float64Array | null = null;
  /** The last inputs sent, which go again with the next on a link that may lose one (`RoomLink.resend`). */
  private sentLately: { readonly sequence: number; readonly parts: InputParts }[] = [];
  /** The trim last laid on the fighter from the room's word on the player's gear. */
  private trimTaken: readonly number[] | null = null;
  private seen = 0n;
  /** Ticks stepped since the last snapshot; in a Breach's run, its seals open (null elsewhere), and whether the
   *  player bears the Lodestone, which the room makes bare handed. */
  private ahead = 0;
  private breachSeals: number | null = null;
  private bearing = false;
  private view: Glanced[] = [];
  private buttons: FightButtons = NO_BUTTONS;
  private readonly latches = {
    swing: new Latch(),
    shoot: new Latch(),
    guard: new Latch(),
    dodge: new Latch(),
    heal: new Latch(),
  };
  private readonly spawnsQueued: { readonly foe: FoeAsk; readonly level: number }[] = [];
  private readonly gearQueued: GearAsk[] = [];
  /** A cast waiting for the next tick's input, and the room's word on the Arts with the room tick it came by. */
  private castQueued: CastAsk | null = null;
  private artsTaken: ArtState | null = null;
  private artsAt = 0;
  private sentDress = '';
  private respawnAsked = false;
  /** Whether Use is held over a fallen ally beside the player, sent with each tick's input (`footRevive.ts`). */
  reviving = false;
  /** Whether a menu is open on the player's screen, sent with each input for others to see over their head. */
  menuOpen = false;
  /** Where the player stands with a node's section, as the room last said: dead, by a fall or past its edge, the room
   *  takes their inputs without steering them, and their body falls under its own weight to lie where it lands. */
  standing: Standing = { kind: 'inside' };
  /** The stroke the next swing takes, 1 to 6: the chain's next after the last swing's (`chained`), or its first once
   *  the player has rested from swinging. */
  stroke: number = CHAIN[0];
  /** The last swing's stroke, and the ticks since the player's fighter last swung. */
  private struck: number | null = null;
  private rested = CHAIN_RESTS;
  /** Swings the player's fighter has begun since the page last asked. */
  swingsBegun = 0;
  /** Times the player's fighter lowered an aimed weapon unfired, since the page last asked. */
  drawsDropped = 0;
  /** Shots the player's fighter let go, since the page last asked: none while the rules refuse one (no ammunition, a
   *  reload, a swap). */
  shotsLoosed = 0;
  /** The shots the player's fighter let go, as its own ticks predicted them, since the page last asked: each once,
   *  when first predicted, or when the room's word made an input let go a shot it had not. */
  fired: Fired[] = [];
  arms = 0;
  look: Look = { anim: 'idle', frame: 0, facing: 0 };
  dress = '';
  readonly foes = new Map<number, KeptFoe>();
  readonly others = new Map<number, SeenPlayer>();
  events: FightEvent[] = [];
  /** The player's own hits foreseen, as the room would tell them. */
  private foresight = new Foresight();
  /** The zone's public events as the room last sent them, and their events (begun, a shard set, won...) since the
   *  page last asked: kept apart from the fight's, which read every event as a blow. */
  private publicWord: PublicEvent | null = null;
  /** Every airship and crown bringing foes, as the room last sent them (`arrivalMessages.ts`). */
  arrivals: readonly ArrivalSeen[] = [];
  publicEvents: FightEvent[] = [];
  shots: readonly FlyingShot[] = [];
  /** Every spell in the room, as its snapshots send them, for a drawer to draw. */
  readonly spells = new SpellEffects();
  /** Dusk Daggers' ring while it is aimed, for the marks on the ground. */
  aimRing: AimRing | null = null;
  /** The last spell the player cast, with the room tick it was asked at: its look begins as it is asked. */
  castSent: { readonly spell: number; readonly tick: number } | null = null;
  private shotsReceived: FlyingShot[] = [];

  constructor(rules: CombatRules, link: RoomLink) {
    this.rules = rules;
    this.link = link;
    this.joined = link.joins;
  }

  /** Follows the link into the room it joined again: a new player there, standing where the room puts them, with
   *  nothing of the old room kept but what the hands hold and the dress, sent again, and the asks made while it
   *  rejoined (a foe, gear, a respawn), which go with the first input. A cast waiting for the old room is never sent
   *  into the new one. */
  private follow(): void {
    if (this.link.joins === this.joined) return;
    this.joined = this.link.joins;
    [this.prediction, this.fighter, this.seen, this.view, this.sentDress] = [new Prediction(), null, 0n, [], ''];
    this.sentLately = [];
    [this.castQueued, this.castSent, this.artsTaken, this.artsAt] = [null, null, null, 0];
    this.foes.clear();
    this.others.clear();
    this.spells.clear();
    this.arrivals = [];
    this.struck = null;
    this.foresight = new Foresight();
  }

  get player(): number {
    return this.link.player;
  }

  /** The rooms the fight has followed the link into: one more each time it joins its room again. */
  get joins(): number {
    return this.joined;
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
    if (buttons.heal) this.latches.heal.press();
  }

  /** Asks the room to stand a foe of a type and a rank before the player, at a level (0, a foe of none), or to send
   *  every foe away: one ask an input, in the order asked. */
  ask(foe: FoeAsk, level = 0): void {
    this.spawnsQueued.push({ foe, level });
  }

  /** Asks something of the player's gear: one ask an input, in the order asked. */
  askGear(ask: GearAsk): void {
    this.gearQueued.push(ask);
  }

  /** Casts a spell with the next tick's input (spell 0 carries only Dusk Daggers' aim, while it is held); one not
   *  `seen` (the Lodestone's grounding) begins no spell's look. */
  cast(ask: CastAsk, seen = true): void {
    if (ask.spell > 0 || this.castQueued === null) this.castQueued = ask;
    if (ask.spell > 0 && seen) this.castSent = { spell: ask.spell, tick: this.roomTick };
  }

  /** The room's last word on the player's Arts; none before it. */
  get arts(): ArtState | null {
    return this.link.arts ?? null;
  }

  /** The Arts as the ability bar shows them now: the room's last word, each share run on to the room's clock. */
  get abilities(): AbilityState | null {
    return abilitiesAt(this.artsTaken, this.artsAt, this.roomTick);
  }

  /** Asks the room, with the next tick's input, to stand the player again once fallen: where a respawn stands them
   *  (crates/room/src/revive.rs), past the section's edge or in a fight. */
  askRespawn(): void {
    this.respawnAsked = true;
  }

  /** Whether an ask of a foe or of the gear waits for an input to carry it. */
  get asking(): boolean {
    return this.spawnsQueued.length > 0 || this.gearQueued.length > 0;
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

  /** How many ticks the parry window a press of the player's guard opens stays open, as the rules give it. */
  get parryWindow(): number {
    return this.rules.parryWindow(true);
  }

  /** Where the soft lock's target stands, as last seen; null with no lock. */
  get targetAt(): { readonly x: number; readonly y: number } | null {
    const target = this.own?.target ?? null;
    return (target === null ? undefined : (this.foes.get(target)?.view ?? this.others.get(target)?.body)) ?? null;
  }

  /** How far apart, centre to centre, a foe may stand for the player's longest stroke to reach it. */
  get reach(): number {
    return Math.max(...STROKES.map((stroke) => this.rules.strokeReach(this.arms, stroke, true)));
  }

  /** The strokes that reach the soft lock's target from where the player stands now (all six with none). */
  private reaching(): number[] {
    const own = this.own;
    const there = this.targetAt;
    const apart = own && there ? Math.hypot(there.x - own.x, there.y - own.y) : null;
    return strokesReaching(apart, (stroke) => this.rules.strokeReach(this.arms, stroke, true));
  }

  /** The stroke the chain takes next from where the player stands now: its first after a rest. */
  private next(): number {
    return chained(this.rested >= CHAIN_RESTS ? null : this.struck, this.reaching());
  }

  /** The dress to send with this tick's input: a changed one that fits the room; one too long is never sent, and the
   *  room keeps the last that fit. */
  private dressToSend(): string | undefined {
    if (this.dress === this.sentDress || new TextEncoder().encode(this.dress).length > DRESS_LIMIT) return undefined;
    this.sentDress = this.dress;
    return this.dress;
  }

  private tick(body: Body, controls: Controls): Body {
    this.follow();
    if (!this.fighter) return body;
    // A new word on the player's gear is theirs at once: the trim the room now steps them by.
    if (this.link.trim && this.link.trim !== this.trimTaken) {
      this.trimTaken = this.link.trim;
      this.fighter = trimmed(this.fighter, this.link.trim);
    }
    // A room long unheard is sent nothing more until it speaks, and the player stands meanwhile: what a stalled
    // network holds back reaches it at once, and past its budget it would send the player away.
    if (this.link.quiet === true) return bodyOf(Array.from(this.fighter.subarray(0, BODY_FLOATS)));
    const { pitch } = this.buttons;
    const swing = this.latches.swing.tick(this.buttons.swing);
    // A swing asked takes the chain's next stroke that reaches from here, its first after a rest.
    if (swing) this.stroke = this.next();
    const intent = intentOf(controls, {
      stroke: swing ? this.stroke : 0,
      guard: this.latches.guard.tick(this.buttons.guard),
      dodge: this.latches.dodge.tick(false),
      shoot: this.latches.shoot.tick(this.buttons.shoot),
      pitch,
      aim: this.buttons.aim,
      mark: this.buttons.mark,
      heal: this.latches.heal.tick(false),
    });
    const dress = this.dressToSend();
    const view = this.view;
    // Arms the room would not let the player take up are bare hands, as the room makes them.
    const allowed = this.link.arms;
    const held = !allowed || allowed.length === 0 || allowed.includes(this.arms) ? this.arms : 0;
    const arms = this.bearing ? 0 : held;
    this.ahead += 1;
    const asked: Asked = { intent, view, arms, tick: Number(this.seen) + this.ahead, fired: null, foresaw: false };
    const sequence = this.prediction.next(asked);
    // Rejoining, the link sends nothing: what is asked then waits for the first input the new room takes.
    const holding = this.link.rejoining === true;
    const spawned = holding ? undefined : this.spawnsQueued.shift();
    const gear = holding ? undefined : this.gearQueued.shift();
    const cast = holding ? null : this.castQueued;
    if (!holding) this.castQueued = null;
    const parts = {
      intent,
      look: this.look,
      arms,
      seen: this.seen,
      spawn: spawned?.foe,
      spawnLevel: spawned?.level ?? 0,
      respawn: this.respawnAsked && !holding,
      revive: this.reviving && !holding,
      menu: this.menuOpen,
      ...(gear === undefined ? {} : { ask: gear }),
      ...(cast === null ? {} : { cast }),
    };
    if (!holding) this.respawnAsked = false;
    const sent = { sequence, parts: dress === undefined ? parts : { ...parts, dress } };
    this.link.send(inputBytes(sent.sequence, sent.parts, this.sentLately));
    this.link.inputSent?.(sequence);
    // Kept to go again with the next, on a link that may lose one; a WebSocket keeps none.
    const resend = this.link.resend ?? 0;
    this.sentLately = resend > 0 ? [...this.sentLately, sent].slice(-resend) : [];
    // Dead, the room steps the fighter as it lies, whatever is asked: nothing is swung or shot, and it falls on.
    if (this.standing.kind === 'dead') {
      this.struck = null;
      this.fighter = this.lying(this.fighter, view);
      return bodyOf(Array.from(this.fighter.subarray(0, BODY_FLOATS)));
    }
    const before = this.fighter[BLOWS_AT] ?? 0;
    const drawing = this.fighter[ACTION_AT] === DRAW;
    this.standBreach(asked.tick);
    const predicted = this.rules.predict(this.fighter, intent, this.player, arms, view);
    this.fighter = predicted.fighter;
    asked.fired = predicted.fired;
    asked.foresaw = this.foresight.foresee(predicted.hits, this.player, asked.tick);
    if (predicted.fired) {
      this.fired.push(predicted.fired);
      this.shotsLoosed += 1;
    }
    if (drawing && this.fighter[ACTION_AT] === IDLE) this.drawsDropped += 1;
    if ((this.fighter[BLOWS_AT] ?? 0) !== before) this.swingsBegun += 1;
    // The swing under way, the page's or one the room's word began, is the chain's last.
    const swinging = this.fighter[ACTION_AT] === ATTACK;
    if (swinging) this.struck = this.fighter[ACTION_AT + 1] ?? this.struck;
    this.rested = swinging ? 0 : this.rested + 1;
    return bodyOf(Array.from(this.fighter.subarray(0, BODY_FLOATS)));
  }

  /** In a Breach's run, the blocks the room stands at `tick` (its seals open and its slabs in their cycle) made the
   *  predictor's course; the rules make it anew only when a seal or a slab changed. */
  private standBreach(tick: number): void {
    if (this.breachSeals !== null) this.rules.setBreach(this.breachSeals, tick);
  }

  /** The fighter one tick on as the room steps a body the section killed (the room's `lying_still`): no push, its
   *  facing kept, letting go of any wall or lip it held, nothing fought and its arms kept, so it falls under its own
   *  weight and lies where it lands. */
  private lying(fighter: Float64Array, view: readonly Glanced[]): Float64Array {
    const body = bodyOf(Array.from(fighter.subarray(0, BODY_FLOATS)));
    const holding = body.mode === 'hang' || body.mode === 'climb';
    const controls = { forward: 0, sideways: 0, yaw: body.facing, run: false, jump: false, crouch: holding };
    const intent = intentOf({ ...controls, mounted: false });
    return this.rules.predict(fighter, intent, this.player, fighter[ARMS_AT] ?? 0, view).fighter;
  }

  /** Takes a room's snapshot: the player's fighter set by the room's word with every input it has not taken stepped on
   *  top; every other player and foe kept, each foe with its glance at the snapshot before; its shots and events. */
  receive(snapshot: Snapshot): void {
    this.follow();
    const ticks = Math.max(1, Number(snapshot.tick - this.seen));
    this.seen = snapshot.tick;
    this.ahead = 0;
    const breach = snapshot.breach && !snapshot.breach.gate ? snapshot.breach : null;
    this.breachSeals = breach?.seals ?? null;
    this.bearing = breach !== null && breach.stone === 2 && breach.bearer === this.player;
    const view: Glanced[] = [];
    this.others.clear();
    for (const seen of snapshot.players) {
      // Only a fighter fights: a player with none (a walker on a ship's deck) is no one's to strike here.
      if (!seen.fighter) continue;
      if (seen.player === this.player) {
        // The snapshot leaves out the player's trim: it is theirs from their gear.
        const whole = trimmed(seen.fighter, this.link.trim);
        this.standing = seen.standing;
        const dead = seen.standing.kind === 'dead';
        this.fighter = this.prediction.corrected(whole, seen.acknowledged, (fighter, asked) => {
          // The room took every input after a death as the body lying, whatever the input asked.
          if (dead) return this.lying(fighter, asked.view);
          this.standBreach(asked.tick);
          const replayed = this.rules.predict(fighter, asked.intent, this.player, asked.arms, asked.view);
          // A shot this input let go only as replayed on the room's word is the player's too; one it let go before
          // has been drawn already.
          if (replayed.fired && !asked.fired) {
            this.fired.push(replayed.fired);
            this.shotsLoosed += 1;
          }
          asked.fired = replayed.fired ?? asked.fired;
          // Likewise a hit foreseen only on the room's word.
          if (!asked.foresaw) asked.foresaw = this.foresight.foresee(replayed.hits, this.player, asked.tick);
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
      const { glance, ...seen } = foe;
      this.foes.set(foe.id, { ...seen, view: glanceView(glance), before: kept?.view ?? null, ticks });
      // A foe arriving is in no one's way and takes no blow until it lands (crates/room/src/arrivals.rs).
      if (!foe.arrival) view.push({ id: foe.id, glance: foe.glance });
    }
    for (const id of this.foes.keys()) if (!present.has(id)) this.foes.delete(id);
    this.view = view;
    this.spells.take(snapshot.spells);
    // The room's word on the Arts holds from the snapshot it came with: a share runs on from that tick.
    if (this.link.arts && this.link.arts !== this.artsTaken)
      [this.artsTaken, this.artsAt] = [this.link.arts, this.roomTick];
    this.shots = snapshot.shots;
    // Kept only so many: a hidden tab draws no frame to take them, and on its return the newest are enough.
    this.shotsReceived = [...this.shotsReceived, ...snapshot.shots].slice(-QUEUED_MOST);
    // A public event's, an encounter's and a Breach's beats are the zone's; a revive, a checkpoint and a fall back are
    // the fight's.
    const fights = (kind: number) => kind >= EVENT.revived && kind <= EVENT.fellBack;
    const isPublic = (event: FightEvent) => event.kind >= EVENT.publicBegun && !fights(event.kind);
    this.foresight.expire(this.roomTick);
    const told = snapshot.events
      .filter((event) => !isPublic(event))
      .map((event) => this.foresight.felt(event, this.player));
    this.events = [...this.events, ...told].slice(-QUEUED_MOST);
    this.publicEvents = [...this.publicEvents, ...snapshot.events.filter(isPublic)].slice(-QUEUED_MOST);
    this.publicWord = snapshot.public ?? null;
    this.arrivals = snapshot.arrivals ?? [];
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

  /** Whether the room holds: one lost, or rejoining, leaves nothing of its public event on the screen. */
  private get holds(): boolean {
    return !this.link.rejoining && this.link.lost === null;
  }

  /** The zone's public event as the room last sent it, held or not: what it says of its foes still stands. */
  get publicHeld(): PublicEvent | null {
    return this.publicWord;
  }

  /** The zone's public event as the room last sent it, while the room holds. */
  get public(): PublicEvent | null {
    return this.holds ? this.publicWord : null;
  }

  /** The public events' events since the page last asked, handed over once; none while the room does not hold. */
  takePublicEvents(): FightEvent[] {
    const events = this.publicEvents;
    this.publicEvents = [];
    return this.holds ? events : [];
  }

  /** The player's own hits foreseen since the page last asked, handed over once (`Foresight`). */
  takeForeseen(): FightEvent[] {
    return this.foresight.take();
  }

  /** The events since the page last asked, handed over once. */
  takeEvents(): FightEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }
}
