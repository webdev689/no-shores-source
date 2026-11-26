// What the page draws round foes arriving, in the fight's own pixel marks (lit into the stepped light layer where
// they burn white-hot): an airship's thrusters burning, flames licking aft out of each bell and down out of each lift,
// as hard as it drives; smoke rolling up out of its stacks and off behind it; the beam it lets each foe down in, from
// its hatch to the ground, a ring of light where the foe is built; dust thrown up where a foe lands. A crown's crystal
// drawn in out of the air to its heart as it forms, a thread of its light down to each foe forming under it, and a
// ring of crystal round each one's feet.
import { flicker } from '../light/flicker.ts';
import { type Ramp, POWDER, SMOKE, rampOf } from './markSprites.ts';
import { DUST, layFlat, layLine, layUpright, ringSprite, scorchSprite, starSprite } from './impactPixels.ts';
import { CRYSTAL } from './latticeLooks.ts';

type Point = readonly [number, number, number];

/** A flame's cells (metres a cell), how far a full burn reaches out of its bell and how wide it starts; a lift's the
 *  same down. Smoke's cells, how fast a puff rises (m/s), how long it lives and how big it grows. */
export const LOOKS = {
  flameCell: 0.14,
  flameM: 3.6,
  flameWide: 1.25,
  liftM: 2.6,
  liftWide: 0.9,
  smokeCell: 0.22,
  smokeRise: 2.4,
  smokeLife: 3.2,
  smokeGrow: 2.8,
  beamHalfM: 0.55,
  beamFade: 0.25,
  landDustS: 0.45,
} as const;
/** The beam's light, warm white at its edges and its core, as the player's arrival's cells land white. */
const BEAM = { edge: [1, 0.95, 0.82], core: [1, 0.98, 0.92] } as const;
/** A thruster's fire stepping from white-hot at its throat to the furnace's red at its tip. */
const THRUSTER: Ramp = rampOf('#5a1a06', '#e05a14', '#ffc048', '#fff6dc');

/** A flame of `burn` (0 to 1) out of a bell's mouth at `mouth` along `way` (a unit vector), wide `wide` at the mouth,
 *  long `long` at full burn, flickering by `clock` and `seed`: discs from white-hot to red, smaller as it reaches. */
export function layFlame(
  out: number[],
  eye: Point,
  [mouth, way]: readonly [Point, Point],
  [burn, wide, long]: readonly [number, number, number],
  clock: number,
  seed: number,
): void {
  if (burn <= 0.02) return;
  const steps = [0.05, 0.25, 0.5, 0.78, 1];
  steps.forEach((along, step) => {
    const reach = along * long * burn * flicker(seed * 8 + step, clock, 1.8);
    const disc: Point = [mouth[0] + way[0] * reach, mouth[1] + way[1] * reach, mouth[2] + way[2] * reach];
    const radius = Math.max(1, Math.round(((wide * (1 - along * 0.75)) / LOOKS.flameCell) * (0.6 + 0.4 * burn)));
    // The throat white-hot, the tip down to the furnace's red.
    const stop = Math.max(0, 3 - Math.floor(along * 3.2));
    layUpright(out, scorchSprite(radius, stop), THRUSTER, disc, eye, LOOKS.flameCell);
  });
}

/** One puff of smoke out of a stack: where it began and when, and which way it drifts (m/s). */
export interface Puff {
  readonly from: Point;
  readonly born: number;
  readonly drift: readonly [number, number];
}

/** Each puff still living at `clock`, rising and drifting, growing and thinning as it goes. */
export function layPuffs(out: number[], eye: Point, puffs: readonly Puff[], clock: number): void {
  for (const puff of puffs) {
    const age = clock - puff.born;
    if (age < 0 || age > LOOKS.smokeLife) continue;
    const share = age / LOOKS.smokeLife;
    const place: Point = [
      puff.from[0] + puff.drift[0] * age,
      puff.from[1] + puff.drift[1] * age,
      puff.from[2] + LOOKS.smokeRise * age,
    ];
    const radius = Math.round((0.5 + LOOKS.smokeGrow * share) / LOOKS.smokeCell);
    layUpright(out, scorchSprite(radius, share < 0.3 ? 1 : 0), SMOKE, place, eye, LOOKS.smokeCell, 0.75 * (1 - share));
  }
}

/** The beam a foe is let down in, from the ship's hatch at `hatch` to the foe's feet at `feet`, `left` of it still
 *  to come (1 none of the foe yet to 0 whole): two hot edges and a core, a ring of light at the feet widening as it
 *  is built, fading over the last of its time. */
export function layBeam(out: number[], eye: Point, hatch: Point, feet: Point, left: number): void {
  const fade = Math.min(1, left / LOOKS.beamFade);
  if (fade <= 0) return;
  const [toX, toY] = [feet[0] - eye[0], feet[1] - eye[1]];
  const apart = Math.hypot(toX, toY) || 1;
  // Its edges either side of it as the eye sees it.
  const [sideX, sideY] = [(-toY / apart) * LOOKS.beamHalfM, (toX / apart) * LOOKS.beamHalfM];
  const edge = BEAM.edge.map((part) => part * (0.6 + 0.4 * fade)) as unknown as Point;
  for (const side of [-1, 1]) {
    const top: Point = [hatch[0] + sideX * side * 0.6, hatch[1] + sideY * side * 0.6, hatch[2]];
    const foot: Point = [feet[0] + sideX * side, feet[1] + sideY * side, feet[2]];
    layLine(out, eye, top, foot, 0.05 + 0.04 * fade, edge);
  }
  layLine(out, eye, hatch, feet, 0.12 * fade, BEAM.core);
  const ring = Math.max(2, Math.round(6 + 10 * (1 - left)));
  layFlat(out, ringSprite(ring, 3, 1), POWDER, feet, 0.06);
}

/** How many steps dust thrown up passes through as it spreads: each its own ring's sprite, made once and kept. */
const DUST_STEPS = 8;

/** Dust thrown up round a foe's feet `since` seconds after it landed. */
export function layLanding(out: number[], feet: Point, since: number): void {
  if (since < 0 || since > LOOKS.landDustS) return;
  const share = Math.round((since / LOOKS.landDustS) * DUST_STEPS) / DUST_STEPS;
  layFlat(out, ringSprite(Math.round(8 + 14 * share), share < 0.5 ? 2 : 1, 2, share), DUST, feet, 0.06);
}

/** A crown's crystal drawn in out of the air toward its heart at `heart`, `done` of the way (0 to 1). */
export function layGathering(out: number[], eye: Point, heart: Point, done: number, turn: number): void {
  if (done >= 1) return;
  const ramp = CRYSTAL.red;
  for (let nth = 0; nth < 12; nth++) {
    const angle = turn + (nth * Math.PI * 2) / 12;
    const reach = 6 * (1 - done) ** 1.6;
    const rise = (nth % 3) - 1;
    const mote: Point = [
      heart[0] + Math.cos(angle) * reach,
      heart[1] + Math.sin(angle) * reach,
      heart[2] + rise * reach * 0.4,
    ];
    layUpright(out, starSprite(1 + (nth % 2)), ramp, mote, eye, 0.07);
  }
}

/** A thread of a crown's light down from its heart at `heart` to a foe forming at `feet`, `left` of it still to come,
 *  and a ring of crystal round its feet. */
export function layForming(out: number[], eye: Point, heart: Point, feet: Point, left: number): void {
  if (left <= 0) return;
  const ramp = CRYSTAL.red;
  const head: Point = [feet[0], feet[1], feet[2] + 1.9];
  layLine(out, eye, heart, head, 0.05 + 0.05 * left, ramp[3]);
  layLine(out, eye, heart, head, 0.16 * left, ramp[2]);
  layFlat(out, ringSprite(Math.round(9 + 6 * (1 - left)), 2, 2, 0.3), ramp, feet, 0.06);
}
