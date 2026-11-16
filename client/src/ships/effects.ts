import type { FightEvent, Point } from '../rules/fightRules.ts';

/** A small sphere drawn for a moment: where (window metres, its height as drawn), how big and what colour. */
export interface Mark {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly radius: number;
  readonly colour: readonly [number, number, number];
}

/** A push on the water's ripples where a ball fell. */
export interface Splash {
  readonly x: number;
  readonly y: number;
  readonly radiusM: number;
  readonly strength: number;
}

/** A puff: where and when it began (window metres, metres up), its velocity, its radius and growth, whether it falls,
 *  its colour and how long it lasts (seconds). */
interface Puff {
  readonly from: readonly [number, number, number];
  readonly velocity: readonly [number, number, number];
  readonly radius: number;
  readonly grow: number;
  readonly falls: boolean;
  readonly colour: readonly [number, number, number];
  readonly born: number;
  readonly life: number;
}

const GRAVITY = 9.81;
const FLASH = [1, 0.72, 0.3] as const;
const SMOKE = [0.72, 0.72, 0.72] as const;
const DARK_SMOKE = [0.3, 0.3, 0.3] as const;
const SPRAY = [0.9, 0.95, 1] as const;
const DUST = [0.55, 0.47, 0.36] as const;
const SPLINTER = [0.45, 0.3, 0.16] as const;
const CANVAS = [0.92, 0.9, 0.82] as const;
const FLAME = [1, 0.45, 0.12] as const;
/** Flames and smoke a burning ship sends up a second, for each fire aboard. */
const FLAMES_PER_S = 12;

/** What a fight shows round its ships: each event's flash, smoke, spray, splinters or dust, and the fires aboard,
 *  each a few spheres moving on their own for a moment. Only the look of it: the rules decide what happened. */
export class Effects {
  private puffs: Puff[] = [];
  private seed: number;
  private owedFlames = 0;

  constructor(seed: number) {
    this.seed = seed >>> 0 || 1;
  }

  /** A draw in [0, 1): the variety of the spray, not anything the fight decides. */
  private draw(): number {
    this.seed = (Math.imul(this.seed, 1_664_525) + 1_013_904_223) >>> 0;
    return this.seed / 4_294_967_296;
  }

  private spread(most: number): number {
    return (this.draw() * 2 - 1) * most;
  }

  private add(
    count: number,
    spot: readonly [number, number, number],
    now: number,
    make: (index: number) => Omit<Puff, 'from' | 'born'>,
  ): void {
    for (let index = 0; index < count; index++) this.puffs.push({ ...make(index), from: spot, born: now });
  }

  /** The events of a step, at `now` (seconds of the page): what each shows, and the splashes' pushes on the water.
   *  `toWindow` carries a world point into the window. */
  take(
    events: readonly FightEvent[],
    now: number,
    toWindow: (point: Point) => readonly [number, number, number],
  ): Splash[] {
    const splashes: Splash[] = [];
    for (const event of events) {
      if (event.kind === 'muzzle') {
        const spot = toWindow(event.point);
        const speed = Math.hypot(event.launch[0], event.launch[1]) || 1;
        const out = [event.launch[0] / speed, event.launch[1] / speed] as const;
        this.add(1, spot, now, () => ({
          velocity: [0, 0, 0],
          radius: 0.25,
          grow: 2.5,
          falls: false,
          colour: FLASH,
          life: 0.12,
        }));
        this.add(5, spot, now, (index) => ({
          velocity: [
            out[0] * (0.6 + index * 0.35) + this.spread(0.2),
            out[1] * (0.6 + index * 0.35) + this.spread(0.2),
            0.4,
          ],
          radius: 0.2,
          grow: 0.55,
          falls: false,
          colour: SMOKE,
          life: 2.5,
        }));
      } else if (event.kind === 'splash') {
        const spot = toWindow(event.point);
        splashes.push({ x: spot[0], y: spot[1], radiusM: 1.2, strength: -0.05 });
        this.add(7, spot, now, () => ({
          velocity: [this.spread(1.4), this.spread(1.4), 4 + this.draw() * 3],
          radius: 0.12,
          grow: 0.1,
          falls: true,
          colour: SPRAY,
          life: 1.2,
        }));
      } else if (event.kind === 'land') {
        this.add(4, toWindow(event.point), now, () => ({
          velocity: [this.spread(0.6), this.spread(0.6), 0.5 + this.draw()],
          radius: 0.3,
          grow: 0.6,
          falls: false,
          colour: DUST,
          life: 1.4,
        }));
      } else if (event.kind === 'hit') {
        const spot = toWindow(event.point);
        const canvas = event.zone === 'rig';
        this.add(canvas ? 6 : 9, spot, now, () => ({
          velocity: [
            this.spread(canvas ? 1.5 : 4),
            this.spread(canvas ? 1.5 : 4),
            canvas ? this.draw() : 2 + this.draw() * 3,
          ],
          radius: canvas ? 0.07 : 0.05,
          grow: 0,
          falls: true,
          colour: canvas ? CANVAS : SPLINTER,
          life: canvas ? 1.8 : 1.2,
        }));
        if (!canvas)
          this.add(2, spot, now, () => ({
            velocity: [0, 0, 0.6],
            radius: 0.25,
            grow: 0.5,
            falls: false,
            colour: SMOKE,
            life: 2,
          }));
      }
    }
    return splashes;
  }

  /** A ship's fires over `seconds`: flames and dark smoke up from her deck at `deck` (window metres, metres up). */
  burn(deck: readonly [number, number, number], fires: number, now: number, seconds: number): void {
    if (fires <= 0) return;
    this.owedFlames += FLAMES_PER_S * fires * seconds;
    while (this.owedFlames >= 1) {
      this.owedFlames -= 1;
      const spot = [deck[0] + this.spread(1.5), deck[1] + this.spread(1.5), deck[2]] as const;
      this.add(1, spot, now, () => ({
        velocity: [0, 0, 1.2],
        radius: 0.18,
        grow: 0.3,
        falls: false,
        colour: FLAME,
        life: 0.6,
      }));
      this.add(1, spot, now, () => ({
        velocity: [this.spread(0.2), this.spread(0.2), 1.6],
        radius: 0.3,
        grow: 0.8,
        falls: false,
        colour: DARK_SMOKE,
        life: 3,
      }));
    }
  }

  /** Every puff still showing at `now`, where it is then; the spent are let go. */
  marks(now: number): Mark[] {
    this.puffs = this.puffs.filter((puff) => now - puff.born < puff.life);
    return this.puffs
      .filter((puff) => now >= puff.born)
      .map((puff) => {
        const age = now - puff.born;
        const fall = puff.falls ? (GRAVITY * age * age) / 2 : 0;
        // Each shrinks away over the last third of its life.
        const fade = Math.min(1, (3 * (puff.life - age)) / puff.life);
        return {
          x: puff.from[0] + puff.velocity[0] * age,
          y: puff.from[1] + puff.velocity[1] * age,
          z: puff.from[2] + puff.velocity[2] * age - fall,
          radius: (puff.radius + puff.grow * age) * fade,
          colour: puff.colour,
        };
      });
  }
}
