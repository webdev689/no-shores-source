// How a sea fight looks, sounds and jars round its ships, from the fight's events and what its view already says of
// them (their hurts, fires, guns and states): each event becomes its puffs (`Effects`), its harm on the ship it struck
// (`ShipHarm`, on her rig), its flotsam, its sound and, on the player's own ship, a jar of the eye. DFO's moments
// (navalFeel.js) are here too: a ball going by her close whistles, a fall alongside throws its water over her rail, a
// burning ship going down may blow her magazine, and her battered hull smokes. The World Editor's fights and the
// sea's draw through it.
import type { RoomEvent } from '../rules/feelEvents.ts';
import type { FightEvent, FightVessel, Point } from '../rules/fightRules.ts';
import { DRESSES, type ShipSide } from './dress.ts';
import { BURN_LIGHT, Effects, type Mark, type Splash } from './effects.ts';
import { Flotsam } from './flotsam.ts';
import { hullPaint, hullWaterline, SLOOP_HULL } from './hulls.ts';
import { type SailRig, windOff } from './sails.ts';
import { shipAxes } from './shipAxes.ts';
import { KICKS } from './shake.ts';

/** The fight's events as the feel reads them: the World Editor's, a ball's hit naming where on her it struck in her
 *  own frame and what it struck (from the room's `Hit` told with it), and the room's own. */
export type FeelEvent =
  | Exclude<FightEvent, { kind: 'hit' } | { kind: 'splash' }>
  | {
      readonly kind: 'hit';
      readonly ship: number;
      readonly by?: number;
      readonly zone?: 'hull' | 'holed' | 'rig';
      readonly point?: Point;
      readonly at?: Point;
      readonly part?: 'hull' | 'sail' | 'rig';
    }
  | { readonly kind: 'splash'; readonly point?: Point; readonly at?: readonly number[] }
  | TickTold<RoomEvent>;

/** A room's event as the feel reads it: the sea's and the fleet's tell its tick, the World Editor's JSON none. */
type TickTold<Event> = Event extends unknown ? Omit<Event, 'tick'> & { readonly tick?: number } : never;

export { feelOf, type RoomEvent } from '../rules/feelEvents.ts';

/** What the feel reads of a ship's numbers in the fight's view. */
export type FeelVessel = Pick<FightVessel, 'fires' | 'sail' | 'max_sail'> & {
  readonly ship: Iterable<number> & ArrayLike<number>;
  readonly pose: Iterable<number> & ArrayLike<number>;
  readonly state: string;
  /** Her hull's hurt, her guns' reload (port, then starboard, seconds left) and a captain's sides run out, where the
   *  view says them. */
  readonly hull?: number;
  readonly max_hull?: number;
  readonly guns?: { readonly left: readonly [number, number] };
  readonly run_out?: readonly string[];
};

/** A ship in the fight as the feel sees her: her numbers in its view, her rig (her harm is on it; null while her
 *  model has not come), her hull and her side. */
export interface FeelShip {
  readonly vessel: FeelVessel;
  readonly rig: SailRig | null;
  readonly hull: number;
  readonly side: ShipSide;
}

/** A sound the fight calls for, where (window metres), and how loud of its own level; or, with `kick`, a jar of the
 *  eye on the player's own ship, of that magnitude. */
export interface Cue {
  readonly cue: string;
  readonly at: readonly [number, number, number];
  readonly gain?: number;
  readonly kick?: number;
}

/** The side of her a blow came from. */
export type BlowSide = 'bow' | 'stern' | 'port' | 'starboard';

type Window = (point: Point) => readonly [number, number, number];

/** A hole's dark middle and its rim of raw timber splintered out. */
const HOLE = [0.05, 0.04, 0.03] as const;
const RAW_TIMBER = [0.66, 0.5, 0.32] as const;
/** A sail is struck where a ball passed this close to one of its cells' middles, metres. */
const SAIL_REACH_M = 1.5;
/** A fire's flames rise from this far over the Sloop's waterline (metres): just over her deck. */
const SLOOP_DECK_M = 2.4;
/** The water foams where a ship went down this long after she is under, seconds. */
const FOAM_AFTER_S = 8;
/** DFO's moments (navalFeel.js, navalShots.js): a ball whistles going by within this of her hull; a fall within this
 *  throws its water aboard; the side a blow came from is told this long (seconds); a burning ship going down blows
 *  her magazine at this share, this long into her going down (seconds, from and to). */
export const NEAR_MISS_M = 8;
export const NEAR_SPLASH_M = 6;
export const BLOW_S = 1.4;
export const MAGAZINE_CHANCE = 0.55;
export const MAGAZINE_DELAY = [1.5, 4.5] as const;
/** Her hull under this share, she smokes along her deck, over this share of her length each way from amidships. */
export const SMOKE_FROM = 0.6;
const SMOKE_SPAN = 0.6;
/** Her last volley's tally is shown this long once its last ball is down, seconds. */
export const TALLY_S = 4;
/** A ball last frame is the same ball this frame within this, metres. */
const SAME_BALL_M = 40;

/** A share in [0, 1) from `seed` and `salt`: a ship's own draw, the same on every machine that knows her. */
export function seedShare(seed: number, salt: number): number {
  let hash = Math.imul((seed >>> 0) ^ salt, 0x9e3779b1) >>> 0;
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x85ebca6b) >>> 0;
  hash ^= hash >>> 13;
  return (hash >>> 0) / 4_294_967_296;
}

/** Whether a ship of `seed` going down afire blows her magazine, and how long after (seconds); null if she does not. */
export function magazineOf(seed: number): number | null {
  if (seedShare(seed, 0x6a91) >= MAGAZINE_CHANCE) return null;
  return MAGAZINE_DELAY[0] + seedShare(seed, 0x2b7) * (MAGAZINE_DELAY[1] - MAGAZINE_DELAY[0]);
}

/** How high over her waterline a hull's deck stands, metres: the Sloop's, raised as her guns' line is. */
export function deckOverM(hull: number): number {
  return SLOOP_DECK_M + hullPaint(hull).atM - hullPaint(SLOOP_HULL).atM;
}

/** Her middle (east, south, her heave) and her frame's axes, as her numbers say she lies. */
function lying(vessel: FeelVessel) {
  const [x = 0, y = 0, heading = 0] = vessel.ship;
  const [heave = 0, pitch = 0, roll = 0] = vessel.pose;
  return { middle: [x, y, heave] as Point, axes: shipAxes(heading, pitch, roll), heading };
}

/** A point of her frame as true metres off her middle in the world. */
function offOf(axes: ReturnType<typeof shipAxes>, spot: Point): Point {
  return [0, 1, 2].map(
    (axis) => spot[0] * (axes[0][axis] ?? 0) + spot[1] * (axes[1][axis] ?? 0) + spot[2] * (axes[2][axis] ?? 0),
  ) as unknown as Point;
}

/** A world point in her frame: her axes are square to one another, so their transpose turns it back. */
export function frameOf(vessel: FeelVessel, point: Point): Point {
  const { middle, axes } = lying(vessel);
  const off = [point[0] - middle[0], point[1] - middle[1], point[2] - middle[2]];
  return axes.map(
    (axis) => (axis[0] ?? 0) * (off[0] ?? 0) + (axis[1] ?? 0) * (off[1] ?? 0) + (axis[2] ?? 0) * (off[2] ?? 0),
  ) as unknown as Point;
}

export class FightFeel {
  readonly effects: Effects;
  readonly flotsam = new Flotsam();
  private cues: Cue[] = [];
  /** The balls aloft at the last frame, for the size of the splash each makes. */
  private aloft: readonly (readonly [number, number, number, number])[] = [];
  /** Where each ship went down and until when its water foams, by her number. */
  private readonly wentDown = new Map<
    number,
    { readonly at: Point; readonly until: number; readonly radiusM: number }
  >();
  /** The ships going down whose magazine waits, by her number, and when it goes. */
  private readonly magazines = new Map<number, number>();
  /** Every ship told going down, so each is told once. */
  private readonly sinking = new Set<number>();
  /** Her side a blow last came from, and when; and when each side of hers last came ready. */
  private lastBlow: { readonly side: BlowSide; readonly at: number } | null = null;
  private readonly ready: [number | null, number | null] = [null, null];
  /** Her guns' reload and each captain's sides run out at the last frame. */
  private reloads: readonly [number, number] | null = null;
  private readonly runOut = new Map<number, number>();
  /** Her volley while its balls are aloft, and its tally once the last is down. */
  private volley: { balls: number; hits: number; holed: number; rig: number; lastShot: number } | null = null;
  private tallied: {
    readonly balls: number;
    readonly hits: number;
    readonly holed: number;
    readonly rig: number;
    readonly at: number;
  } | null = null;
  /** The ships afire at the last frame, where their light stands (window metres). */
  private burning: Point[] = [];

  constructor(seed: number) {
    this.effects = new Effects(seed);
  }

  /** One frame of the fight at `now`, `seconds` on: its events since the last, its ships by number, the balls aloft
   *  and the wind's bearing. Answers the pushes on the water's ripples. */
  frame(input: {
    readonly events: readonly FeelEvent[];
    readonly ships: ReadonlyMap<number, FeelShip>;
    /** Each ball aloft: where it is (world metres) and its radius. */
    readonly balls: readonly (readonly [number, number, number, number])[];
    readonly now: number;
    readonly seconds: number;
    readonly windBearing: number;
    readonly toWindow: Window;
  }): Splash[] {
    const { ships, now, toWindow } = input;
    const burning: Point[] = [];
    this.effects.blow(input.windBearing);
    this.effects.trail(
      input.balls.map(([x, y, z]) => toWindow([x, y, z])),
      now,
    );
    this.whistles(input.balls, ships.get(0), toWindow);
    this.aloft = input.balls;
    const splashes = input.events.flatMap((event) => this.take(event, ships, now, toWindow, input.windBearing));
    this.moments(ships, now, input.seconds, toWindow);
    if (this.volley && input.balls.length === 0 && now - this.volley.lastShot > 0.2) {
      const { balls, hits, holed, rig } = this.volley;
      [this.tallied, this.volley] = [{ balls, hits, holed, rig, at: now }, null];
    }
    ships.forEach((ship, index) => {
      const { vessel, rig, hull } = ship;
      const harm = rig?.harm;
      // What the view says before an event does: her canvas's hurt, her colours struck, her going down.
      harm?.wear(vessel.max_sail > 0 ? 1 - vessel.sail / vessel.max_sail : 0);
      if (vessel.state === 'struck') harm?.strike(now);
      if (vessel.state === 'sinking') harm?.sink(now);
      const { middle } = lying(vessel);
      const anchor = toWindow(middle);
      const halfLength = hullWaterline(hull).lengthM / 2;
      if (vessel.state !== 'sinking' && vessel.state !== 'sunk') {
        this.effects.burn(anchor, [0, 0, deckOverM(hull)], vessel.fires, halfLength * 0.3, now, input.seconds);
        if (vessel.fires > 0) burning.push([anchor[0], anchor[1], anchor[2] + deckOverM(hull)]);
      }
      const share = harm?.sunkShare(now) ?? 0;
      if (share > 0.5 || vessel.state === 'sunk') {
        const water = toWindow([middle[0], middle[1], 0]);
        // Going down, her foam is kept up; once she is under, it lasts a while from when she went.
        if (vessel.state !== 'sunk' || !this.wentDown.has(index))
          this.wentDown.set(index, { at: water, until: now + FOAM_AFTER_S, radiusM: halfLength });
      }
    });
    for (const down of this.wentDown.values())
      if (now <= down.until) this.effects.foam(down.at, down.radiusM, now, input.seconds);
    this.burning = burning.slice(0, BURN_LIGHT.most);
    return splashes;
  }

  private take(
    event: FeelEvent,
    ships: ReadonlyMap<number, FeelShip>,
    now: number,
    toWindow: Window,
    windBearing: number,
  ): Splash[] {
    const shipOf = (index: number) => ships.get(index);
    switch (event.kind) {
      case 'muzzle': {
        const ship = shipOf(event.ship);
        const middle = ship ? lying(ship.vessel).middle : event.point;
        const mouth: Point = [event.point[0] - middle[0], event.point[1] - middle[1], event.point[2] - middle[2]];
        this.effects.fire(toWindow(middle), mouth, event.launch, now);
        this.call('ship.cannon', toWindow(event.point));
        if (event.ship === 0) {
          this.volley ??= { balls: 0, hits: 0, holed: 0, rig: 0, lastShot: now };
          [this.volley.balls, this.volley.lastShot] = [this.volley.balls + 1, now];
        }
        if (event.ship === 0) this.kick(KICKS.gun, toWindow(event.point));
        return [];
      }
      case 'splash': {
        const [x = 0, y = 0] = event.at ?? event.point ?? [];
        const spot = toWindow([x, y, event.point?.[2] ?? 0]);
        this.call('shot.splash', spot);
        this.drench([x, y], spot, shipOf(0), now, toWindow);
        return [this.effects.splash(spot, now, this.ballNear(x, y))];
      }
      case 'land':
        this.effects.dust(toWindow(event.point), now);
        return [];
      case 'hit':
        // A ball striking another ship while her volley is aloft is counted hers.
        if (this.volley && event.ship !== 0 && (event.by ?? 0) === 0) {
          this.volley.hits++;
          if (event.zone === 'holed') this.volley.holed++;
          if (event.zone === 'rig' || event.part === 'rig' || event.part === 'sail') this.volley.rig++;
        }
        this.hit(event, shipOf(event.ship), now, toWindow);
        return [];
      case 'ram': {
        const ship = shipOf(event.ship);
        if (ship) this.hullHit(ship, frameOf(ship.vessel, event.point), now, toWindow, false);
        return [];
      }
      case 'SailLost': {
        const ship = shipOf(event.ship);
        ship?.rig?.harm.loseSail(event.sail, now, leeward(ship, windBearing));
        return [];
      }
      case 'MastFell': {
        const ship = shipOf(event.ship);
        ship?.rig?.harm.fellMast(event.mast, now, leeward(ship, windBearing));
        return [];
      }
      case 'Struck':
        shipOf(event.ship)?.rig?.harm.strike(now);
        return [];
      case 'Sinking':
        shipOf(event.ship)?.rig?.harm.sink(now);
        this.goingDown(event.ship, shipOf(event.ship), now, toWindow);
        return [];
      case 'state':
        if (event.state === 'sinking') this.goingDown(event.ship, shipOf(event.ship), now, toWindow);
        return [];
      case 'Boarding': {
        const ship = shipOf(event.ship);
        if (ship) this.call('ship.grapple', toWindow(lying(ship.vessel).middle));
        return [];
      }
      case 'Flotsam': {
        const [x = 0, y = 0] = event.at;
        const spot = toWindow([x, y, 0]);
        this.flotsam.lay(event.id, [spot[0], spot[1]], event.kind_of);
        return [];
      }
      case 'Gathered': {
        const spot = this.flotsam.gather(event.id);
        if (spot) this.effects.gathered([spot[0], spot[1], 0], now);
        return [];
      }
      default:
        return [];
    }
  }

  /** A ball struck her: through her hull, a sail's canvas or her rig, at the point in her frame the rules name or,
   *  until they do, the world point turned into it. */
  private hit(event: Extract<FeelEvent, { kind: 'hit' }>, ship: FeelShip | undefined, now: number, toWindow: Window) {
    if (!ship) {
      if (event.point) this.effects.spar(toWindow(event.point), [0, 0, 0], now);
      return;
    }
    const spot = event.at ?? (event.point ? frameOf(ship.vessel, event.point) : null);
    if (!spot) return;
    const { middle, axes } = lying(ship.vessel);
    const anchor = toWindow(middle);
    const part = event.part ?? (event.zone === 'rig' ? 'rig' : 'hull');
    const struck = toWindow(
      [0, 1, 2].map((axis) => (middle[axis] ?? 0) + (offOf(axes, spot)[axis] ?? 0)) as unknown as Point,
    );
    this.call('ship.hit', struck, part === 'hull' ? 0.9 : 0.3);
    if (event.ship === 0) {
      this.kick(event.zone === 'holed' ? KICKS.holed : KICKS.hit, struck);
      if (part === 'hull') this.lastBlow = { side: blowSide(ship, spot), at: now };
    }
    if (part === 'hull') {
      this.hullHit(ship, spot, now, toWindow, true);
      if (event.zone === 'holed') this.effects.timber(toWindow([middle[0], middle[1], 0]), now);
      return;
    }
    const near = ship.rig?.cellNear(spot);
    if (near && (part === 'sail' || near.distanceM < SAIL_REACH_M)) {
      ship.rig?.harm.hole(near.sail, near.cell);
      this.effects.shred(anchor, offOf(axes, spot), now);
    } else this.effects.spar(anchor, offOf(axes, spot), now);
  }

  /** A blow through her hull at `spot` (her frame): her paint's splinters, and a hole that stays unless `scars` is
   *  false (a ram's stem). */
  private hullHit(ship: FeelShip, spot: Point, now: number, toWindow: Window, scars: boolean): void {
    const { middle, axes } = lying(ship.vessel);
    const outboard = spot[1] >= 0 ? 1 : -1;
    const out: [number, number] = [(axes[1][0] ?? 0) * outboard, (axes[1][1] ?? 0) * outboard];
    this.effects.splinter(toWindow(middle), offOf(axes, spot), out, DRESSES[ship.side].hull, now);
    if (scars) ship.rig?.harm.scar(spot);
  }

  /** A sound at `at` (window metres). A page that never takes them (the World Editor's, which has no sound) keeps only
   *  the latest. */
  private call(cue: string, spot: readonly [number, number, number], gain?: number): void {
    this.cues = [...this.cues.slice(-31), { cue, at: spot, ...(gain === undefined ? {} : { gain }) }];
  }

  /** A jar of the eye on her own ship. */
  private kick(kick: number, spot: readonly [number, number, number]): void {
    this.cues = [...this.cues.slice(-31), { cue: 'kick', at: spot, kick }];
  }

  /** A ball's fall at (x, y) (world metres) within `NEAR_SPLASH_M` of her hull throws its water over her rail and
   *  rocks her, the more the nearer. */
  private drench(
    fell: readonly [number, number],
    spot: Point,
    ship: FeelShip | undefined,
    now: number,
    toWindow: Window,
  ) {
    if (!ship) return;
    const gap = hullGap(ship, [fell[0], fell[1], 0]);
    if (gap > NEAR_SPLASH_M) return;
    const near = 1 - gap / NEAR_SPLASH_M;
    const { middle } = lying(ship.vessel);
    this.effects.drench(spot, toWindow([middle[0], middle[1], middle[2] + deckOverM(ship.hull)]), near, now);
    this.kick(KICKS.near * (0.4 + 0.6 * near), spot);
  }

  /** Each ball aloft that comes within `NEAR_MISS_M` of her hull, nearing her, whistles as it goes by. */
  private whistles(
    balls: readonly (readonly [number, number, number, number])[],
    ship: FeelShip | undefined,
    toWindow: Window,
  ) {
    if (!ship) return;
    for (const [x, y, z] of balls) {
      let last: { readonly away: number; readonly ball: readonly number[] } | null = null;
      for (const ball of this.aloft) {
        const away = Math.hypot((ball[0] ?? 0) - x, (ball[1] ?? 0) - y, (ball[2] ?? 0) - z);
        if (away < SAME_BALL_M && (!last || away < last.away)) last = { away, ball };
      }
      if (!last) continue;
      const [gap, before] = [hullGap(ship, [x, y, z]), hullGap(ship, last.ball as unknown as Point)];
      if (gap <= NEAR_MISS_M && before > NEAR_MISS_M)
        this.call('ship.whistle', toWindow([x, y, z]), 0.55 + 0.45 * (1 - gap / NEAR_MISS_M));
    }
  }

  /** A ship begins to go down: heard once; afire, her own seed decides whether her magazine blows and when. */
  private goingDown(number: number, ship: FeelShip | undefined, now: number, toWindow: Window): void {
    if (!ship || this.sinking.has(number)) return;
    this.sinking.add(number);
    const { middle } = lying(ship.vessel);
    this.call('ship.sinking', toWindow(middle));
    if (ship.vessel.fires <= 0) return;
    // Her number and where she lies are the same for everyone in the fight.
    const seed =
      Math.imul(number + 1, 73_856_093) ^ Math.imul(Math.round(middle[0]), 19_349_663) ^ Math.round(middle[1]);
    const after = magazineOf(seed);
    if (after !== null) this.magazines.set(number, now + after);
  }

  /** The frame's moments from the ships' numbers: magazines due go up, her sides coming ready and a captain running
   *  out are heard, her ports glint while she stands run out, and her battered hull smokes. */
  private moments(ships: ReadonlyMap<number, FeelShip>, now: number, seconds: number, toWindow: Window): void {
    const own = ships.get(0);
    for (const [number, due] of this.magazines) {
      if (now < due) continue;
      this.magazines.delete(number);
      const ship = ships.get(number);
      if (!ship) continue;
      const { middle } = lying(ship.vessel);
      const spot = toWindow(middle);
      this.effects.blast(spot, now);
      this.call('ship.blast', spot);
      if (own) {
        const [ownX = 0, ownY = 0] = own.vessel.ship;
        const away = Math.hypot(middle[0] - ownX, middle[1] - ownY);
        if (away < KICKS.magazineReachM) this.kick(KICKS.magazine * (1 - away / KICKS.magazineReachM), spot);
      }
    }
    const left = own?.vessel.guns?.left;
    if (own && left) {
      ([0, 1] as const).forEach((side) => {
        if ((this.reloads?.[side] ?? 0) > 0 && left[side] <= 0) {
          this.ready[side] = now;
          this.call('ship.ready', toWindow(lying(own.vessel).middle));
        }
      });
      this.reloads = left;
    }
    ships.forEach((ship, number) => {
      const sides = ship.vessel.run_out?.length ?? 0;
      if (sides > (this.runOut.get(number) ?? 0)) this.call('ship.runout', toWindow(lying(ship.vessel).middle));
      this.runOut.set(number, sides);
      if (sides > 0 && ship.vessel.state === 'afloat') this.glints(ship, now, seconds, toWindow);
    });
    const share = own && own.vessel.max_hull ? (own.vessel.hull ?? 0) / own.vessel.max_hull : 1;
    if (own && share < SMOKE_FROM && own.vessel.state !== 'sunk') {
      const { middle, axes } = lying(own.vessel);
      const span = (hullWaterline(own.hull).lengthM / 2) * SMOKE_SPAN;
      const deck = deckOverM(own.hull) + 0.5;
      const along = (ahead: number) => offOf(axes, [ahead, 0, deck]);
      this.effects.smolder(
        toWindow(middle),
        along(-span),
        along(span),
        (SMOKE_FROM - share) / SMOKE_FROM,
        now,
        seconds,
      );
    }
  }

  /** A captain's sides run out: a warm flicker at four ports along each. */
  private glints(ship: FeelShip, now: number, seconds: number, toWindow: Window): void {
    const { middle, axes } = lying(ship.vessel);
    const { lengthM, beamM } = hullWaterline(ship.hull);
    const ports = (ship.vessel.run_out ?? []).flatMap((side) =>
      [-0.3, -0.1, 0.1, 0.3].map((share) =>
        offOf(axes, [share * lengthM, (side === 'port' ? -1 : 1) * (beamM / 2), deckOverM(ship.hull) - 1]),
      ),
    );
    this.effects.glint(toWindow(middle), ports, 1, now, seconds);
  }

  /** The side of hers a blow last came from while it is told, or null. */
  blow(now: number): BlowSide | null {
    return this.lastBlow && now - this.lastBlow.at < BLOW_S ? this.lastBlow.side : null;
  }

  /** Her last volley's tally while it is shown, or null. */
  tally(
    now: number,
  ): { readonly balls: number; readonly hits: number; readonly holed: number; readonly rig: number } | null {
    if (!this.tallied || now - this.tallied.at > TALLY_S) return null;
    const { balls, hits, holed, rig } = this.tallied;
    return { balls, hits, holed, rig };
  }

  /** When her side (0 port, 1 starboard) last came ready, seconds, or null. */
  readyAt(side: 0 | 1): number | null {
    return this.ready[side];
  }

  /** Whether she is still drawn: not yet gone under. */
  static afloat(ship: FeelShip, now: number): boolean {
    return ship.vessel.state !== 'sunk' && (ship.rig?.harm.sunkShare(now) ?? 0) < 1;
  }

  /** The radius of the ball last seen aloft nearest a splash at (x, y), world metres: the one that fell there. */
  private ballNear(x: number, y: number): number | undefined {
    let nearest: { readonly away: number; readonly radius: number } | null = null;
    for (const [ballX, ballY, , radius] of this.aloft) {
      const away = Math.hypot(ballX - x, ballY - y);
      if (!nearest || away < nearest.away) nearest = { away, radius };
    }
    return nearest?.radius;
  }

  /** The puffs and the flotsam at `now`, drawn `scale` times their size, the flotsam on the drawn swell (`water`)
   *  where the page has one and its marks sized for the eye at `eye` (window metres). */
  marks(
    now: number,
    scale = 1,
    water: ((x: number, y: number) => number) | null = null,
    eye: readonly [number, number, number] | null = null,
  ): Mark[] {
    // Each burning ship's light on the hulls round her, flickering.
    const lights = this.burning.map(([x, y, z], index) => ({
      x,
      y,
      z,
      radius: BURN_LIGHT.reachM * scale,
      colour: BURN_LIGHT.colour,
      blend: 'light' as const,
      alpha: 0.8 + 0.2 * Math.sin(now * 13 + index * 2.3),
    }));
    return [...this.effects.marks(now, scale), ...lights, ...this.flotsam.marks(now, scale, water, eye)];
  }

  /** The holes in each ship's hull, where she is drawn (window metres, heights as drawn, her scale). */
  scars(ships: readonly ({ readonly ship: FeelShip; readonly place: ShipPlaceLike } | null)[]): Mark[] {
    const marks: Mark[] = [];
    for (const drawn of ships) {
      if (!drawn?.ship.rig) continue;
      const { place } = drawn;
      const axes = shipAxes(place.heading, place.pitch, place.roll);
      const size = place.scale ?? 1;
      drawn.ship.rig.harm.scars.forEach((scar, index) => {
        // A ragged hole: a dark middle in a rim of splintered raw timber, its blots each its own size, standing just
        // proud of her side; the pale rim reads on any paint, a black hull's too.
        for (let blot = 0; blot < 4; blot++) {
          const turn = index * 2.1 + blot * 1.9;
          const spot: Point = [
            scar.at[0] + Math.cos(turn) * scar.size * 0.6 * (blot > 0 ? 1 : 0),
            scar.at[1] + (scar.at[1] >= 0 ? 1 : -1) * scar.size * (blot === 0 ? 0.3 : 0.1),
            scar.at[2] + Math.sin(turn) * scar.size * 0.4 * (blot > 0 ? 1 : 0),
          ];
          const off = offOf(axes, spot);
          marks.push({
            x: place.x + off[0] * size,
            y: place.y + off[1] * size,
            z: place.z + off[2] * size,
            radius: scar.size * (blot === 0 ? 0.8 : 0.45 + ((index + blot) % 3) * 0.1) * size,
            colour: blot === 0 ? HOLE : RAW_TIMBER,
          });
        }
      });
    }
    return marks;
  }

  /** The sounds called for since last taken. */
  takeCues(): Cue[] {
    const cues = this.cues;
    this.cues = [];
    return cues;
  }
}

/** Where a ship's place is drawn, as `ShipPlace` says. */
export interface ShipPlaceLike {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly heading: number;
  readonly pitch: number;
  readonly roll: number;
  readonly scale?: number;
}

/** The side of her the wind blows to (1 starboard, -1 port): what tears from her falls that way. */
function leeward(ship: FeelShip, windBearing: number): 1 | -1 {
  return windOff(lying(ship.vessel).heading, windBearing) >= 0 ? 1 : -1;
}

/** How far a point (world metres) lies outside her hull's box: her waterline's length and beam, up to her deck. */
function hullGap(ship: FeelShip, point: Point): number {
  const [ahead, aside, up] = frameOf(ship.vessel, point);
  const { lengthM, beamM } = hullWaterline(ship.hull);
  const out = (value: number, half: number) => Math.max(0, Math.abs(value) - half);
  return Math.hypot(out(ahead, lengthM / 2), out(aside, beamM / 2), Math.max(0, up - deckOverM(ship.hull), -up));
}

/** The side of her a blow at `spot` (her frame) struck: her bow or stern, or a beam, by which it lies nearer. */
function blowSide(ship: FeelShip, spot: Point): BlowSide {
  const { lengthM, beamM } = hullWaterline(ship.hull);
  if (Math.abs(spot[0]) / (lengthM / 2) >= Math.abs(spot[1]) / (beamM / 2)) return spot[0] >= 0 ? 'bow' : 'stern';
  return spot[1] >= 0 ? 'starboard' : 'port';
}
