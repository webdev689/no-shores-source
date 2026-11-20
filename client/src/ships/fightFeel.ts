// How a sea fight looks and sounds round its ships, from the fight's events and what its view already says of them
// (their hurts, fires and states): each event becomes its puffs (`Effects`), its harm on the ship it struck
// (`ShipHarm`, on her rig), its flotsam and its sound. The World Editor's fights and the sea's draw through it.
import type { RoomEvent } from '../rules/feelEvents.ts';
import type { FightEvent, FightVessel, Point } from '../rules/fightRules.ts';
import { DRESSES, type ShipSide } from './dress.ts';
import { Effects, type Mark, type Splash } from './effects.ts';
import { Flotsam } from './flotsam.ts';
import { hullPaint, hullWaterline, plateOverM, SLOOP_HULL } from './hulls.ts';
import { type SailRig, windOff } from './sails.ts';
import { shipAxes } from './shipAxes.ts';

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
  | RoomEvent;

export { feelOf, type RoomEvent } from '../rules/feelEvents.ts';

/** What the feel reads of a ship's numbers in the fight's view. */
export type FeelVessel = Pick<FightVessel, 'fires' | 'sail' | 'max_sail'> & {
  readonly ship: Iterable<number> & ArrayLike<number>;
  readonly pose: Iterable<number> & ArrayLike<number>;
  readonly state: string;
};

/** A ship in the fight as the feel sees her: her numbers in its view, her rig (her harm is on it; null while her
 *  model has not come), her hull and her side. */
export interface FeelShip {
  readonly vessel: FeelVessel;
  readonly rig: SailRig | null;
  readonly hull: number;
  readonly side: ShipSide;
}

/** A sound the fight calls for, where (window metres). */
export interface Cue {
  readonly cue: string;
  readonly at: readonly [number, number, number];
}

type Window = (point: Point) => readonly [number, number, number];

/** A sail is struck where a ball passed this close to one of its cells' middles, metres. */
const SAIL_REACH_M = 1.5;
/** A fire's flames rise from this far over the Sloop's waterline (metres): just over her deck. */
const SLOOP_DECK_M = 2.4;
/** The water foams where a ship went down this long after she is under, seconds. */
const FOAM_AFTER_S = 8;

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
  /** Where each ship went down and until when its water foams, by her number. */
  private readonly wentDown = new Map<
    number,
    { readonly at: Point; readonly until: number; readonly radiusM: number }
  >();

  constructor(seed: number) {
    this.effects = new Effects(seed);
  }

  /** One frame of the fight at `now`, `seconds` on: its events since the last, its ships by number, the balls aloft
   *  and the wind's bearing. Answers the pushes on the water's ripples. */
  frame(input: {
    readonly events: readonly FeelEvent[];
    readonly ships: ReadonlyMap<number, FeelShip>;
    readonly balls: readonly Point[];
    readonly now: number;
    readonly seconds: number;
    readonly windBearing: number;
    readonly toWindow: Window;
  }): Splash[] {
    const { ships, now, toWindow } = input;
    this.effects.blow(input.windBearing);
    this.effects.trail(input.balls.map(toWindow), now);
    const splashes = input.events.flatMap((event) => this.take(event, ships, now, toWindow, input.windBearing));
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
      if (vessel.state !== 'sinking' && vessel.state !== 'sunk')
        this.effects.burn(anchor, [0, 0, deckOverM(hull)], vessel.fires, halfLength * 0.3, now, input.seconds);
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
        return [];
      }
      case 'splash': {
        const [x = 0, y = 0] = event.at ?? event.point ?? [];
        const spot = toWindow([x, y, event.point?.[2] ?? 0]);
        // A page that never takes them (the World Editor's, which has no sound) keeps only the latest.
        this.cues = [...this.cues.slice(-31), { cue: 'shot.splash', at: spot }];
        return [this.effects.splash(spot, now)];
      }
      case 'land':
        this.effects.dust(toWindow(event.point), now);
        return [];
      case 'hit':
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
        return [];
      case 'Flotsam': {
        const [x = 0, y = 0] = event.at;
        const spot = toWindow([x, y, 0]);
        this.flotsam.lay(event.id, [spot[0], spot[1]], event.kind_of);
        return [];
      }
      case 'Gathered':
        this.flotsam.gather(event.id);
        return [];
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
    if (part === 'hull') {
      this.hullHit(ship, spot, now, toWindow, true);
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

  /** Her place as she goes down (`ShipHarm.settle`), her masthead's height for how deep. */
  settled<Place extends { readonly z: number; readonly pitch: number; readonly roll: number }>(
    ship: FeelShip,
    place: Place,
    now: number,
    scale = 1,
  ): Place {
    return ship.rig ? ship.rig.harm.settle(place, now, plateOverM(ship.hull) * scale) : place;
  }

  /** Whether she is still drawn: not yet gone under. */
  static afloat(ship: FeelShip, now: number): boolean {
    return ship.vessel.state !== 'sunk' && (ship.rig?.harm.sunkShare(now) ?? 0) < 1;
  }

  /** The puffs and the flotsam at `now`, drawn `scale` times their size. */
  marks(now: number, scale = 1): Mark[] {
    return [...this.effects.marks(now, scale), ...this.flotsam.marks(now, scale)];
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
        // A ragged hole: a few dark blots of its own sizes about the point, standing just proud of her side.
        for (let blot = 0; blot < 4; blot++) {
          const turn = index * 2.1 + blot * 1.9;
          const spot: Point = [
            scar.at[0] + Math.cos(turn) * scar.size * 0.6 * (blot > 0 ? 1 : 0),
            scar.at[1] + (scar.at[1] >= 0 ? 1 : -1) * scar.size * 0.15,
            scar.at[2] + Math.sin(turn) * scar.size * 0.4 * (blot > 0 ? 1 : 0),
          ];
          const off = offOf(axes, spot);
          marks.push({
            x: place.x + off[0] * size,
            y: place.y + off[1] * size,
            z: place.z + off[2] * size,
            radius: scar.size * (blot === 0 ? 0.8 : 0.45 + ((index + blot) % 3) * 0.1) * size,
            colour: blot === 0 ? [0.05, 0.04, 0.03] : [0.12, 0.09, 0.07],
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
