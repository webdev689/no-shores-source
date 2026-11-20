// The prologue's tasks on the wreck. Waking, the player has time to breathe and learn the controls: each is a step
// ticked off once they do it, read from what their body and their fight did, so it serves any input. Foes standing
// further on, fighting the crew, leave the lessons up; once all are done, or a foe comes at the player, the fight's own
// task takes over. The boss fight has its own.
import type { Quest, Step } from '../tasks.ts';

/** The quest the prologue's tasks stand under. */
export const QUEST = 'Prologue';

/** How far the player walks, metres, and how far they turn the view, radians, before each counts as learned. */
const MOVED_M = 2;
const LOOKED_RAD = 1;
/** How long the lessons stay up once all are met, seconds, so the last one is seen ticked. */
const MET_HOLD_S = 1.5;

/** What the player did this frame, as the lessons read it: the frame's length, where they stand, where the view
 *  looks, what their fight is doing, how many hostile foes stand alive, whether one has the player as its target, and
 *  whether the boss fight is on. */
export interface Done {
  readonly seconds: number;
  readonly x: number;
  readonly y: number;
  readonly yaw: number;
  readonly action: string | undefined;
  readonly foes: number;
  readonly engaged: boolean;
  readonly boss: boolean;
}

/** The lessons in the order they are met in `frame`, each with its words and keys, as foot's keys name them (hints.ts). */
const LESSONS = [
  { text: 'Move', keys: ['W', 'A', 'S', 'D'] },
  { text: 'Look round', keys: ['Mouse'] },
  { text: 'Attack', keys: ['Right button'] },
  { text: 'Block or dodge', keys: ['F', 'V'] },
] as const;
const GUARDS = new Set(['guard', 'parry', 'dodge']);

export class Lessons {
  private from: readonly [number, number] | null = null;
  private lastYaw: number | null = null;
  private turned = 0;
  private readonly learned = [false, false, false, false];
  private metFor = 0;
  /** Whether the fight's task has taken over: it never goes back to the lessons. */
  private fighting = false;

  /** The tasks as they stand after `done`. */
  frame(done: Done): Quest {
    // Lying dead the player is raised at a checkpoint: their walk and their turn are counted again from where they rise.
    const dead = done.action === 'dead';
    this.from = dead ? null : (this.from ?? [done.x, done.y]);
    if (this.lastYaw !== null && !dead)
      this.turned += Math.abs(Math.atan2(Math.sin(done.yaw - this.lastYaw), Math.cos(done.yaw - this.lastYaw)));
    this.lastYaw = dead ? null : done.yaw;
    const met = [
      !!this.from && Math.hypot(done.x - this.from[0], done.y - this.from[1]) >= MOVED_M,
      this.turned >= LOOKED_RAD,
      done.action === 'attack',
      GUARDS.has(done.action ?? ''),
    ];
    met.forEach((now, index) => (this.learned[index] ||= now));
    if (done.boss) return { name: QUEST, task: 'Face Captain Brannoc Thule', steps: [] };
    if (this.learned.every(Boolean)) this.metFor += done.seconds;
    if (done.engaged || this.metFor >= MET_HOLD_S) this.fighting = true;
    if (this.fighting) {
      const steps: Step[] = done.foes > 0 ? [{ text: 'Foes standing', count: done.foes }] : [];
      return { name: QUEST, task: 'Fight your way through the wreck', steps };
    }
    return {
      name: QUEST,
      task: 'Learn the controls',
      steps: LESSONS.map((lesson, index) => ({ ...lesson, done: this.learned[index] ?? false })),
    };
  }
}
