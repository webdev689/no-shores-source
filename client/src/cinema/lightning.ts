// The storm's lightning: strikes at seeded moments round the eye, each a flicker of light (a sharp flash, a dip, a
// second flash), a bolt down to its point for a few frames, and its thunder heard as late as its distance makes it.
// A story can also call a strike where it wants one, to cover a cut or light a ship coming out of the dark.

/** A strike: when it began (seconds), where it came down (world metres) and its seed, for the bolt's fork. */
interface Strike {
  readonly at: number;
  readonly x: number;
  readonly y: number;
  readonly seed: number;
}

/** A strike's light over its first seconds: two flashes and a fading glow. */
export function flashAt(into: number): number {
  if (into < 0 || into > 0.9) return 0;
  if (into < 0.06) return 1;
  if (into < 0.13) return 0.25;
  if (into < 0.21) return 0.85;
  return 0.6 * Math.exp(-(into - 0.21) * 7);
}

/** How long the bolt itself is seen, seconds. */
const BOLT_S = 0.22;
/** The gap between strikes, seconds, at its least and its most, and how far from the eye they fall, metres. */
const GAP_S = [4, 11] as const;
const FAR_M = [400, 4500] as const;

/** A small seeded stream of numbers in [0, 1). */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

export class Lightning {
  private readonly draw: () => number;
  private readonly thunder: (distanceKm: number) => void;
  private strikes: Strike[] = [];
  private clock = 0;
  private nextAt: number;
  /** Whether strikes come by themselves; a story may hold them off and call its own. */
  on = false;

  constructor(seed: number, thunder: (distanceKm: number) => void) {
    this.draw = seeded(seed);
    this.thunder = thunder;
    this.nextAt = GAP_S[0];
  }

  /** A strike now at (x, y), heard from `eye`. */
  strike(x: number, y: number, eye: readonly [number, number]): void {
    this.strikes.push({ at: this.clock, x, y, seed: Math.floor(this.draw() * 1e6) });
    this.thunder(Math.hypot(x - eye[0], y - eye[1]) / 1000);
  }

  /** Steps the storm by a frame round `eye`: a strike when its time comes; the light and the bolt now. */
  step(
    seconds: number,
    eye: readonly [number, number],
  ): {
    readonly flash: number;
    readonly bolt: { readonly x: number; readonly y: number; readonly seed: number } | null;
  } {
    this.clock += seconds;
    if (this.on && this.clock >= this.nextAt) {
      const bearing = this.draw() * Math.PI * 2;
      const away = FAR_M[0] + this.draw() * (FAR_M[1] - FAR_M[0]);
      this.strike(eye[0] + Math.sin(bearing) * away, eye[1] - Math.cos(bearing) * away, eye);
      this.nextAt = this.clock + GAP_S[0] + this.draw() * (GAP_S[1] - GAP_S[0]);
    }
    this.strikes = this.strikes.filter((strike) => this.clock - strike.at < 1);
    let flash = 0;
    let bolt: { x: number; y: number; seed: number } | null = null;
    for (const strike of this.strikes) {
      const into = this.clock - strike.at;
      // A far strike lights the sky less than one overhead.
      const near = 1 / (1 + Math.hypot(strike.x - eye[0], strike.y - eye[1]) / 2500);
      flash = Math.max(flash, flashAt(into) * (0.45 + 0.55 * near));
      if (into < BOLT_S) bolt = { x: strike.x, y: strike.y, seed: strike.seed };
    }
    return { flash, bolt };
  }
}
