// A zone's public events as the page plays them, a frame at a time: the room's event and its beats turned into what
// the player sees and hears. The banner, the compass's places and the stores' bars go to the fight's display; the
// ring at the ground's edge and the light pillars over the shards on the ground go with the fight's marks; the props
// (the fissure, the growth, the stores, the banners, the shards, the chests) go to the event props' drawer, each
// carried shard at its carrier's off hand; the beats' sounds go to the world's sounds, their stings to the music.
import { type ChestLike, eventProps, type EventProp, MOTION, StateClock } from '../city/eventProps.ts';
import { EVENT } from '../combat/cues.ts';
import { markLine } from '../combat/drops.ts';
import { sealWave } from '../combat/latticeLooks.ts';
import { markRing } from '../combat/marks.ts';
import type { BannerBeat, PublicShown } from '../combat/publicBanner.ts';
import { ASKS, DROPPED, type GearAsk, type GearDrop } from '../network/gearMessages.ts';
import type { FightEvent } from '../network/messages.ts';
import { MARK, PUBLIC_KIND, PUBLIC_PHASE, type PublicEvent, type PublicMark } from '../network/publicMessages.ts';
import { bannerOf, compassOf, questOf, ringOf } from './publicLaw.ts';
import type { Quest } from './tasks.ts';

type Point = readonly [number, number, number];

/** The ring at the ground's edge: its width, metres, the arcs it is laid in (each on the ground under its middle),
 *  and its colour and how far it breathes. */
const RING = {
  widthM: 0.35,
  arcs: 72,
  colour: [0.92, 0.7, 0.3] as const,
  alpha: 0.42,
  breathe: 0.12,
  breatheRadS: 2.2,
} as const;
/** A shard's light pillar: how tall, its colour (the Lattice's red), how strong, the least of it as the shard fades,
 *  and its foot over the shard. */
const PILLAR = { heightM: 7, colour: [1, 0.28, 0.36] as const, strength: 0.9, least: 0.35, liftM: 0.5 } as const;
/** Where a carried shard is held, metres, from the carrier's feet (third person: out to the off hand, forward, the
 *  drawer adding its own height), or from the eye in first person (forward, left, down, low in the view's left). */
const HAND = { left: 0.32, forward: 0.16 } as const;
const HAND_FIRST = { forward: 0.55, left: 0.3, down: 0.42 } as const;
/** How near a chest the player stands to open it (crates/room/src/public/chest.rs CHEST_REACH, CHEST_HEIGHT). */
const CHEST_REACH_M = 2.5;
const CHEST_HEIGHT_M = 2;
/** How long an opened chest stands, its lid up, after the room has taken it off the ground, seconds. */
const CHEST_KEPT_S = 6;
/** How long an asked chest waits on the room before E may ask again: the room refuses one a step out of reach. */
const CHEST_RETRY_S = 1.5;

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
  readonly eye: Point;
  readonly feet: Point;
  readonly yaw: number;
  readonly firstPerson: { readonly eye: Point; readonly yaw: number; readonly pitch: number } | null;
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
  readonly sounds: readonly { readonly cue: string; readonly at: Point }[];
  readonly sting: 'cadence' | 'victory' | 'defeat' | null;
  /** The interface's cue for a beat heard by the player alone: a heroic task missed, their own shard taken. */
  readonly chime: 'refused' | 'open' | 'shard' | null;
}

/** A point `forward` along and `left` across the way `yaw` looks (x east, y south: yaw 0 looks north). */
function along(from: Point, yaw: number, forward: number, left: number, up = 0): Point {
  const [rightX, rightY] = [Math.cos(yaw), Math.sin(yaw)];
  const [aheadX, aheadY] = [Math.sin(yaw), -Math.cos(yaw)];
  return [from[0] + aheadX * forward - rightX * left, from[1] + aheadY * forward - rightY * left, from[2] + up];
}

/**
 * The zone's public events on the page: what each frame shows, the chests the player has, and the E that opens the
 * one in reach.
 */
export class PublicView {
  private readonly zone: string;
  private readonly clock = new StateClock();
  /** The chests the player asked to open, when, and as they last lay. */
  private readonly opened = new Map<number, { readonly at: number; readonly chest: ChestLike }>();

  constructor(zone: string) {
    this.zone = zone;
  }

  /** One frame at `clock` (the page's seconds): the room's `event` and its `events` since the last, the player's
   *  `drops` (their chests among them), the bodies as drawn, the land's height, and the marks laid into `marks`. */
  frame(
    event: PublicEvent | null,
    events: readonly FightEvent[],
    drops: readonly GearDrop[],
    bodies: PublicBodies,
    clock: number,
    marks: number[],
    floor: (x: number, y: number) => number,
  ): PublicFrame {
    const beat = events.reduce<BannerBeat | null>((last, each) => BEATS[each.kind] ?? last, null);
    const sounds = this.sounds(event, events, bodies, clock);
    this.lay(event, marks, floor, clock, bodies.eye);
    const chests = this.chests(drops, clock);
    const marksHeld = (event?.marks ?? []).map((mark) => this.held(mark, bodies));
    const age = this.clock.ager(clock);
    const props = eventProps(event && { phase: event.phase, marks: marksHeld }, chests, age, clock);
    this.clock.done();
    const ownShard = events.some((each) => each.kind === EVENT.shardTaken && each.striker === bodies.player);
    const chime = events.some((each) => each.kind === EVENT.heroicMissed)
      ? 'refused'
      : events.some((each) => each.kind === EVENT.chestOpened && each.striker === bodies.player)
        ? 'open'
        : ownShard
          ? 'shard'
          : null;
    const raiding = event?.kind === PUBLIC_KIND.raid && event.phase === PUBLIC_PHASE.running;
    const stores = raiding
      ? event.marks.filter((mark) => mark.kind === MARK.store).map((mark) => ({ at: mark.at, share: mark.health }))
      : [];
    const shown: PublicShown | null = event && {
      banner: bannerOf(event, this.zone),
      beat,
      places: compassOf(event),
      stores,
    };
    return {
      shown,
      quest: questOf(event, this.zone),
      props,
      sounds,
      sting: beat ? (STINGS[beat] ?? null) : null,
      chime,
    };
  }

  /** What E does at the player's feet: opens their chest in reach, if one is. */
  use(drops: readonly GearDrop[], feet: Point, ask: (asked: GearAsk) => void, clock: number) {
    const chest = drops.find(
      (drop) =>
        drop.kind === DROPPED.chest &&
        drop.flying === 0 &&
        Math.hypot(drop.at[0] - feet[0], drop.at[1] - feet[1]) <= CHEST_REACH_M &&
        Math.abs(drop.at[2] - feet[2]) <= CHEST_HEIGHT_M,
    );
    if (!chest) return null;
    return {
      words: chest.tier >= 3 ? 'Open the heroic chest' : 'Open the chest',
      run: () => {
        const asked = this.opened.get(chest.id);
        if (asked && clock - asked.at < CHEST_RETRY_S) return;
        this.opened.set(chest.id, { at: clock, chest: { id: chest.id, at: chest.at, tier: chest.tier, opened: 0 } });
        ask({ kind: ASKS.openChest, item: chest.id });
      },
    };
  }

  /** The chests to draw: each lying for the player, its lid swinging from when they opened it; one the room has
   *  taken off the ground once opened stands open a little longer. */
  private chests(drops: readonly GearDrop[], clock: number): ChestLike[] {
    const lying = drops.filter((drop) => drop.kind === DROPPED.chest);
    const shown: ChestLike[] = lying.map((drop) => {
      // One the room still leaves lying a while after it was asked was refused: its lid closes again.
      if (clock - (this.opened.get(drop.id)?.at ?? clock) > CHEST_RETRY_S) this.opened.delete(drop.id);
      const opened = this.opened.get(drop.id);
      return { id: drop.id, at: drop.at, tier: drop.tier, opened: opened ? clock - opened.at : null };
    });
    for (const [id, { at, chest }] of this.opened) {
      if (clock - at > CHEST_KEPT_S && !lying.some((drop) => drop.id === id)) this.opened.delete(id);
      else if (!lying.some((drop) => drop.id === id)) shown.push({ ...chest, opened: clock - at });
    }
    return shown;
  }

  /** A carried shard held at its carrier's off hand as drawn (the drawer lifts it to the hand's height); first
   *  person, the player's own low in the view's left. Every other mark as the room placed it. */
  private held(mark: PublicMark, bodies: PublicBodies): PublicMark {
    if (mark.kind !== MARK.carried) return mark;
    const lift = MOTION.handM;
    if (mark.id === bodies.player) {
      const first = bodies.firstPerson;
      if (first) {
        const reach = HAND_FIRST.forward * Math.cos(first.pitch);
        return { ...mark, at: along(first.eye, first.yaw, reach, HAND_FIRST.left, -HAND_FIRST.down - lift) };
      }
      return { ...mark, at: along(bodies.feet, bodies.yaw, HAND.forward, HAND.left) };
    }
    const other = bodies.others.get(mark.id);
    return other ? { ...mark, at: along([other.x, other.y, other.z], other.facing, HAND.forward, HAND.left) } : mark;
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
      for (let arc = 0; arc < RING.arcs; arc += 1) {
        const middle = (arc + 0.5) * step;
        const z = floor(x + Math.sin(middle) * ring.radius, y - Math.cos(middle) * ring.radius);
        markRing(
          marks,
          [x, y, z],
          ring.radius - RING.widthM,
          ring.radius,
          [...RING.colour, alpha],
          [arc * step, (arc + 1) * step],
        );
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
          heard.push({ cue: fissureEvent ? 'story.deep' : 'foe.alert', at: fissureEvent ? fissure : event.ground });
          break;
        case EVENT.publicStage:
          heard.push({ cue: 'foe.alert', at: event.ground });
          break;
        case EVENT.shardTaken:
          heard.push({ cue: 'element.cosmic', at: placeOf(each.striker) });
          break;
        case EVENT.shardSet:
          heard.push({ cue: 'finish.cosmic', at: fissure });
          break;
        case EVENT.heroicMet:
          heard.push({ cue: fissureEvent ? 'shield.break' : 'kill', at: placeOf(each.defender) });
          break;
        case EVENT.publicWon:
          if (fissureEvent) {
            heard.push({ cue: 'story.crash', at: fissure });
            sealWave(fissure, clock);
          }
          break;
        case EVENT.publicFailed:
          if (fissureEvent) heard.push({ cue: 'story.deep', at: fissure });
          break;
        case EVENT.storePlundered: {
          const store = event.marks.find((mark) => mark.kind === MARK.store && mark.id === each.defender);
          heard.push({ cue: 'sea.ship.break', at: store?.at ?? event.ground });
          break;
        }
        case EVENT.chestOpened:
          heard.push({ cue: 'story.creak', at: placeOf(each.striker) });
          break;
        default:
      }
    }
    return heard;
  }
}
