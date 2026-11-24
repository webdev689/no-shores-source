// What the game draws over a Lattice foe's blow as it plays, since a picture's light cannot change from frame to
// frame: its crystal gathering where the blow comes from through its tell, the cut it strikes (a rush's streak for the
// Husk's lunge and gore, and the Heart's stomp), and a ring of shards breaking up on the ground where it lands. Laid
// as latticeLooks.ts lays the rest, in the foe's crystal and scaled to it. Drawing only: the rules are the room's.
import { layFlat, layLine, layUpright, ringSprite, slashSprite, starSprite } from './impactPixels.ts';
import { TELL_SHARE } from './lattice.ts';
import type { Ramp } from './markSprites.ts';
import { BODY, CELL_M, DARK, HOT, LIGHT } from './spellPixels.ts';

type Point = readonly [number, number, number];
type Spot = readonly [number, number];

/** How a blow is drawn on a man-sized foe: where its crystal gathers (forward of its feet and up, metres); the cut it
 *  strikes, its turn in sixteenths of a turn from flat and its length in cells, or null for a rush's streak; how far
 *  ahead of its feet it lands (metres) and its ring of shards there (cells across its middle). */
interface Blow {
  readonly gathers: Spot;
  readonly cut: readonly [number, number] | null;
  readonly lands: number;
  readonly ring: number;
}

/** Each blow of the six foes' moves (Lattice.md), by its move. */
export const BLOWS: Readonly<Record<string, Blow>> = {
  husk_lunge: { gathers: [0.45, 1.25], cut: null, lands: 1.1, ring: 6 },
  husk_gore: { gathers: [0.45, 1.25], cut: null, lands: 1.0, ring: 7 },
  flicker_slash_left: { gathers: [0.5, 1.5], cut: [2, 22], lands: 0.9, ring: 4 },
  flicker_slash_right: { gathers: [0.5, 1.5], cut: [6, 22], lands: 0.9, ring: 4 },
  flicker_overhead: { gathers: [0.3, 2.0], cut: [4, 26], lands: 1.0, ring: 6 },
  ravager_maul: { gathers: [0.4, 1.45], cut: [6, 20], lands: 0.9, ring: 7 },
  bulwark_sweep: { gathers: [0.6, 1.3], cut: [0, 30], lands: 1.2, ring: 8 },
  bulwark_slam: { gathers: [0.5, 2.3], cut: [4, 24], lands: 1.2, ring: 12 },
  heart_slam: { gathers: [0.6, 2.4], cut: [4, 30], lands: 1.4, ring: 14 },
  heart_sweep: { gathers: [0.7, 1.4], cut: [0, 34], lands: 1.4, ring: 10 },
  heart_stomp: { gathers: [0.3, 0.6], cut: null, lands: 0.6, ring: 16 },
};

/** Through a move, by the share of its frames played at a frame's start: its tell gathers through the frames the rules
 *  hold a telegraphed blow in (lattice.ts), the strike runs until it lands, and the landing's ring breaks up until it
 *  is gone. */
const SHARES = { lands: 0.55, gone: 0.8 } as const;

/** Where frame `frame` of a blow `frames` long stands: in its tell, its strike, its landing, or past them all. */
export function blowPhase(frame: number, frames: number): 'tell' | 'strike' | 'lands' | null {
  const share = frame / frames;
  return share <= TELL_SHARE ? 'tell' : share < SHARES.lands ? 'strike' : share < SHARES.gone ? 'lands' : null;
}
/** A rush's streak runs this far back from where the crystal gathers (metres, on a man-sized foe). */
const STREAK_BACK_M = 0.9;

/**
 * What a Lattice foe's blow draws in its frame: `place` stands a spot of a man-sized foe where this one stands and
 * faces, `feet` where its feet are, `scale` how many times a man it is, `ramp` its crystal's, seen from `eye`.
 */
export function layLatticeStrike(
  out: number[],
  anim: string,
  [frame, frames]: readonly [number, number],
  place: (spot: Spot) => Point,
  { scale, ramp, eye }: { readonly scale: number; readonly ramp: Ramp; readonly eye: Point },
): void {
  const blow = BLOWS[anim];
  if (!blow || frames <= 0) return;
  const share = frame / frames;
  const phase = blowPhase(frame, frames);
  const cell = CELL_M * scale;
  const gathers = place(blow.gathers);
  if (phase === 'tell') {
    // The tell: a star of its crystal growing where the blow comes from.
    layUpright(out, starSprite(1 + Math.round((3 * share) / TELL_SHARE)), ramp, gathers, eye, cell);
  } else if (phase === 'strike') {
    if (blow.cut) {
      layUpright(out, slashSprite(blow.cut[0], blow.cut[1], HOT), ramp, gathers, eye, cell);
    } else {
      const back = place([blow.gathers[0] - STREAK_BACK_M, blow.gathers[1] * 0.8]);
      layLine(out, eye, back, gathers, 0.12 * scale, ramp[DARK]);
      layLine(out, eye, back, gathers, 0.05 * scale, ramp[LIGHT]);
    }
  } else if (phase === 'lands') {
    // Where it lands: a ring of shards on the ground, widening and breaking up, a flash at its heart.
    const landed = (share - SHARES.lands) / (SHARES.gone - SHARES.lands);
    const ground = place([blow.lands, 0]);
    const ring = ringSprite(blow.ring * (0.6 + 0.6 * landed), landed < 0.5 ? LIGHT : BODY, 2, landed * 0.6, blow.ring);
    layFlat(out, ring, ramp, ground, cell);
    if (landed < 0.5) layUpright(out, starSprite(2), ramp, [ground[0], ground[1], ground[2] + 0.2 * scale], eye, cell);
  }
}
