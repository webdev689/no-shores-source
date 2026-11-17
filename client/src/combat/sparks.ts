import type { FightEvent } from '../network/messages.ts';
import { EVENT } from './cues.ts';

type Vector = readonly [number, number, number];

/** A spark in flight: where it is, its velocity (metres a second, east, south, up), and its age and life (seconds). */
export interface Spark {
  readonly at: Vector;
  readonly velocity: Vector;
  readonly age: number;
  readonly life: number;
}

/** The sparks each clash of steel throws: a parry's, a block's, a guard broken. */
const THROWN: Readonly<Record<number, number | undefined>> = {
  [EVENT.parried]: 14,
  [EVENT.blocked]: 8,
  [EVENT.guardBroken]: 10,
};
/** Where steel meets steel: this high over the defender's feet and this far toward its striker (metres). */
const CLASH_HEIGHT = 1.3;
const CLASH_TOWARD = 0.45;
/** A spark's speed (metres a second) and its life (seconds), each between these. */
const SPEED = [2.5, 6] as const;
const LIFE = [0.2, 0.45] as const;
export const SPARKS_LONGEST_S = LIFE[1];
const GRAVITY = 9.81;

/** The sparks of the fight's clashes, thrown from where a guard met a blow and flown until they burn out. */
export class Sparks {
  private readonly random: () => number;
  flying: Spark[] = [];

  constructor(random: () => number = Math.random) {
    this.random = random;
  }

  /** Throws each clash's sparks, toward its striker and up; `where` is a fighter's feet, or null for one unknown. */
  struck(events: readonly FightEvent[], where: (id: number) => Vector | null): void {
    for (const event of events) {
      const count = THROWN[event.kind] ?? 0;
      const [defender, striker] = [where(event.defender), where(event.striker)];
      if (count === 0 || !defender || !striker) continue;
      const apart = Math.hypot(striker[0] - defender[0], striker[1] - defender[1]) || 1;
      const toward = [(striker[0] - defender[0]) / apart, (striker[1] - defender[1]) / apart] as const;
      const clash: Vector = [
        defender[0] + toward[0] * CLASH_TOWARD,
        defender[1] + toward[1] * CLASH_TOWARD,
        defender[2] + CLASH_HEIGHT,
      ];
      for (let spark = 0; spark < count; spark++) {
        const between = (range: readonly [number, number]) => range[0] + (range[1] - range[0]) * this.random();
        const spread = [this.random() - 0.5, this.random() - 0.5, this.random() * 0.8 + 0.2] as const;
        const way = [toward[0] + spread[0], toward[1] + spread[1], spread[2]] as const;
        const length = Math.hypot(...way) || 1;
        const speed = between(SPEED);
        const velocity: Vector = [(way[0] / length) * speed, (way[1] / length) * speed, (way[2] / length) * speed];
        this.flying.push({ at: clash, velocity, age: 0, life: between(LIFE) });
      }
    }
  }

  /** Flies every spark on by `seconds`, falling as it goes, and lets go of those burnt out. */
  update(seconds: number): void {
    this.flying = this.flying
      .map(({ at, velocity, age, life }) => ({
        at: [at[0] + velocity[0] * seconds, at[1] + velocity[1] * seconds, at[2] + velocity[2] * seconds] as const,
        velocity: [velocity[0], velocity[1], velocity[2] - GRAVITY * seconds] as const,
        age: age + seconds,
        life,
      }))
      .filter((spark) => spark.age < spark.life);
  }
}
