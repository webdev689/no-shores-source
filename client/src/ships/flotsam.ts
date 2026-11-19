// What a ship sunk leaves on the water: crates, barrels and, for an Elite or greater, a chest, each laid by the fight
// where she went down and bobbing there until it is gathered or the fight is over.
import type { Mark } from './effects.ts';
import type { MarkShape } from './markView.ts';

export type FlotsamItem = 'crate' | 'barrel' | 'chest';

/** How each floats: its shape, its size (metres, a cube's half side, a drum's radius) and its timber. */
const LOOKS: Readonly<Record<FlotsamItem, { shape: MarkShape; radius: number; colour: Mark['colour'] }>> = {
  crate: { shape: 'box', radius: 0.35, colour: [0.58, 0.42, 0.24] },
  barrel: { shape: 'drum', radius: 0.3, colour: [0.42, 0.27, 0.14] },
  chest: { shape: 'chest', radius: 0.35, colour: [0.3, 0.17, 0.09] },
};
/** Each rides this far up and down (metres), once in this long (seconds), and swings about this far (radians). */
const BOB_M = 0.12;
const BOB_S = 4;
const SWING = 0.25;

interface Floating {
  readonly id: number;
  readonly at: readonly [number, number];
  readonly item: FlotsamItem;
}

export class Flotsam {
  private readonly floating = new Map<number, Floating>();

  /** A piece laid at `at` (window metres). */
  lay(id: number, at: readonly [number, number], item: FlotsamItem): void {
    this.floating.set(id, { id, at, item: item in LOOKS ? item : 'crate' });
  }

  gather(id: number): void {
    this.floating.delete(id);
  }

  get count(): number {
    return this.floating.size;
  }

  /** Each piece afloat at `now`, low in the water and bobbing, drawn `scale` times its size. */
  marks(now: number, scale = 1): Mark[] {
    return [...this.floating.values()].map(({ id, at, item }) => {
      const look = LOOKS[item];
      const phase = (now / BOB_S + id * 0.37) * 2 * Math.PI;
      return {
        x: at[0],
        y: at[1],
        z: (Math.sin(phase) * BOB_M - look.radius * 0.3) * scale,
        radius: look.radius * scale,
        colour: look.colour,
        shape: look.shape,
        yaw: id * 1.7 + Math.sin(phase / 2) * SWING,
      };
    });
  }
}
