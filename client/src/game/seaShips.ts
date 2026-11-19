// The ships at sea as drawn: each riding the swell the page draws and heeling into her turns, as the World Editor's
// Sloop does, her sails set while she is under way and filled by the steady wind, each in her own hull and her side's
// colours; and each one's footprint on the water, which the sea leaves out under her and foams round her bow under way.
import type { SeenPirate, SeenShip } from '../network/messages.ts';
import { SHIP_SPEED } from '../overworld/voyage.ts';
import type { Swell } from '../rules/landRules.ts';
import { factionSide, type ShipSide } from '../ships/dress.ts';
import { hullOfCaptain, hullSails, hullWaterline, SLOOP_HULL } from '../ships/hulls.ts';
import { SailRig, windOff } from '../ships/sails.ts';
import type { Waterline } from '../ships/shipMesh.ts';
import type { DrawnShip } from '../ships/shipModels.ts';
import type { ShipPlace } from '../ships/shipView.ts';
import { poseOnSwell, turnHeel } from '../ships/swellPose.ts';
import { HULLS, type HullMask } from '../water/hullMask.ts';
import type { MarkDrawer } from '../editor/naval.ts';
import { HELM_TURN } from './seaHelm.ts';

/** The way a ship under way shows the water, m/s: her bow wave foams whole. */
const UNDER_WAY = 4;
/** How fast a ship's swing as drawn follows her heading's, a share a second; and the most it is taken to be, radians a
 *  second, so a voyage turning onto its next leg at once heels her as a hard turn of the helm would. */
const SWING = { rate: 3, most: HELM_TURN } as const;
/** Seconds a ship first seen is taken to have sailed as she is: past setting or furling her sails and trimming them. */
const FIRST_SEEN_S = 5;

/** The player's ship, the Sloop, and what draws a fight's balls, arcs and effects. */
export interface SeaHull {
  readonly waterline: Waterline;
  readonly marks: MarkDrawer;
}

/** The sea the ships ride: its swell, and how deep it is at a point (Infinity off the charts). */
export interface SeaWater {
  readonly swell: Swell | undefined;
  depthAt(x: number, y: number): number;
}

/** A ship at sea as drawn: her hull, her place, larger than life but in a fight, her sails' rig, and her side. */
export type SeaShip = DrawnShip;

/** A ship as the sea has her: where she lies, her heading, and whether she is under way. */
export interface Lies {
  readonly x: number;
  readonly y: number;
  readonly heading: number;
  readonly underWay: boolean;
}

/** A ship at sea and whose she is: her hull, her side and who sails her. */
interface Sailing {
  readonly who: string;
  readonly lies: Lies;
  readonly hull: number;
  readonly side: ShipSide;
}

/** Every ship at sea but the player's: each other player's Sloop, then each captain's ship. */
function round(others: readonly SeenShip[], pirates: readonly SeenPirate[]): Sailing[] {
  return [
    ...others.map((ship) => ({
      who: `player-${ship.player}`,
      lies: { ...ship, underWay: ship.pace > 0 },
      hull: SLOOP_HULL,
      side: 'player' as const,
    })),
    ...pirates.map((pirate) => ({
      who: `pirate-${pirate.id}`,
      lies: { ...pirate, underWay: true },
      hull: hullOfCaptain(pirate),
      side: factionSide(pirate.faction),
    })),
  ];
}

/** The ships at sea, each one's rig kept from frame to frame so her sails ease from set to furled, and her swing so she
 *  heels into a turn. */
export class SeaShips {
  private readonly rigs = new Map<string, { readonly hull: number; readonly rig: SailRig }>();
  private readonly swings = new Map<string, { heading: number; swing: number }>();

  /** Where the ship `who` is drawn, `scale` times her size, `seconds` on at `time`: on the swell at her hull's
   *  waterline, heeled into her swing at a ship's own way while under way. Asked once a frame for each ship, so her
   *  swing is followed. */
  placeOf(
    who: string,
    lies: Lies,
    scale: number,
    water: SeaWater,
    seconds: number,
    time: number,
    hull = SLOOP_HULL,
  ): ShipPlace {
    const last = this.swings.get(who);
    const turn =
      last && seconds > 0
        ? Math.atan2(Math.sin(lies.heading - last.heading), Math.cos(lies.heading - last.heading))
        : 0;
    const asked = Math.min(SWING.most, Math.max(-SWING.most, seconds > 0 ? turn / seconds : 0));
    const swing = (last?.swing ?? 0) + (asked - (last?.swing ?? 0)) * (1 - Math.exp(-seconds * SWING.rate));
    this.swings.set(who, { heading: lies.heading, swing });
    const { lengthM, beamM } = hullWaterline(hull);
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

  /** The player's ship as `own` places her, every other player's and every captain's, `seconds` on at `time`, drawn
   *  `scale` times their size, each in her hull and her side's colours. */
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
    const riding = ({ who, lies, hull, side }: Sailing, place: ShipPlace | null): SeaShip => {
      const wind = { offDeg: windOff(lies.heading, windBearing), set: lies.underWay };
      let rigged = this.rigs.get(who);
      if (!rigged || rigged.hull !== hull) {
        rigged = { hull, rig: new SailRig(hullSails(hull)) };
        // A ship coming into view sails under sails already set, or lies with them furled: none sets them as she comes.
        rigged.rig.step(FIRST_SEEN_S, wind, time);
        this.rigs.set(who, rigged);
      }
      rigged.rig.step(seconds, wind, time);
      const placed = place ?? this.placeOf(who, lies, scale, water, seconds, time, hull);
      return { hull, place: placed, rig: rigged.rig, look: { side } };
    };
    const ships = round(others, pirates);
    const sailing = new Set(['own', ...ships.map((ship) => ship.who)]);
    for (const who of this.rigs.keys()) if (!sailing.has(who)) this.rigs.delete(who);
    for (const who of this.swings.keys()) if (!sailing.has(who)) this.swings.delete(who);
    const player = { who: 'own', lies: own.lies, hull: SLOOP_HULL, side: 'player' as const };
    return [riding(player, own.place), ...ships.map((ship) => riding(ship, null))];
  }

  /** Each ship's footprint on the water, drawn `scale` times her size: the player's first, then every other player's
   *  and every pirate's, nearest her first, as many as the water holds. */
  hulls(own: Lies, others: readonly SeenShip[], pirates: readonly SeenPirate[], scale: number): HullMask[] {
    const footprint = (lies: Lies, hull: number): HullMask => {
      const { x, y, heading } = lies;
      const { lengthM, beamM } = hullWaterline(hull);
      const [halfLength, halfBeam] = [(lengthM / 2) * scale, (beamM / 2) * scale];
      return { x, y, heading, halfLength, halfBeam, way: lies.underWay ? UNDER_WAY : 0 };
    };
    const near = round(others, pirates).map((ship) => footprint(ship.lies, ship.hull));
    const away = (mask: HullMask) => Math.hypot(mask.x - own.x, mask.y - own.y);
    return [footprint(own, SLOOP_HULL), ...near.sort((one, other) => away(one) - away(other))].slice(0, HULLS);
  }
}
