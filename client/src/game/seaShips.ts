// The ships at sea as drawn: each riding the swell the page draws and heeling into her turns, as the World Editor's
// Sloop does, her sails set while she is under way and filled by the steady wind, a pirate's darker; and each one's
// footprint on the water, which the sea leaves out under her and foams round her bow under way.
import type { SeenPirate, SeenShip } from '../network/messages.ts';
import { SHIP_SPEED } from '../overworld/voyage.ts';
import type { Swell } from '../rules/landRules.ts';
import { SailRig, type SailCorners, windOff } from '../ships/sails.ts';
import type { Waterline } from '../ships/shipMesh.ts';
import type { ShipPlace } from '../ships/shipView.ts';
import { poseOnSwell, turnHeel } from '../ships/swellPose.ts';
import type { HullMask } from '../water/hullMask.ts';
import type { MarkDrawer } from '../editor/naval.ts';
import { HELM_TURN } from './seaHelm.ts';

/** A pirate's Sloop is drawn darker, as a captain's is in a fight. */
const PIRATE_SHADE = 0.55;
/** The way a ship under way shows the water, m/s: her bow wave foams whole. */
const UNDER_WAY = 4;
/** How fast a ship's swing as drawn follows her heading's, a share a second; and the most it is taken to be, radians a
 *  second, so a voyage turning onto its next leg at once heels her as a hard turn of the helm would. */
const SWING = { rate: 3, most: HELM_TURN } as const;

/** The Sloop every ship at sea is, and what draws a fight's balls, arcs and effects. */
export interface SeaHull {
  readonly waterline: Waterline;
  readonly sails: readonly SailCorners[];
  readonly marks: MarkDrawer;
}

/** The sea the ships ride: its swell, and how deep it is at a point (Infinity off the charts). */
export interface SeaWater {
  readonly swell: Swell | undefined;
  depthAt(x: number, y: number): number;
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

/** The ships at sea, each one's rig kept from frame to frame so her sails ease from set to furled, and her swing so she
 *  heels into a turn. */
export class SeaShips {
  private readonly hull: SeaHull;
  private readonly rigs = new Map<string, SailRig>();
  private readonly swings = new Map<string, { heading: number; swing: number }>();

  constructor(hull: SeaHull) {
    this.hull = hull;
  }

  /** Where the ship `who` is drawn, `scale` times her size, `seconds` on at `time`: on the swell, heeled into her
   *  swing at a ship's own way while under way. Asked once a frame for each ship, so her swing is followed. */
  placeOf(who: string, lies: Lies, scale: number, water: SeaWater, seconds: number, time: number): ShipPlace {
    const last = this.swings.get(who);
    const turn =
      last && seconds > 0
        ? Math.atan2(Math.sin(lies.heading - last.heading), Math.cos(lies.heading - last.heading))
        : 0;
    const asked = Math.min(SWING.most, Math.max(-SWING.most, seconds > 0 ? turn / seconds : 0));
    const swing = (last?.swing ?? 0) + (asked - (last?.swing ?? 0)) * (1 - Math.exp(-seconds * SWING.rate));
    this.swings.set(who, { heading: lies.heading, swing });
    const { lengthM, beamM } = this.hull.waterline;
    const pose = poseOnSwell(water.swell, water.depthAt, lies, (lengthM / 2) * scale, (beamM / 2) * scale, time);
    const heel = turnHeel(swing, lies.underWay ? SHIP_SPEED : 0);
    return {
      x: lies.x,
      y: lies.y,
      z: pose.heave,
      heading: lies.heading,
      pitch: pose.pitch,
      roll: pose.roll + heel,
      scale,
    };
  }

  /** The player's ship as `own` places her, every other player's and every pirate, `seconds` on at `time`, drawn
   *  `scale` times their size. */
  ships(
    seconds: number,
    time: number,
    windBearing: number,
    own: { readonly lies: Lies; readonly place: ShipPlace },
    others: readonly SeenShip[],
    pirates: readonly SeenPirate[],
    scale: number,
    water: SeaWater,
  ): SeaShip[] {
    const riding = (who: string, lies: Lies, place: ShipPlace | null, shade = 1): SeaShip => {
      let rig = this.rigs.get(who);
      if (!rig) {
        rig = new SailRig(this.hull.sails);
        this.rigs.set(who, rig);
      }
      rig.step(seconds, { offDeg: windOff(lies.heading, windBearing), set: lies.underWay }, time);
      return { place: place ?? this.placeOf(who, lies, scale, water, seconds, time), rig, shade };
    };
    const sailing = new Set([
      'own',
      ...others.map((ship) => `player-${ship.player}`),
      ...pirates.map((pirate) => `pirate-${pirate.id}`),
    ]);
    for (const who of this.rigs.keys()) if (!sailing.has(who)) this.rigs.delete(who);
    for (const who of this.swings.keys()) if (!sailing.has(who)) this.swings.delete(who);
    return [
      riding('own', own.lies, own.place),
      ...others.map((ship) => riding(`player-${ship.player}`, { ...ship, underWay: ship.pace > 0 }, null)),
      ...pirates.map((pirate) => riding(`pirate-${pirate.id}`, { ...pirate, underWay: true }, null, PIRATE_SHADE)),
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
