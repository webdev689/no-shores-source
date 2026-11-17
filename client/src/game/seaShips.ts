// The ships at sea as drawn: each riding the swell a little out of step with the others, her sails set while she is
// under way and filled by the steady wind, a pirate's darker; and each one's footprint on the water, which the sea
// leaves out under her and foams round her bow under way.
import type { SeenPirate, SeenShip } from '../network/messages.ts';
import { SailRig, type SailCorners, windOff } from '../ships/sails.ts';
import type { Waterline } from '../ships/shipMesh.ts';
import type { ShipPlace } from '../ships/shipView.ts';
import type { HullMask } from '../water/hullMask.ts';
import type { MarkDrawer } from '../editor/naval.ts';

/** A pirate's Sloop is drawn darker, as a captain's is in a fight. */
const PIRATE_SHADE = 0.55;
/** The way a ship under way shows the water, m/s: her bow wave foams whole. */
const UNDER_WAY = 4;

/** The Sloop every ship at sea is, and what draws a fight's balls, arcs and effects. */
export interface SeaHull {
  readonly waterline: Waterline;
  readonly sails: readonly SailCorners[];
  readonly marks: MarkDrawer;
}

/** A ship at sea as drawn: her place, larger than life but in a fight, her sails' rig, and how light she is drawn
 *  (a pirate's darker). */
export interface SeaShip {
  readonly place: ShipPlace;
  readonly rig: SailRig;
  readonly shade: number;
}

/** A ship as the sea has her: where she lies, her heading, and whether she is under way. */
export interface Lies {
  readonly x: number;
  readonly y: number;
  readonly heading: number;
  readonly underWay: boolean;
}

/** How far the swell lifts a ship riding it `phase` out of step with the player's, metres, at `time`. */
export function heaveAt(time: number, phase: number): number {
  return 0.35 * Math.sin(time * 0.9 + phase) - 0.4;
}

/** The ships at sea and each one's rig, kept from frame to frame so her sails ease from set to furled. */
export class SeaShips {
  private readonly hull: SeaHull;
  private readonly rigs = new Map<string, SailRig>();

  constructor(hull: SeaHull) {
    this.hull = hull;
  }

  /** The player's ship, every other player's and every pirate, `dt` seconds on at `time`, drawn `scale` times their
   *  size. */
  ships(
    dt: number,
    time: number,
    windBearing: number,
    own: Lies,
    others: readonly SeenShip[],
    pirates: readonly SeenPirate[],
    scale: number,
  ): SeaShip[] {
    const riding = (who: string, phase: number, lies: Lies, shade = 1): SeaShip => {
      let rig = this.rigs.get(who);
      if (!rig) {
        rig = new SailRig(this.hull.sails);
        this.rigs.set(who, rig);
      }
      rig.step(dt, { offDeg: windOff(lies.heading, windBearing), set: lies.underWay }, time + phase);
      const place = {
        x: lies.x,
        y: lies.y,
        z: heaveAt(time, phase),
        heading: lies.heading,
        roll: 0.035 * Math.sin(time * 0.7 + phase),
        pitch: 0.015 * Math.sin(time * 0.53 + phase),
        scale,
      };
      return { place, rig, shade };
    };
    const sailing = new Set([
      'own',
      ...others.map((ship) => `player-${ship.player}`),
      ...pirates.map((pirate) => `pirate-${pirate.id}`),
    ]);
    for (const who of this.rigs.keys()) if (!sailing.has(who)) this.rigs.delete(who);
    return [
      riding('own', 0, own),
      ...others.map((ship) => riding(`player-${ship.player}`, ship.player, { ...ship, underWay: ship.pace > 0 })),
      ...pirates.map((pirate) =>
        riding(`pirate-${pirate.id}`, pirate.id + 0.5, { ...pirate, underWay: true }, PIRATE_SHADE),
      ),
    ];
  }

  /** Each ship's footprint on the water, the player's first, drawn `scale` times her size. */
  hulls(own: Lies, others: readonly SeenShip[], scale: number): HullMask[] {
    const [halfLength, halfBeam] = [(this.hull.waterline.lengthM / 2) * scale, (this.hull.waterline.beamM / 2) * scale];
    const hull = (lies: Lies): HullMask => {
      const { x, y, heading } = lies;
      return { x, y, heading, halfLength, halfBeam, way: lies.underWay ? UNDER_WAY : 0 };
    };
    return [hull(own), ...others.map((ship) => hull({ ...ship, underWay: ship.pace > 0 }))];
  }
}
