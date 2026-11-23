// The sea fight's eye shaken, after DFO's (navalHost.js and navalFeel.js through its camera shaker): each of its guns
// kicks it as it goes, a ball striking the ship jars it, a fall alongside rocks it, a magazine going up near the ship
// throws it. Each jar swells over a moment and dies away over another, moving the eye a little and turning it a little,
// the jars at once added together. The game's own noise: a few slow waves at each jar's own phases.

/** DFO's shaker: the most a jar may be, how rough it is (waves a second, about), how long it swells and dies away
 *  (seconds), and how far a jar of one moves the eye (metres) and turns it (degrees) at most either way. */
export const SHAKE = { most: 10, roughness: 10, inS: 0.3, outS: 0.5, metres: 0.15, degrees: 1 } as const;
/** DFO's jars: a long gun of its own firing, a ball striking it or holing it, a fall alongside at its nearest, and a
 *  magazine going up at its side, less to none at its reach (metres). */
export const KICKS = { gun: 1.1, hit: 1.6, holed: 2.5, near: 0.7, magazine: 2.4, magazineReachM: 160 } as const;

/** Where the eye is moved (metres east, south and up) and turned (radians of yaw and pitch). */
export interface Jar {
  readonly east: number;
  readonly south: number;
  readonly up: number;
  readonly yaw: number;
  readonly pitch: number;
}

const STILL: Jar = { east: 0, south: 0, up: 0, yaw: 0, pitch: 0 };

export class Shake {
  private jars: { readonly magnitude: number; readonly born: number; readonly phase: number }[] = [];
  private seed: number;

  constructor(seed: number) {
    this.seed = seed >>> 0 || 1;
  }

  /** A jar of `magnitude` at `now` (seconds). */
  kick(magnitude: number, now: number): void {
    if (!(magnitude > 0)) return;
    this.seed = (Math.imul(this.seed, 1_664_525) + 1_013_904_223) >>> 0;
    this.jars.push({ magnitude: Math.min(SHAKE.most, magnitude), born: now, phase: this.seed / 65_536 });
  }

  /** The jars among a frame's `cues` (the feel's, a jar's carrying its `kick`), each at `now`. */
  take(cues: readonly { readonly kick?: number }[], now: number): void {
    for (const { kick } of cues) if (kick !== undefined) this.kick(kick, now);
  }

  /** How the eye is shaken at `now`: every jar still going, added together; the spent let go. */
  jarAt(now: number): Jar {
    this.jars = this.jars.filter((jar) => now - jar.born < SHAKE.inS + SHAKE.outS);
    if (this.jars.length === 0) return STILL;
    const sum = [0, 0, 0, 0, 0];
    const strengths = this.jars.map((jar) => {
      const age = now - jar.born;
      const swell = age < 0 ? 0 : age < SHAKE.inS ? age / SHAKE.inS : 1 - (age - SHAKE.inS) / SHAKE.outS;
      return jar.magnitude * Math.max(0, swell);
    });
    // The jars at once add together, never past the most.
    const held = Math.min(
      1,
      SHAKE.most /
        Math.max(
          1e-9,
          strengths.reduce((total, each) => total + each, 0),
        ),
    );
    for (const [index, jar] of this.jars.entries()) {
      const age = now - jar.born;
      const strength = (strengths[index] ?? 0) * held;
      for (let axis = 0; axis < 5; axis++) {
        const turn = 2 * Math.PI * SHAKE.roughness * 0.5 * age + jar.phase * (axis + 1);
        // Two waves a step apart, each within a quarter either way: the whole within a half, as the shaker's noise.
        const wave = (Math.sin(turn) + Math.sin(turn * 1.7 + axis)) / 4;
        sum[axis] = (sum[axis] ?? 0) + wave * strength;
      }
    }
    const [east = 0, south = 0, up = 0, yaw = 0, pitch = 0] = sum;
    const degree = Math.PI / 180;
    return {
      east: east * SHAKE.metres,
      south: south * SHAKE.metres,
      up: up * SHAKE.metres,
      yaw: yaw * SHAKE.degrees * degree,
      pitch: pitch * SHAKE.degrees * degree,
    };
  }
}
