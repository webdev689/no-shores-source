// A zone's public events as the page plays them, a frame at a time: the room's event and its beats turned into what
// the player sees and hears. The banner, the compass's places and the stores' bars go to the fight's display; the
// ring at the ground's edge and the light pillars over the shards on the ground go with the fight's marks; the props
// (the fissure, the growth, the stores, the banners, the shards, the chests) go to the event props' drawer, each
// carried shard at its carrier's off hand; the beats' sounds go to the world's sounds, their stings to the music. A
// Breach's gate in the zone, or its run, is played beside them (`breachView.ts`).
import { type ChestLike, eventProps, type EventProp, MOTION, StateClock } from '../city/eventProps.ts';
import { EVENT } from '../combat/cues.ts';
import { markLine } from '../combat/drops.ts';
import { sealWave } from '../combat/latticeLooks.ts';
import { markRing } from '../combat/marks.ts';
import type { BannerBeat, PublicShown } from '../combat/publicBanner.ts';
import type { HeardSound } from '../combat/worldSounds.ts';
import { ASKS, DROPPED, type GearAsk, type GearDrop } from '../network/gearMessages.ts';
import type { FightEvent } from '../network/messages.ts';
import {
  HEROIC,
  MARK,
  PUBLIC_KIND,
  PUBLIC_PHASE,
  type PublicEvent,
  type PublicMark,
} from '../network/publicMessages.ts';
import { CHEST_LIES_S, bannerOf, chestQuestOf, compassOf, elsewhereOf, questOf, ringOf } from './publicLaw.ts';
import { type Moments, PublicMoments } from './publicMoments.ts';
import { SpireCourse } from './fissureSpires.ts';
import type { DungeonLayout } from './dungeonLayout.ts';
import { EncounterCues, type EncounterHeard } from './encounterCues.ts';
import {
  encounterBanner,
  encounterBeat,
  encounterCall,
  encounterMarks,
  encounterPlaces,
  foulOf,
} from './encounterLaw.ts';
import { type EncounterSeen, SEAL_STATE } from '../network/encounterMessages.ts';
import type { Block } from '../rules/movementRules.ts';
import type { Shot } from './camera.ts';
import type { Quest } from './tasks.ts';
import { chime as rarityChime, play } from './uiSounds.ts';
import { type BreachOn, type BreachParts, BreachView, withBreach } from './breachView.ts';
import type { StandingAgain } from './footRevive.ts';
import type { Use } from './footGear.ts';

type Point = readonly [number, number, number];

/** The ring at the ground's edge: its width, metres, the arcs it is laid in (each on the ground under its middle),
 *  its colour and how far it breathes, and how often (seconds) the land under it is read again. */
const RING = {
  widthM: 0.35,
  arcs: 72,
  colour: [0.92, 0.7, 0.3] as const,
  alpha: 0.42,
  breathe: 0.12,
  breatheRadS: 2.2,
  landS: 5,
} as const;
/** A shard's light pillar: how tall, its colour (the Lattice's red), how strong, the least of it as the shard fades,
 *  and its foot over the shard. */
const PILLAR = { heightM: 7, colour: [1, 0.28, 0.36] as const, strength: 0.9, least: 0.35, liftM: 0.5 } as const;
/** Where a carried shard is held, metres, from the carrier's feet (third person: out to the off hand's side and
 *  before the figure's card, toward the eye, the drawer adding its own height), or from the eye in first person (forward, left, down, low in the view's left). */
const HAND = { left: 0.42, before: 0.3 } as const;
const HAND_FIRST = { forward: 0.55, left: 0.3, down: 0.42 } as const;
/** How near a chest the player stands to open it (crates/room/src/public/chest.rs CHEST_REACH, CHEST_HEIGHT). */
const CHEST_REACH_M = 2.5;
const CHEST_HEIGHT_M = 2;
/** How long a chest asked to open stands with its lid up, seconds: once the room has taken it off the ground, or,
 *  if the room still leaves it lying (it refuses one a step out of reach), until it closes and E may ask again. */
const CHEST_KEPT_S = 6;
/** A gap between frames this long, seconds, is a hidden tab come back: the beats kept meanwhile are not played. */
const STALE_S = 2;
/** The player's own shard taken chimes as a Vestige of this rarity does coming to rest. */
const SHARD_CHIME = 3;
/** The room's ticks a second, and an event's last minute in them. */
const TICKS_PER_SECOND = 60;
const LAST_MINUTE_TICKS = 60 * TICKS_PER_SECOND;
/** The ring's colour once the heroic task is met. */
const RING_HEROIC = [1, 0.48, 0.24] as const;

/** The beats a public event's events make, by their kind. */
const BEATS: Readonly<Record<number, BannerBeat>> = {
  [EVENT.publicBegun]: 'begun',
  [EVENT.publicStage]: 'stage',
  [EVENT.heroicMet]: 'heroic',
  [EVENT.heroicMissed]: 'missed',
  [EVENT.publicWon]: 'won',
  [EVENT.publicFailed]: 'failed',
};
/** The music's moment for a beat: the fight score's cadence as one begins, its victory for heroic met and won, its
 *  defeat for failed. */
const STINGS: Partial<Record<BannerBeat, 'cadence' | 'victory' | 'defeat'>> = {
  begun: 'cadence',
  heroic: 'victory',
  won: 'victory',
  failed: 'defeat',
};

/** Where the bodies that matter to the event stand this frame, as drawn: the player (their number, feet, the way
 *  they face, and the eye with its yaw and pitch in first person), every other player by number with their facing,
 *  and any fighter by number. */
export interface PublicBodies {
  readonly player: number;
  readonly shot: Pick<Shot, 'eye' | 'yaw' | 'pitch'>;
  readonly firstPerson: boolean;
  readonly feet: Point;
  readonly yaw: number;
  readonly others: ReadonlyMap<
    number,
    { readonly x: number; readonly y: number; readonly z: number; readonly facing: number }
  >;
  readonly where: (id: number) => Point | null;
}

/** What a frame of the zone's events gives the page. */
export interface PublicFrame {
  readonly shown: PublicShown | null;
  readonly quest: Quest | null;
  readonly props: EventProp[];
  /** Each sound heard where it happens, at its own pitch where it has one (a Breach's bell's note). */
  readonly sounds: readonly HeardSound[];
  readonly sting: 'cadence' | 'victory' | 'defeat' | null;
  /** The interface's cue for a beat heard by the player alone (played as the frame is worked out): a heroic task
   *  missed, a chest opened, their own shard taken. */
  readonly chime: 'refused' | 'open' | 'shard' | null;
}

/** An Elite Dungeon's layout and its encounters as its room last said, for a frame in it. */
export interface EncounterHere {
  readonly layout: DungeonLayout | null | undefined;
  readonly seen: EncounterSeen | null;
}

/** An Elite Dungeon's frame: its marks laid into `marks`, its banner with the beat it slides in for, the places
 *  the compass marks, its call over the middle of the view, whether the player stands in its foul water, the music's mood (its Court at its peak, its Boss's part by the wards broken, a seal running
 *  tense), the sting a moment plays (a seal broken or a ward won, a cadence as the Boss wakes), and what `cues` hears
 *  of it (a ward rising rings its own). None outside one. */
function encounterFrame(
  { layout, seen }: EncounterHere,
  events: readonly FightEvent[],
  bodies: PublicBodies,
  clock: number,
  marks: number[],
  cues: EncounterCues,
): ({ shown: PublicShown | null; sting: 'cadence' | 'victory' | null } & EncounterHeard) | null {
  const plan = layout?.encounters;
  if (!layout || !plan || !seen) return null;
  const heard = cues.frame(plan, seen, events, { ...bodies, seconds: clock });
  marks.push(...encounterMarks(plan, seen, clock, bodies.where, heard.flash, bodies.shot.eye));
  const banner = encounterBanner(layout, seen, bodies.feet);
  const beat = encounterBeat(events);
  const running = seen.seals.some((seal) => seal.state === SEAL_STATE.running);
  const mood = seen.woken ? 'peak' : running ? 'tension' : null;
  const part = seen.woken ? Math.min(3, seen.wardsBroken + 1) : undefined;
  const places = encounterPlaces(layout, seen);
  const call = encounterCall(seen);
  const foul = foulOf(layout, seen, bodies.feet, events, bodies.player);
  const shown: PublicShown | null = banner && { banner, beat, places, stores: [], mood, part, call, foul };
  const won = events.some((each) => each.kind === EVENT.sealBroken || each.kind === EVENT.wardBroken);
  const rose = events.some((each) => each.kind === EVENT.bossWoke);
  return { ...heard, shown, sting: won ? 'victory' : rose ? 'cadence' : null };
}

/** A point `forward` along and `left` across the way `yaw` looks (x east, y south: yaw 0 looks north). */
function along(from: Point, yaw: number, forward: number, left: number, up = 0): Point {
  const [rightX, rightY] = [Math.cos(yaw), Math.sin(yaw)];
  const [aheadX, aheadY] = [Math.sin(yaw), -Math.cos(yaw)];
  return [from[0] + aheadX * forward - rightX * left, from[1] + aheadY * forward - rightY * left, from[2] + up];
}

/** A shard held at the off hand of a figure at `feet` facing `facing`, seen from `eye`. A figure is a card turned to
 *  the eye, so the shard stands just before the card, on the side of it the off hand shows on: placed at the hand
 *  itself, it would stand behind the card as often as before it, and the figure would hide it. */
function beforeCard(feet: Point, facing: number, eye: Point): Point {
  const [toX, toY] = [eye[0] - feet[0], eye[1] - feet[1]];
  const far = Math.hypot(toX, toY) || 1;
  const [nearX, nearY] = [toX / far, toY / far];
  // The eye's right, looking at the figure; the off hand shows on the side its left lies toward.
  const [rightX, rightY] = [nearY, -nearX];
  const [handX, handY] = [-Math.cos(facing), -Math.sin(facing)];
  const side = handX * rightX + handY * rightY > 0 ? 1 : -1;
  return [
    feet[0] + side * rightX * HAND.left + nearX * HAND.before,
    feet[1] + side * rightY * HAND.left + nearY * HAND.before,
    feet[2],
  ];
}

/**
 * The zone's public events on the page: what each frame shows, the chests the player has, and the E that opens the
 * one in reach.
 */
export class PublicView {
  private readonly zone: string;
  private readonly clock = new StateClock();
  /** The land's height under each arc of the ring, for the ground it was read at and when: read again only for a new
   *  ground, or after RING.landS, in case the land under it had not come in yet. */
  private ringLand: {
    readonly x: number;
    readonly y: number;
    readonly radius: number;
    readonly at: number;
    readonly z: number[];
  } | null = null;
  /** The chests the player asked to open, when, and as they last lay. */
  private readonly opened = new Map<number, { readonly at: number; readonly chest: ChestLike }>();
  /** The last frame's wall time, and whether the room's event was there: with none (its room lost), no chest is shown. */
  private last: number | null = null;
  private present = true;

  /** The page's own moments round the event; the room's word on the next event's start, and when it came, so its
   *  last minute is counted on to the second; the last event's kind, for the chest it leaves. */
  private readonly moments = new PublicMoments();
  private readonly heard = new EncounterCues();
  private nextWord: { readonly ticks: number; readonly at: number } | null = null;
  private lastKind: number = PUBLIC_KIND.none;
  /** What shakes the player's view (0 to 1) as the ground trembles; the course the fissure's spires stand in. */
  private readonly feel: { tremor(trauma: number): void };
  private readonly course: SpireCourse | null;
  /** A Breach's gate in this zone, or its run; none in any other place. */
  private readonly breach: BreachView | null;
  /** The ring's colour this frame, kept between frames so its arcs make none. */
  private readonly ringColour: [number, number, number, number] = [0, 0, 0, 0];
  /** The wall's seconds: a hidden tab and the room's countdowns are told by them, since the frame clock moves at most a
   *  tenth of a second a frame. */
  private readonly now: () => number;

  /** The events of `zone`, shaking `feel`'s view; the fissure's spires stood among the place's `boxes` in each of
   *  `courses` (the page's movement and fight), where given, and a Breach as `breach` makes it; `now` reads the
   *  wall's seconds. */
  constructor(
    zone: string,
    feel: { tremor(trauma: number): void } = { tremor: () => undefined },
    course: {
      boxes: readonly Block[];
      courses: ConstructorParameters<typeof SpireCourse>[1];
      breach?: BreachParts;
    } | null = null,
    now: () => number = () => performance.now() / 1000,
  ) {
    this.zone = zone;
    this.now = now;
    this.feel = feel;
    this.course = course && new SpireCourse(course.boxes, course.courses);
    this.breach = course?.breach ? new BreachView(course.breach) : null;
  }

  /** One frame at `clock` (the page's seconds): the room's `event` and its `events` since the last, the player's
   *  `drops` (their chests among them), the bodies as drawn, the land's height, the marks laid into `marks`, and a
   *  Breach's word where the room gives one. */
  frame(
    word: PublicEvent | null,
    events: readonly FightEvent[],
    drops: readonly GearDrop[],
    bodies: PublicBodies,
    clock: number,
    marks: number[],
    floor: (x: number, y: number) => number,
    {
      quiet = false,
      held = null,
      encounter = null,
      breach = null,
    }: { quiet?: boolean; held?: PublicEvent | null; encounter?: EncounterHere | null; breach?: BreachOn | null } = {},
  ): PublicFrame {
    const wall = this.now();
    const event = this.counted(word, wall);
    this.course?.frame(word, floor);
    if (event && event.kind !== PUBLIC_KIND.none) this.lastKind = event.kind;
    // Back from a hidden tab, the last beat shows; what was heard meanwhile is long over.
    const stale = this.last !== null && wall - this.last > STALE_S;
    this.last = wall;
    this.present = event !== null;
    const chests = this.chests(this.present ? drops : [], clock);
    const moments = this.moments.frame(event, stale ? [] : events, bodies.feet, bodies.where, chests, clock, wall);
    const beat = events.reduce<BannerBeat | null>((last, each) => BEATS[each.kind] ?? last, null) ?? moments.beat;
    const sounds = stale ? [] : [...this.sounds(event, events, bodies, clock), ...moments.sounds];
    // The event's own interface sounds are not played while the game is paused, as the world's are not.
    const loud = !stale && !quiet;
    if (loud && moments.chime !== null) rarityChime(moments.chime);
    if (loud && moments.tick) play('tab');
    if (!stale && moments.tremor > 0) this.feel.tremor(moments.tremor);
    this.lay(event, marks, floor, clock, bodies.shot.eye);
    this.moments.lay(event, moments, chests, bodies.player, bodies.feet, marks, clock, bodies.shot.eye);
    const marksHeld = (event?.marks ?? []).map((mark) => this.held(mark, bodies));
    const age = this.clock.ager(clock);
    // A room lost or rejoining leaves its stores standing, as their walls stand in the page's movement.
    const standing = held && { ...held, marks: held.marks.filter((mark) => mark.kind === MARK.store) };
    const props = eventProps(
      event ? { phase: event.phase, ticksLeft: event.ticksLeft, marks: marksHeld } : standing,
      chests,
      age,
      clock,
      moments.props,
    );
    props.push(...moments.flights);
    // A frame with no event (the room lost a while) forgets nothing: on its return no beat is played again.
    if (event) this.clock.done(true);
    const ownShard = events.some((each) => each.kind === EVENT.shardTaken && each.striker === bodies.player);
    const setBack = events.some((each) => each.kind === EVENT.runeWrong || each.kind === EVENT.relicDrained);
    const chime = !loud
      ? null
      : events.some((each) => each.kind === EVENT.heroicMissed) || setBack
        ? 'refused'
        : events.some((each) => each.kind === EVENT.chestOpened && each.striker === bodies.player)
          ? 'open'
          : ownShard
            ? 'shard'
            : null;
    if (chime === 'shard') rarityChime(SHARD_CHIME);
    else if (chime) play(chime);
    const raiding = event?.kind === PUBLIC_KIND.raid && event.phase === PUBLIC_PHASE.running;
    const stores = raiding
      ? event.marks
          .filter((mark) => mark.kind === MARK.store)
          .map((mark) => ({ at: mark.at, share: mark.health, struck: moments.struck.has(mark.id) }))
      : [];
    const waiting = chests.filter((chest) => chest.opened === null);
    const shown: PublicShown | null = event && {
      banner: this.bannerOf(event, chests.length > 0, bodies, moments),
      beat,
      places: [
        ...compassOf(event),
        ...waiting.map((chest) => ({ x: chest.at[0], y: chest.at[1], kind: 'chest' as const })),
        ...stores
          .filter((store) => store.struck)
          .map((store) => ({ x: store.at[0], y: store.at[1], kind: 'store' as const })),
      ],
      stores,
      mood: moodOf(event, bodies.feet),
    };
    const left = Math.min(...waiting.map((chest) => moments.chestsLeft.get(chest.id) ?? CHEST_LIES_S));
    const sealed = encounter && encounterFrame(encounter, stale ? [] : events, bodies, clock, marks, this.heard);
    if (loud) sealed?.ui.forEach(play);
    const { feet, where, shot } = bodies;
    const breached = breach && this.breach?.frame(breach, stale ? [] : events, feet, where, clock, marks, shot.eye);
    if (breached) props.push(...breached.props);
    const heard = stale ? [] : [...(sealed?.sounds ?? []), ...(breached?.sounds ?? [])];
    return {
      shown: withBreach(shown ?? sealed?.shown ?? null, breached ?? null),
      quest: questOf(event, this.zone) ?? (waiting.length > 0 ? chestQuestOf(left, this.zone, this.lastKind) : null),
      props,
      sounds: [...sounds, ...heard],
      sting: stale ? null : ((beat && STINGS[beat]) ?? sealed?.sting ?? breached?.sting ?? null),
      chime,
    };
  }

  /** The event with its next one's start counted on from the room's last word, to the second at `wall` (seconds): the
   *  room tells it to the minute. */
  private counted(event: PublicEvent | null, wall: number): PublicEvent | null {
    if (!event) return null;
    if (this.nextWord?.ticks !== event.nextTicks) this.nextWord = { ticks: event.nextTicks, at: wall };
    const gone = Math.round((wall - this.nextWord.at) * TICKS_PER_SECOND);
    return gone > 0 ? { ...event, nextTicks: Math.max(0, event.nextTicks - gone) } : event;
  }

  /** The banner, as the law words it, with the page's own lines: the heroic chance's call as it opens, a carried
   *  shard's errand, a store under attack, and what runs elsewhere on the island between events. */
  private bannerOf(event: PublicEvent, hasChest: boolean, bodies: PublicBodies, moments: Moments) {
    const banner = bannerOf(event, this.zone, hasChest, [bodies.feet[0], bodies.feet[1]]);
    if (!banner) return null;
    const carrying = event.marks.some((mark) => mark.kind === MARK.carried && mark.id === bodies.player);
    const objective = carrying
      ? 'Carrying a shard: take it to the fissure'
      : moments.struck.size > 0
        ? `Store under attack · ${banner.objective}`
        : banner.objective;
    const heroic = banner.heroic && moments.call ? { ...banner.heroic, text: moments.call } : banner.heroic;
    const elsewhere = banner.tone === 'next' ? elsewhereOf(event, this.zone) : '';
    return { ...banner, objective, heroic, elsewhere };
  }

  /** How the player stands again if they fall where they stand, where a Breach's room says (`breachFall`). */
  get fall(): StandingAgain | null {
    return this.breach?.fall() ?? null;
  }

  /** What E does at the player's feet before a fallen ally's revive (`BreachView.urgent`), and whom a revive may stand
   *  where a Breach's rules say (`BreachView.mayRevive`). */
  urgent(feet: Point, ask: (asked: GearAsk) => void): Use | null {
    return this.breach?.urgent(feet, ask) ?? null;
  }
  readonly mayRevive = (fallen: number): boolean => this.breach?.mayRevive(fallen) ?? true;

  /** What E does at the player's feet: opens their chest in reach not yet asked, if one is, else what it does in a
   *  Breach. */
  use(drops: readonly GearDrop[], feet: Point, ask: (asked: GearAsk) => void, clock: number) {
    const breach = this.breach?.use(feet, ask) ?? null;
    if (!this.present) return breach;
    const chest = drops.find(
      (drop) =>
        drop.kind === DROPPED.chest &&
        drop.flying === 0 &&
        !this.opened.has(drop.id) &&
        Math.hypot(drop.at[0] - feet[0], drop.at[1] - feet[1]) <= CHEST_REACH_M &&
        Math.abs(drop.at[2] - feet[2]) <= CHEST_HEIGHT_M,
    );
    if (!chest) return breach;
    return {
      words: chest.tier >= 3 ? 'Open the heroic chest' : 'Open the chest',
      run: () => {
        if (this.opened.has(chest.id)) return;
        this.opened.set(chest.id, { at: clock, chest: { id: chest.id, at: chest.at, tier: chest.tier, opened: 0 } });
        ask({ kind: ASKS.openChest, item: chest.id });
      },
    };
  }

  /** The chests to draw: each lying for the player, its lid swinging from when they asked to open it; one asked
   *  stands open CHEST_KEPT_S, lying or taken off the ground, and one the room still leaves lying then (refused)
   *  closes again. */
  private chests(drops: readonly GearDrop[], clock: number): ChestLike[] {
    for (const [id, { at }] of this.opened) if (clock - at > CHEST_KEPT_S) this.opened.delete(id);
    const lying = drops.filter((drop) => drop.kind === DROPPED.chest);
    const shown: ChestLike[] = lying.map((drop) => {
      const opened = this.opened.get(drop.id);
      return { id: drop.id, at: drop.at, tier: drop.tier, opened: opened ? clock - opened.at : null };
    });
    for (const [id, { at, chest }] of this.opened)
      if (!lying.some((drop) => drop.id === id)) shown.push({ ...chest, opened: clock - at });
    return shown;
  }

  /** A carried shard held at its carrier's off hand as drawn (the drawer lifts it to the hand's height); first
   *  person, the player's own low in the view's left. Every other mark as the room placed it. */
  private held(mark: PublicMark, bodies: PublicBodies): PublicMark {
    if (mark.kind !== MARK.carried) return mark;
    const lift = MOTION.handM;
    if (mark.id === bodies.player) {
      const first = bodies.shot;
      if (bodies.firstPerson) {
        const reach = HAND_FIRST.forward * Math.cos(first.pitch);
        return { ...mark, at: along(first.eye, first.yaw, reach, HAND_FIRST.left, -HAND_FIRST.down - lift) };
      }
      return { ...mark, at: beforeCard(bodies.feet, bodies.yaw, bodies.shot.eye) };
    }
    const other = bodies.others.get(mark.id);
    return other ? { ...mark, at: beforeCard([other.x, other.y, other.z], other.facing, bodies.shot.eye) } : mark;
  }

  /** The ring at the running event's edge, laid on the land arc by arc, breathing; a pillar of light over every shard
   *  on the ground, fading with it. */
  private lay(
    event: PublicEvent | null,
    marks: number[],
    floor: (x: number, y: number) => number,
    clock: number,
    eye: Point,
  ): void {
    const ring = ringOf(event);
    if (ring) {
      const [x, y] = ring.at;
      const alpha = RING.alpha * (1 + RING.breathe * Math.sin(clock * RING.breatheRadS));
      const step = (2 * Math.PI) / RING.arcs;
      const land = this.ringLand;
      if (!land || land.x !== x || land.y !== y || land.radius !== ring.radius || clock - land.at > RING.landS) {
        const z = Array.from({ length: RING.arcs }, (_unused, arc) => {
          const middle = (arc + 0.5) * step;
          return floor(x + Math.sin(middle) * ring.radius, y - Math.cos(middle) * ring.radius);
        });
        this.ringLand = { x, y, radius: ring.radius, at: clock, z };
      }
      const under = this.ringLand?.z ?? [];
      const colour = this.ringColour;
      [colour[0], colour[1], colour[2]] = event?.heroic === HEROIC.met ? RING_HEROIC : RING.colour;
      colour[3] = alpha;
      for (let arc = 0; arc < RING.arcs; arc += 1) {
        const z = under[arc] ?? 0;
        markRing(marks, [x, y, z], ring.radius - RING.widthM, ring.radius, colour, [arc * step, (arc + 1) * step]);
      }
    }
    for (const mark of event?.marks ?? []) {
      if (mark.kind !== MARK.shard) continue;
      const root: Point = [mark.at[0], mark.at[1], mark.at[2] + PILLAR.liftM];
      const strength = PILLAR.strength * Math.min(1, PILLAR.least + mark.health);
      markLine(marks, root, PILLAR.heightM, PILLAR.colour, strength, clock, eye);
    }
  }

  /** Where each beat is heard, from the world's own sounds: the ground splitting, the Tithe sighted, a shard taken
   *  and set, the growth or the tithe-taker broken, the seal's burst (and its death wave), a store plundered, a chest
   *  opened. */
  private sounds(
    event: PublicEvent | null,
    events: readonly FightEvent[],
    bodies: PublicBodies,
    clock: number,
  ): { cue: string; at: Point }[] {
    if (!event) return [];
    const heard: { cue: string; at: Point }[] = [];
    const markOf = (kind: number) => event.marks.find((mark) => mark.kind === kind)?.at ?? null;
    const fissure = markOf(MARK.fissure) ?? event.ground;
    const fissureEvent = event.kind === PUBLIC_KIND.fissure;
    for (const each of events) {
      const placeOf = (id: number) => bodies.where(id) ?? event.ground;
      switch (each.kind) {
        case EVENT.publicBegun:
          heard.push({ cue: fissureEvent ? 'amb.ice.crack' : 'foe.alert', at: fissureEvent ? fissure : event.ground });
          break;
        case EVENT.publicStage:
          // The Fissure's stage is the ground splitting again, and the Warden climbing out with a crash; the raid's, the
          // Tithe sighted.
          if (!fissureEvent) heard.push({ cue: 'foe.alert', at: event.ground });
          else
            heard.push(
              { cue: 'amb.ice.crack', at: fissure },
              ...(event.stage >= 2 ? [{ cue: 'story.crash', at: fissure }] : []),
            );
          break;
        case EVENT.shardTaken:
          heard.push({ cue: 'element.cosmic', at: placeOf(each.striker) });
          break;
        case EVENT.shardSet:
          heard.push({ cue: 'finish.cosmic', at: fissure });
          break;
        case EVENT.heroicMet: {
          const target = event.marks.find(
            (mark) => (mark.kind === MARK.growth || mark.kind === MARK.titheTaker) && mark.id === each.defender,
          );
          heard.push({ cue: fissureEvent ? 'shield.break' : 'kill', at: target?.at ?? placeOf(each.defender) });
          break;
        }
        case EVENT.publicWon:
          if (fissureEvent) {
            heard.push({ cue: 'story.crash', at: fissure });
            sealWave(fissure, clock);
          }
          break;
        case EVENT.publicFailed:
          if (fissureEvent) heard.push({ cue: 'amb.ice.crack', at: fissure });
          break;
        case EVENT.storePlundered: {
          const store = event.marks.find((mark) => mark.kind === MARK.store && mark.id === each.defender);
          heard.push({ cue: 'sea.ship.break', at: store?.at ?? event.ground });
          break;
        }
        case EVENT.chestOpened:
          heard.push({ cue: 'ship.ready', at: placeOf(each.striker) });
          break;
        default:
      }
    }
    return heard;
  }
}

/** The least mood a running event holds a player on its ground to: tension, and the peak in its last minute and
 *  once its heroic task is met; none off it, or between events. */
function moodOf(event: PublicEvent, feet: Point): 'tension' | 'peak' | null {
  if (event.kind === PUBLIC_KIND.none || event.phase !== PUBLIC_PHASE.running) return null;
  if (Math.hypot(feet[0] - event.ground[0], feet[1] - event.ground[1]) > event.radius) return null;
  return event.ticksLeft <= LAST_MINUTE_TICKS || event.heroic === HEROIC.met ? 'peak' : 'tension';
}
