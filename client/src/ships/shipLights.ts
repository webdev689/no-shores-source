// A frame's ships' lanterns: how lit each ship's glass burns, the near lanterns' light among the sky's lamps, and the
// far ones' warm points over the water (`GlowPoints`), all where each ship lies now (`lanterns.ts` for the rules).
import type { Gpu } from '../gpu.ts';
import { type GlowPoint, GlowPoints } from '../sky/glowPoints.ts';
import { type LampPlace, SHIP_LAMPS, lampsLit } from '../sky/lamps.ts';
import { SKY_NOW } from '../sky/skyDriver.ts';
import {
  LAMP_COLOUR,
  LAMP_NEAR_M,
  LANTERN_LIGHT,
  LANTERN_OFF_M,
  type Lantern,
  lampAlpha,
  lampPoints,
  lampSize,
  lanternsLit,
} from './lanterns.ts';
import { shipAxes } from './shipAxes.ts';
import type { DrawnShip } from './shipModels.ts';

type Point = readonly [number, number, number];

/** The glow layer draws a point's halo three times its middle: a far lamp's middle is a third of DFO's sprite. */
const HALO_SHARE = 3;

/** `ships` as drawn seen from `eye` under `daylight` (0 night to 1 day), each lantern hung as `lanternsOf` its hull
 *  says (none for a hull not yet come): each ship with how lit her lanterns are; the near lanterns' lamps, those within
 *  LANTERN_OFF_M of the eye along the water; and the far ones' points, up to four a ship, past LAMP_NEAR_M. */
export function shipLanterns(
  ships: readonly DrawnShip[],
  lanternsOf: (hull: number) => readonly Lantern[] | null,
  eye: Point,
  daylight: number,
): { drawn: DrawnShip[]; lamps: LampPlace[]; glows: GlowPoint[] } {
  const lit = lampsLit(daylight);
  const lamps: LampPlace[] = [];
  const glows: GlowPoint[] = [];
  const drawn = ships.map((ship, nth) => {
    const lanterns = lanternsOf(ship.hull);
    if (lit <= 0 || !lanterns || !lanternsLit(ship.look)) return { ...ship, look: { ...ship.look, lanterns: 0 } };
    const { x, y, z, heading, pitch, roll, scale = 1 } = ship.place;
    const axes = shipAxes(heading, pitch, roll);
    const hung = lanterns.map(({ at }): Point => {
      const world = (axis: number) => at.reduce((sum, along, frame) => sum + along * (axes[frame]?.[axis] ?? 0), 0);
      return [x + world(0) * scale, y + world(1) * scale, z + world(2) * scale];
    });
    hung.forEach((place, lantern) => {
      if (Math.hypot(place[0] - eye[0], place[1] - eye[1]) <= LANTERN_OFF_M)
        lamps.push({ at: place, reachM: LANTERN_LIGHT.reachM, light: LANTERN_LIGHT.light, seed: nth * 7 + lantern });
    });
    for (const place of lampPoints(hung)) {
      const distance = Math.hypot(place[0] - eye[0], place[1] - eye[1], place[2] - eye[2]);
      if (distance <= LAMP_NEAR_M) continue;
      const alpha = lampAlpha(distance);
      glows.push({
        at: place,
        colour: [LAMP_COLOUR[0] * alpha, LAMP_COLOUR[1] * alpha, LAMP_COLOUR[2] * alpha],
        sizeM: lampSize(distance) / HALO_SHARE,
        seed: nth,
      });
    }
    return { ...ship, look: { ...ship.look, lanterns: lit } };
  });
  return { drawn, lamps, glows };
}

/** The ships' lanterns over the frames: their lamps handed to the sky's (`SHIP_LAMPS`) and their far points drawn over
 *  the water after it. */
export class ShipLights {
  private readonly gpu: Gpu;
  private glows: GlowPoints | null = null;
  private eye: Point = [0, 0, 0];

  constructor(gpu: Gpu) {
    this.gpu = gpu;
  }

  /** `ships` as this frame draws them from `eye`, their lanterns lit as the sky now is. */
  light(ships: readonly DrawnShip[], lanternsOf: (hull: number) => readonly Lantern[] | null, eye: Point): DrawnShip[] {
    const { drawn, lamps, glows } = shipLanterns(ships, lanternsOf, eye, SKY_NOW.current.look.daylight);
    SHIP_LAMPS.current = lamps;
    this.eye = eye;
    this.glows ??= new GlowPoints(this.gpu, [], [eye[0], eye[1]]);
    this.glows.set(glows, [eye[0], eye[1]]);
    return drawn;
  }

  /** The far lanterns' points over the finished picture `target`, hidden where the scene's `depth` stands nearer. */
  overWater(encoder: GPUCommandEncoder, target: GPUTextureView, fromEye: Float32Array, depth: GPUTexture): void {
    const lit = lampsLit(SKY_NOW.current.look.daylight);
    // The flicker's clock wrapped to an hour, so its beat keeps its precision on the GPU.
    this.glows?.draw(encoder, target, depth, fromEye, this.eye, lit, SKY_NOW.current.worldS % 3600);
  }
}
