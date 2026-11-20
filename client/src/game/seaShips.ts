// The ships at sea as drawn: each riding the swell the page draws through her inertia and heeling into her turns, as
// the World Editor's Sloop does, her bow slamming into crests and throwing spray, her sails set while she is under way
// and filled by the weather's wind, each in her own hull and her side's colours; and each one's footprint on the
// water, which the sea leaves out along her own hull line and foams along, her wake and bow wave behind her.
import type { SeenPirate, SeenShip } from '../network/messages.ts';
import { SHIP_SPEED } from '../overworld/voyage.ts';
import type { Swell } from '../rules/landRules.ts';
import { factionSide, type ShipSide } from '../ships/dress.ts';
import { hullOfCaptain, hullSails, hullWaterline, SLOOP_HULL } from '../ships/hulls.ts';
import { SailRig, windOff } from '../ships/sails.ts';
import type { Waterline } from '../ships/shipMesh.ts';
import type { DrawnShip } from '../ships/shipModels.ts';
import type { ShipPlace } from '../ships/shipView.ts';
import { poseOnSwell, slams, sprayOf, turnHeel } from '../ships/swellPose.ts';
import { HullLines } from '../ships/hullLines.ts';
import { HULLS, type HullMask } from '../water/hullMask.ts';
import { type ShelteredSwell, swellHeight } from '../water/swell.ts';
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
  /** The hull a ship is drawn as: her own once her model has come, the Sloop until then. */
  readonly shown: (hull: number) => number;
  /** Makes every hull's model and its shell tags ready; awaited behind the sea's veil. */
  readonly warm?: () => Promise<unknown>;
  readonly marks: MarkDrawer;
}

/** The sea the ships ride: its swell (the weather's, with its sea state, once the page has it), and how deep it is at
 *  a point (Infinity off the charts). */
export interface SeaWater {
  readonly swell: (ShelteredSwell & { readonly state?: number }) | Swell | undefined;
  depthAt(x: number, y: number): number;
}

/** A moderate sea's state, for a swell that does not say its own. */
const MODERATE_STATE = 0.35;

/** A ship at sea as drawn: her hull, her place, larger than life but in a fight, her sails' rig, and her side. */
export type SeaShip = DrawnShip;

/** A ship as the sea has her: where she lies, her heading, and whether she is under way. */
export interface Lies {
  readonly x: number;
  readonly y: number;
  readonly heading: number;
  readonly underWay: boolean;
}

/** How far a hull heels into a turn as the Sloop does: a narrower hull more, a broader one less, by beam. */
export function heelShare(hull: number): number {
  return hullWaterline(SLOOP_HULL).beamM / hullWaterline(hull).beamM;
}

/** A ship at sea and whose she is: her hull, her side and who sails her. */
interface Sailing {
  readonly who: string;
  readonly lies: Lies;
  readonly hull: number;
  readonly side: ShipSide;
}

/** Every ship at sea but the player's: each other player's Sloop, then each captain's ship. */
function round(
  others: readonly SeenShip[],
  pirates: readonly SeenPirate[],
  shown: (hull: number) => number,
): Sailing[] {
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
      hull: shown(hullOfCaptain(pirate)),
      side: factionSide(pirate.faction),
    })),
  ];
}

/** The ships at sea, each one's rig kept from frame to frame so her sails ease from set to furled, and her swing so she
 *  heels into a turn. */
export class SeaShips {
  /** The hull a ship is drawn as: her own once her model has come (`ShipModels.shown`). */
  private readonly shown: (hull: number) => number;
  private readonly rigs = new Map<string, { readonly hull: number; readonly rig: SailRig }>();
  private readonly swings = new Map<string, { heading: number; swing: number }>();
  /** Each ship's pitch and the sea over her stem as last drawn, how long since her bow last slammed (seconds; negative
   *  before any) and her bow's spray now. */
  private readonly rides = new Map<string, { pitch: number; bowUnder: number; sinceSlamS: number; spray: number }>();

  /** Each hull's own line at her waterline, read from her mesh. */
  private readonly lines: Pick<HullLines, 'line'>;

  constructor(shown: (hull: number) => number = (hull) => hull, lines: Pick<HullLines, 'line'> = new HullLines()) {
    this.shown = shown;
    this.lines = lines;
  }

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
    const halfLength = (lengthM / 2) * scale;
    const pose = poseOnSwell(water.swell, water.depthAt, lies, halfLength, (beamM / 2) * scale, time);
    const heel = turnHeel(swing, lies.underWay ? SHIP_SPEED : 0) * heelShare(hull);
    if (seconds > 0) this.ride(who, lies, pose, halfLength, water, seconds, time);
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

  /** Follows her bow over the swell: a slam when it pitches down into a crest, and the spray it throws. */
  private ride(
    who: string,
    lies: Lies,
    pose: { readonly heave: number; readonly pitch: number },
    halfLength: number,
    water: SeaWater,
    seconds: number,
    time: number,
  ): void {
    const last = this.rides.get(who) ?? { pitch: pose.pitch, bowUnder: 0, sinceSlamS: -1, spray: 0 };
    const stem: [number, number] = [
      lies.x + Math.sin(lies.heading) * halfLength,
      lies.y - Math.cos(lies.heading) * halfLength,
    ];
    const sea = water.swell ? swellHeight(water.swell, stem[0], stem[1], time, water.depthAt(stem[0], stem[1])) : 0;
    const bowUnder = sea - (pose.heave + Math.sin(pose.pitch) * halfLength);
    const closing = (bowUnder - last.bowUnder) / seconds;
    const slammed = lies.underWay && slams((pose.pitch - last.pitch) / seconds, bowUnder, closing);
    const sinceSlamS = slammed ? 0 : last.sinceSlamS < 0 ? -1 : last.sinceSlamS + seconds;
    const state = water.swell && 'state' in water.swell ? (water.swell.state ?? MODERATE_STATE) : MODERATE_STATE;
    const spray = sprayOf(lies.underWay ? 1 : 0, state, sinceSlamS);
    this.rides.set(who, { pitch: pose.pitch, bowUnder, sinceSlamS, spray });
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
    const ships = round(others, pirates, this.shown);
    const sailing = new Set(['own', ...ships.map((ship) => ship.who)]);
    for (const who of this.rigs.keys()) if (!sailing.has(who)) this.rigs.delete(who);
    for (const who of this.swings.keys()) if (!sailing.has(who)) this.swings.delete(who);
    for (const who of this.rides.keys()) if (!sailing.has(who)) this.rides.delete(who);
    const player = { who: 'own', lies: own.lies, hull: SLOOP_HULL, side: 'player' as const };
    return [riding(player, own.place), ...ships.map((ship) => riding(ship, null))];
  }

  /** Each ship's footprint on the water, drawn `scale` times her size, in her own hull's line, with her way for her
   *  wake and her bow's spray: the player's first, then every other player's and every pirate's, nearest her first,
   *  as many as the water holds (`HULLS`). */
  hulls(own: Lies, others: readonly SeenShip[], pirates: readonly SeenPirate[], scale: number): HullMask[] {
    const footprint = (who: string, lies: Lies, hull: number): HullMask => {
      const { x, y, heading } = lies;
      const { lengthM, beamM } = hullWaterline(hull);
      const [halfLength, halfBeam] = [(lengthM / 2) * scale, (beamM / 2) * scale];
      const spray = this.rides.get(who)?.spray ?? 0;
      const line = this.lines.line(hull);
      return { x, y, heading, halfLength, halfBeam, way: lies.underWay ? UNDER_WAY : 0, line, scale, spray };
    };
    const near = round(others, pirates, this.shown).map((ship) => footprint(ship.who, ship.lies, ship.hull));
    const away = (mask: HullMask) => Math.hypot(mask.x - own.x, mask.y - own.y);
    return [footprint('own', own, SLOOP_HULL), ...near.sort((one, other) => away(one) - away(other))].slice(0, HULLS);
  }
}
