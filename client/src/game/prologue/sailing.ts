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

/** What hurts and going down do to a ship's pose, as the fight's rules send it: metres settled, trim (radians, bow
 *  up) and list (radians, to starboard). */
export type Founder = readonly [number, number, number];

/** A ship as the story has her now: where she lies (world metres), her heading, whether she sails, how many times her
 *  size she is drawn, how light, extra heel and rise the story gives her (a list, a lurch), and her founder. */
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
  readonly founder?: Founder;
}

/** A ship ready to draw: her hull, her place, her light and her canvas. */
export interface ShipDraw {
  readonly hull: Hull;
  readonly place: ShipPlace;
  readonly shade: number;
  readonly rig: SailRig;
}

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
      const { waterline } = this.hulls[ship.hull];
      const rig = this.rigOf(ship, windBearing, time);
      rig.step(seconds, { offDeg: windOff(ship.heading, windBearing), set: ship.underWay }, time);
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
      // Settled, trimmed and listed on the swell drawn here, as the fight draws her.
      const [settled, trim, list] = ship.founder ?? [0, 0, 0];
      const place: ShipPlace = {
        x: ship.x,
        y: ship.y,
        z: pose.heave + (ship.rise ?? 0) - settled * scale,
        heading: ship.heading,
        pitch: pose.pitch + trim,
        roll: pose.roll + (ship.heel ?? 0) + list,
        scale,
      };
      return { hull: ship.hull, place, shade: ship.shade ?? 1, rig };
    });
  }

  /** The rig `ship` sails with: the one she was last drawn or kept with, else a new one already filled or furled
   *  as she sails, the wind blowing toward `windBearing` at `time`. */
  rigOf(ship: Sailed, windBearing: number, time: number): SailRig {
    let rig = this.rigs.get(ship.who);
    if (!rig) {
      rig = new SailRig(this.hulls[ship.hull].sails);
      rig.step(10, { offDeg: windOff(ship.heading, windBearing), set: ship.underWay }, time);
      this.rigs.set(ship.who, rig);
    }
    return rig;
  }

  /** Keeps `rig` as `who`'s, so the next frame draws her sails on from where another drawing left them. */
  keep(who: string, rig: SailRig): void {
    this.rigs.set(who, rig);
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
