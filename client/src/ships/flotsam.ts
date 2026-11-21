// What a ship sunk leaves on the water: crates, barrels and, for an Elite or greater, a chest, each laid by the fight
// where it went down and bobbing there until it is gathered or the fight is over.
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
/** Its mark stands this far over it and is at least this large (metres), and as large as this share of its distance
 *  from the eye: some ten pixels across at the fight's camera, wherever it lies. */
const MARK_OVER_M = 2.5;
const MARK_M = 0.3;
const MARK_SHARE = 0.008;
const MARK: Mark['colour'] = [1, 0.8, 0.25];

interface Floating {
  readonly id: number;
  readonly at: readonly [number, number];
  readonly item: FlotsamItem;
}

export class Flotsam {
  private readonly floating = new Map<number, Floating>();

  /** A piece laid at `spot` (window metres). */
  lay(id: number, spot: readonly [number, number], item: FlotsamItem): void {
    this.floating.set(id, { id, at: spot, item: item in LOOKS ? item : 'crate' });
  }

  /** A piece gathered: it is gone; answers where it lay (window metres), if it floated. */
  gather(id: number): readonly [number, number] | null {
    const piece = this.floating.get(id);
    this.floating.delete(id);
    return piece?.at ?? null;
  }

  get count(): number {
    return this.floating.size;
  }

  /** Each piece afloat at `now`, low in the water where it lies, drawn `scale` times its size: on the drawn swell
   *  (`water`, its height at a point, window metres) where the page has one, else bobbing on its own; and over each a
   *  gold mark that stands as large on the screen at any distance from `eye`, so a player finds it to gather. */
  marks(
    now: number,
    scale = 1,
    water: ((x: number, y: number) => number) | null = null,
    eye: readonly [number, number, number] | null = null,
  ): Mark[] {
    return [...this.floating.values()].flatMap(({ id, at, item }) => {
      const look = LOOKS[item];
      const phase = (now / BOB_S + id * 0.37) * 2 * Math.PI;
      const surface = water ? water(at[0], at[1]) : Math.sin(phase) * BOB_M * scale;
      const z = surface - look.radius * 0.3 * scale;
      const piece: Mark = {
        x: at[0],
        y: at[1],
        z,
        radius: look.radius * scale,
        colour: look.colour,
        shape: look.shape,
        yaw: id * 1.7 + Math.sin(phase / 2) * SWING,
      };
      const over = z + MARK_OVER_M * scale;
      const away = eye ? Math.hypot(eye[0] - at[0], eye[1] - at[1], eye[2] - over) : 0;
      const mark: Mark = {
        x: at[0],
        y: at[1],
        z: over + Math.sin(phase * 2) * 0.1 * scale,
        radius: Math.max(MARK_M * scale, away * MARK_SHARE),
        colour: MARK,
      };
      return [piece, mark];
    });
  }
}
