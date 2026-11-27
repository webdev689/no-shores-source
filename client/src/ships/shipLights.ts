// A frame's far ships' lanterns at night: warm points over the water (`GlowPoints`), up to four a ship, where each
// ship lies now (`lanterns.ts` for the rules). Near, each lantern burns and lights as its ship draws it
// (`shipModels.ts`).
import type { Gpu } from '../gpu.ts';
import { type GlowPoint, GlowPoints } from '../sky/glowPoints.ts';
import { lampsLit } from '../sky/lamps.ts';
import { SKY_NOW } from '../sky/skyDriver.ts';
import { LAMP_COLOUR, LAMP_NEAR_M, lampAlpha, lampPoints, lampSize, lanternsLit } from './lanterns.ts';
import { shipAxes } from './shipAxes.ts';
import type { DrawnShip } from './shipModels.ts';

type Point = readonly [number, number, number];

/** The glow layer draws a point's halo three times its middle: a far lamp's middle is a third of DFO's sprite. */
const HALO_SHARE = 3;

/** The far points of `ships` as drawn seen from `eye` under `daylight` (0 night to 1 day), each ship's lanterns where
 *  `lanternsOf` its hull says they burn (none for a hull not yet come): up to four a lit ship, past LAMP_NEAR_M, none
 *  by day. */
export function shipLanterns(
  ships: readonly DrawnShip[],
  lanternsOf: (hull: number) => readonly Point[] | null,
  eye: Point,
  daylight: number,
): GlowPoint[] {
  const glows: GlowPoint[] = [];
  if (lampsLit(daylight) <= 0) return glows;
  ships.forEach((ship, nth) => {
    const lanterns = lanternsOf(ship.hull);
    if (!lanterns || !lanternsLit(ship.look)) return;
    const { x, y, z, heading, pitch, roll, scale = 1 } = ship.place;
    const axes = shipAxes(heading, pitch, roll);
    const hung = lanterns.map((middle): Point => {
      const world = (axis: number) => middle.reduce((sum, along, frame) => sum + along * (axes[frame]?.[axis] ?? 0), 0);
      return [x + world(0) * scale, y + world(1) * scale, z + world(2) * scale];
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
  });
  return glows;
}

/** The far ships' lanterns over the frames: their points drawn over the water after it. */
export class ShipLights {
  private readonly gpu: Gpu;
  private glows: GlowPoints | null = null;
  private eye: Point = [0, 0, 0];

  constructor(gpu: Gpu) {
    this.gpu = gpu;
  }

  /** `ships` as this frame draws them from `eye`, their lanterns lit as the sky now is. */
  light(ships: readonly DrawnShip[], lanternsOf: (hull: number) => readonly Point[] | null, eye: Point): void {
    const glows = shipLanterns(ships, lanternsOf, eye, SKY_NOW.current.look.daylight);
    this.eye = eye;
    this.glows ??= new GlowPoints(this.gpu, [], [eye[0], eye[1]]);
    this.glows.set(glows, [eye[0], eye[1]]);
  }

  /** The far lanterns' points over the finished picture `target`, hidden where the scene's `depth` stands nearer. */
  overWater(encoder: GPUCommandEncoder, target: GPUTextureView, fromEye: Float32Array, depth: GPUTexture): void {
    const lit = lampsLit(SKY_NOW.current.look.daylight);
    // The flicker's clock wrapped to an hour, so its beat keeps its precision on the GPU.
    this.glows?.draw(encoder, target, depth, fromEye, this.eye, lit, SKY_NOW.current.worldS % 3600);
  }
}
