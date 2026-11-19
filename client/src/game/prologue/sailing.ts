// Ships a cutscene sails by hand: the player's Brig in the storm, ships passing an island, Thule's Frigate that rams
// her. Each is placed where the story says, posed on the sea as it is drawn (a storm's swell gained), heeled as she
// turns, her sails filled by the wind or furled, and drawn by her hull's own model.
import type { Swell } from '../../rules/landRules.ts';
import { SailRig, type SailCorners, windOff } from '../../ships/sails.ts';
import type { Waterline } from '../../ships/shipMesh.ts';
import type { ShipPlace } from '../../ships/shipView.ts';
import { poseOnSwell } from '../../ships/swellPose.ts';

/** The hulls the story draws, by their names in the ships' manifest. */
export type Hull = 'brig' | 'sloop' | 'frigate';

/** A ship as the story has her now: where she lies (world metres), her heading, whether she sails, how many times her
 *  size she is drawn, how light, and extra heel and rise the story gives her (a list, a lurch). */
export interface Sailed {
  readonly who: string;
  readonly hull: Hull;
  readonly x: number;
  readonly y: number;
  readonly heading: number;
  readonly underWay: boolean;
  readonly scale?: number;
  readonly shade?: number;
  readonly heel?: number;
  readonly rise?: number;
  readonly sinking?: number;
}

/** A ship ready to draw: her hull, her place, her light and her canvas. */
export interface ShipDraw {
  readonly hull: Hull;
  readonly place: ShipPlace;
  readonly shade: number;
  readonly rig: SailRig;
}

/** How far a sinking ship has gone down at most, metres, and how far she lists as she goes, radians. */
const SUNK_DEPTH_M = 9;
const SUNK_LIST = 0.55;

/** Each ship's rig, kept from frame to frame so her sails fill and furl over time. */
export class Sailing {
  private readonly rigs = new Map<string, SailRig>();
  private readonly hulls: Readonly<
    Record<Hull, { readonly waterline: Waterline; readonly sails: readonly SailCorners[] }>
  >;

  constructor(
    hulls: Readonly<Record<Hull, { readonly waterline: Waterline; readonly sails: readonly SailCorners[] }>>,
  ) {
    this.hulls = hulls;
  }

  /** Every ship placed and posed for a frame `seconds` on at `time`, the wind blowing toward `windBearing`, on the
   *  drawn sea's `swell`; ships the story no longer sails let go of their rigs. */
  frame(
    ships: readonly Sailed[],
    seconds: number,
    time: number,
    windBearing: number,
    swell: Swell | undefined,
  ): ShipDraw[] {
    const sailing = new Set(ships.map((ship) => ship.who));
    for (const who of this.rigs.keys()) if (!sailing.has(who)) this.rigs.delete(who);
    return ships.map((ship) => {
      const { waterline, sails } = this.hulls[ship.hull];
      const wind = { offDeg: windOff(ship.heading, windBearing), set: ship.underWay };
      let rig = this.rigs.get(ship.who);
      if (!rig) {
        rig = new SailRig(sails);
        rig.step(10, wind, time);
        this.rigs.set(ship.who, rig);
      }
      rig.step(seconds, wind, time);
      const scale = ship.scale ?? 1;
      const lies = { x: ship.x, y: ship.y, heading: ship.heading, underWay: ship.underWay };
      const pose = poseOnSwell(
        swell,
        () => Infinity,
        lies,
        (waterline.lengthM / 2) * scale,
        (waterline.beamM / 2) * scale,
        time,
      );
      const sinking = Math.min(1, Math.max(0, ship.sinking ?? 0));
      const place: ShipPlace = {
        x: ship.x,
        y: ship.y,
        z: pose.heave + (ship.rise ?? 0) - sinking * SUNK_DEPTH_M * scale,
        heading: ship.heading,
        pitch: pose.pitch + sinking * 0.25,
        roll: pose.roll + (ship.heel ?? 0) + sinking * SUNK_LIST,
        scale,
      };
      return { hull: ship.hull, place, shade: ship.shade ?? 1, rig };
    });
  }
}

/** A point on a ship's deck (her frame: metres to her bow, to starboard, up from her waterline) in the world, as she
 *  is placed. Her pitch raises her bow; her roll lowers her starboard side. */
export function onDeck(place: ShipPlace, forward: number, starboard: number, up: number): [number, number, number] {
  const scale = place.scale ?? 1;
  const [along, across, over] = [forward * scale, starboard * scale, up * scale];
  const [sinHeading, cosHeading] = [Math.sin(place.heading), Math.cos(place.heading)];
  const rise = along * Math.sin(place.pitch) - across * Math.sin(place.roll);
  return [
    place.x + sinHeading * along + cosHeading * across,
    place.y - cosHeading * along + sinHeading * across,
    place.z + over + rise,
  ];
}
