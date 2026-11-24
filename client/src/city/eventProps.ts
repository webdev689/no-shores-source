// What the public events' props stand as on the page: each a module (tools/modules: the Fissure's, the Grey Tithe's,
// the chests) drawn at its place, turned, scaled, risen out of the ground as far as it has come, its lid swung and its
// crystal glowing. The props are worked out each frame from the event the room sends (its marks) and the player's
// chests, and drawn by EventPropsDraw; their crystal also lights the night round them.
import type { LampPlace } from '../sky/lamps.ts';
import { CRYSTAL_LAMP } from './crystal.ts';
import { moduleNumber, moduleParts, moduleSocket } from './modules.ts';

type Point = readonly [number, number, number];

/** The event props' modules by name (tools/modules/catalogue.py EVENTS). */
export const PROP_MODULES = [
  'lattice-fissure',
  'lattice-fissure-sealed',
  'lattice-growth',
  'lattice-shard',
  'tithe-stores-a',
  'tithe-stores-b',
  'tithe-stores-c',
  'tithe-stores-plundered',
  'tithe-banner',
  'event-chest',
  'event-chest-lid',
  'event-chest-heroic',
  'event-chest-heroic-lid',
] as const;
export type PropModule = (typeof PROP_MODULES)[number];

/** A module that opens rather than rises: its rise widens it from a line and deepens it, and the land is opened
 *  along its mouth. */
export const OPENS: ReadonlySet<PropModule> = new Set(['lattice-fissure']);

/** One prop drawn: its module, the middle of its foot (world metres east, south, up), its turn clockwise from north,
 *  its scale, how far it has risen out of the ground (0 under it, 1 standing: one that opens, opened), how far it is
 *  swung up about its own x at its origin (a lid about its hinge, radians) and its crystal's glow (1 as built). */
export type EventProp = {
  readonly module: PropModule;
  readonly at: Point;
  readonly turn: number;
  readonly scale: number;
  readonly rise: number;
  readonly lid: number;
  readonly glow: number;
};

/** A mark of the running event as the room sends it (protocol PublicMark): what it is, its id, where it stands, its
 *  health (0 to 1: a store's, the growth's; the fissure's, how far open; a shard's, its life left) and its state. */
export type PublicMarkLike = {
  readonly kind: number;
  readonly id: number;
  readonly at: Point;
  readonly health: number;
  readonly state: number;
};

/** The event as the room sends it, as far as the props need it: its phase and its marks. */
export type PublicEventLike = {
  readonly phase: number;
  /** Its countdown while it runs, its result's time left once over (the room's ticks). */
  readonly ticksLeft: number;
  readonly marks: readonly PublicMarkLike[];
};

/** The room's ticks a second, an event's countdown and how long its result shows (crates/room/src/public/mod.rs). */
const TICKS = { perSecond: 60, countdown: 8 * 3_600, result: 12 * 60 } as const;

/** A chest of the player's at the event's ground: its tier (1 to 4) and, once opened, the seconds since. */
export type ChestLike = {
  readonly id: number;
  readonly at: Point;
  readonly tier: number;
  readonly opened: number | null;
};

/** The marks' kinds and states (protocol PublicMark), and the event's phases. */
export const MARK = { fissure: 1, growth: 2, store: 3, shard: 4, carried: 5, banner: 7 } as const;
export const GROWTH = { rising: 1, standing: 2, sinking: 3, broken: 4 } as const;
export const STORE = { whole: 1, plundered: 2 } as const;
export const PHASE = { waiting: 0, running: 1, won: 2, failed: 3 } as const;

/** How the props move, seconds and radians: the growth rising out of the ground, sinking back and shattering; a
 *  banner driven in; a chest's lid swinging open to the angle it rests at; a shard on the ground turning, bobbing
 *  and blinking as it fades, and how much of its life is left when it begins to blink; a carried shard held at the
 *  hand, this high over the carrier's feet, at this scale; the fissure's glow breathing; the fissure tearing open,
 *  never narrower than its least while the event runs (its Warden still comes out of it), and shutting as its scar
 *  rises. */
export const MOTION = {
  growthRiseS: 2.4,
  growthSinkS: 3,
  growthShatterS: 0.5,
  bannerPlantS: 0.7,
  lidOpenS: 0.6,
  lidOpenRad: 1.95,
  shardTurnRadS: 1.1,
  shardBobM: 0.08,
  shardBlinkBelow: 0.3,
  handM: 0.95,
  carriedScale: 0.8,
  breathe: 0.15,
  fissureOpenS: 3,
  fissureLeastOpen: 0.3,
  fissureShutS: 2.5,
} as const;

/** The lamps the crystal lights at night: along the fissure (its own x, metres), over the growth, at a shard and a
 *  heroic chest, each's reach in metres, short so the red stays on the ground by the crystal and never runs off along
 *  a pale way; a chest opened spills a warm light. */
const LAMPS = {
  fissureAlong: [-4.5, -1.5, 1.5, 4.5],
  fissureReachM: 8,
  growthReachM: 10,
  shardReachM: 5,
  chestReachM: 5,
} as const;
const CHEST_LIGHT = [0.6, 0.42, 0.2] as const;
/** A raid's banner's lamp: warm, this far under its pole's top (the module's part), lighting this far. */
const BANNER_LAMP = { light: [0.5, 0.34, 0.16] as const, underTopM: 0.3, reachM: 6 } as const;
const BANNER_TOP_M = moduleParts(moduleNumber('tithe-banner'))[0]?.[5] ?? 5.4;

/** What the page's own moments do to the props: a flare of the fissure's glow (0 none), the fissure's width as the
 *  page eases it (null: as the room sends it), and how far a raid won has toppled its banners (0 to 1). */
export type PropMoments = { readonly flare: number; readonly open: number | null; readonly topple: number };

/** Seconds a mark has been in its state, by its kind, id and state: StateClock keeps them for the page. */
export type Ager = (kind: number, id: number, state: number) => number;

/** When each mark came into the state it is in, so a prop's motion runs from there. The marks already there on the
 *  first frame the room's event is seen came before the page did: they stand as long done, so no beat is played
 *  again. A mark not seen for a frame is forgotten. */
export class StateClock {
  /** Keyed by kind and id as one number (kind × 2³²+ id), so a frame makes no key strings. */
  private readonly since = new Map<number, { state: number; at: number }>();
  private readonly seen = new Set<number>();
  private begun = false;

  /** The clock for one frame at `seconds`: call `age` for each mark drawn, then `done`. */
  ager(seconds: number): Ager {
    return (kind, id, state) => {
      const key = kind * 2 ** 32 + id;
      this.seen.add(key);
      const known = this.since.get(key);
      if (known?.state === state) return seconds - known.at;
      this.since.set(key, { state, at: this.begun ? seconds : -Infinity });
      return this.begun ? 0 : Infinity;
    };
  }

  /** Forgets the marks this frame did not ask after; `seen` says the room's event was there (by default, any mark). */
  done(seen = this.seen.size > 0): void {
    for (const key of this.since.keys()) if (!this.seen.has(key)) this.since.delete(key);
    this.begun ||= seen;
    this.seen.clear();
  }
}

/** A turn of its own for a prop the room places without one, steady from its id. */
export function turnOf(id: number): number {
  const mixed = Math.imul(id ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  return (mixed / 2 ** 32) * Math.PI * 2;
}

/** A turn brought into one turn, so a float on the GPU keeps its precision however long the page has run. */
const wrapped = (turn: number): number => ((turn % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

const ease = (share: number): number => {
  const clamped = Math.min(1, Math.max(0, share));
  return clamped * clamped * (3 - 2 * clamped);
};

/** A point of a prop's own frame (x east, y south, z up) where it stands: turned clockwise from north, as a solid is
 *  (solidMesh.ts solidTurn). */
export function propPoint(prop: Pick<EventProp, 'at' | 'turn' | 'scale'>, local: Point): Point {
  const [cosine, sine] = [Math.cos(prop.turn), Math.sin(prop.turn)];
  const [x, y, z] = [local[0] * prop.scale, local[1] * prop.scale, local[2] * prop.scale];
  return [prop.at[0] + x * cosine - y * sine, prop.at[1] + x * sine + y * cosine, prop.at[2] + z];
}

const prop = (module: PropModule, foot: Point, turn: number, more: Partial<EventProp> = {}): EventProp => ({
  module,
  at: foot,
  turn,
  scale: 1,
  rise: 1,
  lid: 0,
  glow: 1,
  ...more,
});

/** A chest and its lid, the lid at the chest's hinge swung open as far as the seconds since it was opened say. */
function chestProps(chest: ChestLike): EventProp[] {
  const heroic = chest.tier >= 3;
  const [body, lid] = heroic ? (['event-chest-heroic', 'event-chest-heroic-lid'] as const) : PLAIN_CHEST;
  return chestPair(body, lid, chest.at, turnOf(chest.id), chest.opened);
}

const PLAIN_CHEST = ['event-chest', 'event-chest-lid'] as const;

/** A chest's body at its foot turned `turn`, and its lid at its hinge swung open as far as `opened` seconds say. */
function chestPair(body: PropModule, lid: PropModule, foot: Point, turn: number, opened: number | null): EventProp[] {
  const standing = prop(body, foot, turn);
  const swung = opened === null ? 0 : ease(opened / MOTION.lidOpenS) * MOTION.lidOpenRad;
  const hinge = propPoint(standing, moduleSocket(moduleNumber(body), 'hinge'));
  const glow = opened === null ? 0.8 : 1.4;
  return [{ ...standing, glow }, prop(lid, hinge, turn, { lid: swung, glow })];
}

/** A chest a patrol stands (game/finds.ts) as a public event's plain chest and its lid: its front, the module's -y,
 *  the way its place faces, its lid swinging back as the player opens it. */
export function foundChestProps(chest: { at: Point; facing: number; opened: number | null }): EventProp[] {
  return chestPair(PLAIN_CHEST[0], PLAIN_CHEST[1], chest.at, chest.facing, chest.opened);
}

/**
 * The props of the event the room sends and the player's chests, this frame: the fissure as far open as it is and,
 * once the event is over, the scar rising as it closes; the growth rising, standing, sinking or shattering; each
 * store whole (one of three stacks, by its id) or plundered; a shard on the ground turning and blinking as it
 * fades, a carried one at its carrier's hand; each banner driven in; each chest with its lid. `age` says how long a
 * mark has been in its state; `seconds` drives what turns and breathes.
 */
export function eventProps(
  event: PublicEventLike | null,
  chests: readonly ChestLike[],
  age: Ager,
  seconds: number,
  moments: PropMoments = { flare: 0, open: null, topple: 0 },
): EventProp[] {
  const props: EventProp[] = [];
  const over = event !== null && (event.phase === PHASE.won || event.phase === PHASE.failed);
  for (const mark of event?.marks ?? []) {
    // The room stands the fissure and the stores square to the grid; the rest take a turn of their own.
    const turn = mark.kind === MARK.fissure || mark.kind === MARK.store ? 0 : turnOf(mark.id);
    const since = age(mark.kind, mark.id, mark.state);
    switch (mark.kind) {
      case MARK.fissure: {
        const breathing = (1 + MOTION.breathe * Math.sin(seconds * 2.1 + mark.id)) * (1 + moments.flare);
        // Timed by the room's own ticks, so it tears open as the event begins, not as a page arrives, at any speed.
        const ticks = (over ? TICKS.result : TICKS.countdown) - (event?.ticksLeft ?? 0);
        const beenS = ticks / TICKS.perSecond;
        if (over) {
          const shut = ease(beenS / MOTION.fissureShutS);
          const open = MOTION.fissureLeastOpen * (1 - shut);
          if (open > 0.01) props.push(prop('lattice-fissure', mark.at, turn, { rise: open, glow: open * breathing }));
          // Sealed, its scar rises; failed, it closes into the plain turf.
          if (event?.phase === PHASE.won)
            props.push(prop('lattice-fissure-sealed', mark.at, turn, { rise: shut, glow: 1 - shut }));
          break;
        }
        const health = moments.open ?? mark.health;
        const open = Math.min(ease(beenS / MOTION.fissureOpenS), Math.max(MOTION.fissureLeastOpen, health));
        if (open > 0.01)
          props.push(prop('lattice-fissure', mark.at, turn, { rise: open, glow: (0.5 + 0.5 * open) * breathing }));
        break;
      }
      case MARK.growth: {
        const rise =
          mark.state === GROWTH.rising
            ? ease(since / MOTION.growthRiseS)
            : mark.state === GROWTH.sinking
              ? 1 - ease(since / MOTION.growthSinkS)
              : mark.state === GROWTH.broken
                ? 1 - ease(since / MOTION.growthShatterS)
                : 1;
        const flare = mark.state === GROWTH.broken ? 2.5 : 0.8 + 0.4 * (1 - mark.health);
        if (rise > 0) props.push(prop('lattice-growth', mark.at, turn, { rise, glow: flare }));
        break;
      }
      case MARK.store: {
        const stacks = ['tithe-stores-a', 'tithe-stores-b', 'tithe-stores-c'] as const;
        const module = mark.state === STORE.plundered ? 'tithe-stores-plundered' : stacks[mark.id % 3];
        props.push(prop(module ?? 'tithe-stores-a', mark.at, turn));
        break;
      }
      case MARK.shard: {
        const fading = mark.health < MOTION.shardBlinkBelow;
        const blink = fading ? 0.5 + 0.5 * Math.sign(Math.sin(seconds * (6 + 10 * (1 - mark.health)))) : 1;
        const bob = MOTION.shardBobM * (1 + Math.sin(seconds * 2.3 + mark.id));
        props.push(
          prop(
            'lattice-shard',
            [mark.at[0], mark.at[1], mark.at[2] + bob],
            wrapped(turn + seconds * MOTION.shardTurnRadS),
            {
              glow: 1.2 * blink,
            },
          ),
        );
        break;
      }
      case MARK.carried:
        props.push(
          prop('lattice-shard', [mark.at[0], mark.at[1], mark.at[2] + MOTION.handM], turn, {
            scale: MOTION.carriedScale,
            glow: 1.3,
          }),
        );
        break;
      case MARK.banner:
        props.push(
          prop('tithe-banner', mark.at, turn, {
            rise: ease(since / MOTION.bannerPlantS),
            lid: ease(moments.topple) * (Math.PI / 2),
          }),
        );
        break;
      default:
    }
  }
  for (const chest of chests) props.push(...chestProps(chest));
  return props;
}

/** The lamps the props light at night: red along the fissure, over the growth and at every shard and heroic chest,
 *  each as strong as it glows and as far as it has risen; warm where a chest stands open. */
export function propLamps(props: readonly EventProp[]): LampPlace[] {
  const lamps: LampPlace[] = [];
  const red = (strength: number) => CRYSTAL_LAMP.map((part) => part * strength) as unknown as Point;
  props.forEach((each, index) => {
    const strength = Math.min(1.5, each.glow * each.rise);
    if (strength <= 0) return;
    const place = (local: Point) => propPoint(each, local);
    const seed = index * 0.618;
    if (each.module === 'lattice-fissure')
      for (const along of LAMPS.fissureAlong)
        lamps.push({ at: place([along, 0, 0.6]), reachM: LAMPS.fissureReachM * each.rise, light: red(strength), seed });
    else if (each.module === 'lattice-growth')
      lamps.push({ at: place([0, 0, 2.5]), reachM: LAMPS.growthReachM, light: red(strength), seed });
    else if (each.module === 'lattice-shard')
      lamps.push({ at: place([0, 0, 0.3]), reachM: LAMPS.shardReachM * each.scale, light: red(strength * 0.7), seed });
    else if (each.module === 'tithe-banner')
      lamps.push({
        at: place([0, 0, BANNER_TOP_M - BANNER_LAMP.underTopM]),
        reachM: BANNER_LAMP.reachM * each.rise,
        light: BANNER_LAMP.light,
        seed,
      });
    else if (each.module === 'event-chest-heroic-lid' && each.lid > 0)
      lamps.push({ at: place([0, 0.3, 0.3]), reachM: LAMPS.chestReachM, light: red(strength * 0.4), seed });
    else if (each.module === 'event-chest-lid' && each.lid > 0)
      lamps.push({
        at: place([0, 0.3, 0.3]),
        reachM: LAMPS.chestReachM * Math.min(1, each.lid),
        light: CHEST_LIGHT,
        seed,
      });
  });
  return lamps;
}
