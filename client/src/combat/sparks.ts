import { GLOW_BURSTS, type GlowElement } from '../elementGlow.ts';

type Vector = readonly [number, number, number];

/** A spark in flight: where it is, its velocity (metres a second, east, south, up), its age and life (seconds), and
 *  the element it burns in, if any. */
export interface Spark {
  readonly at: Vector;
  readonly velocity: Vector;
  readonly age: number;
  readonly life: number;
  readonly look?: GlowElement;
}

/** A spark's speed (metres a second) and its life (seconds), each between these. */
const SPEED = [2.5, 6] as const;
const LIFE = [0.2, 0.45] as const;
export const SPARKS_LONGEST_S = LIFE[1];
const GRAVITY = 9.81;
/** A shot in its element trails this many motes a second, at this share of its element's burst's speed. */
const TRAIL_MOTES = 30;
const TRAIL_SLOW = 0.1;

/** The sparks of shots come to rest and the motes an element's shots trail, flown until they burn out. */
export class Sparks {
  private readonly random: () => number;
  flying: Spark[] = [];

  constructor(random: () => number = Math.random) {
    this.random = random;
  }

  /** Throws `count` sparks from `from`, up and along `toward` (a way over the ground, east and south): steel's, or
   *  motes of `look` at its burst's speeds and lives, `slow` of their speed. */
  burst(from: Vector, toward: readonly [number, number], count: number, look?: GlowElement, slow = 1): void {
    const { speed: speeds, life: lives } = look ? GLOW_BURSTS[look] : { speed: SPEED, life: LIFE };
    for (let spark = 0; spark < count; spark++) {
      const between = (range: readonly [number, number]) => range[0] + (range[1] - range[0]) * this.random();
      const spread = [this.random() - 0.5, this.random() - 0.5, this.random() * 0.8 + 0.2] as const;
      const way = [toward[0] + spread[0], toward[1] + spread[1], spread[2]] as const;
      const length = Math.hypot(...way) || 1;
      const speed = between(speeds) * slow;
      const velocity: Vector = [(way[0] / length) * speed, (way[1] / length) * speed, (way[2] / length) * speed];
      this.flying.push({ at: from, velocity, age: 0, life: between(lives), ...(look ? { look } : {}) });
    }
  }

  /** Trails motes of `look` off a shot at `from` for `seconds` of its flight. */
  trail(from: Vector, look: GlowElement, seconds: number): void {
    this.burst(from, [0, 0], Math.floor(TRAIL_MOTES * seconds + this.random()), look, TRAIL_SLOW);
  }

  /** Flies every spark on by `seconds`, falling as it goes (an element's motes held up by its lift), and lets go of
   *  those burnt out. */
  update(seconds: number): void {
    this.flying = this.flying
      .map((spark) => {
        const { at: place, velocity, age, look } = spark;
        const fall = GRAVITY - (look ? GLOW_BURSTS[look].lift : 0);
        return {
          ...spark,
          at: [
            place[0] + velocity[0] * seconds,
            place[1] + velocity[1] * seconds,
            place[2] + velocity[2] * seconds,
          ] as const,
          velocity: [velocity[0], velocity[1], velocity[2] - fall * seconds] as const,
          age: age + seconds,
        };
      })
      .filter((spark) => spark.age < spark.life);
  }
}
