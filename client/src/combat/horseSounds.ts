// A horse's sounds, from Freesound as the world's are: its hooves at a walk, a gallop and a boost on each ground the
// footsteps know (`stepCue`), one cue a stride; the rider mounting, the horse whinnying as they do, and getting down;
// a snort now and then while it stands; and the boost's start. Each is silent until the owner picks its recording on
// the sound sheet, as every cue of the world's is.
import { type StepGround, stepCue, stepsBetween } from './worldCues.ts';

type Point = readonly [number, number, number];

/** How a horse goes: at a walk, a gallop or boosted. */
export type Gait = 'walk' | 'gallop' | 'boost';
/** How far a horse goes a stride at each gait, metres: its hooves' cue sounds once a stride. */
export const STRIDE_M: Readonly<Record<Gait, number>> = { walk: 1.7, gallop: 3.4, boost: 4.6 };
/** Faster than this a horse gallops, and faster than this it is boosted (metres a second): between the walk's 6, the
 *  gallop's 12 and the boosted gallop's 18. */
const GALLOP_MS = 8;
const BOOSTED_MS = 14;
/** A horse standing this long snorts, and again each time as long. */
export const SNORT_S = 9;
/** A rider that moved farther than this in a frame was placed afresh, not ridden. */
const LEAP_M = 3;
/** Slower than this a horse stands. */
const STILL_MS = 0.2;

/** The footsteps' grounds, as the hooves' cues name them. */
const GROUNDS = ['ground', 'stone', 'wood', 'water'] as const;
/** Every cue a horse plays. */
export const HORSE_CUES: readonly string[] = [
  ...(['walk', 'gallop', 'boost'] as const).flatMap((gait) => GROUNDS.map((ground) => `horse.${gait}.${ground}`)),
  ...['horse.mount', 'horse.whinny', 'horse.dismount', 'horse.snort', 'horse.boost'],
];

/** The hooves' cue at `gait` on the ground a footstep there would sound on. */
export const hoofCue = (gait: Gait, step: ReturnType<typeof stepCue>): string =>
  `horse.${gait}.${step.slice('step.'.length)}`;

/** Someone as their horse is heard: their fighter's number, their feet, whether they ride, and the seconds their
 *  boost still runs (where it is known: another player's is heard by their pace). */
export interface Rider {
  readonly id: number;
  readonly feet: Point;
  readonly mounted: boolean;
  readonly boosting: number;
}

/** A rider as last heard: whether they rode, where, the metres ridden, their boost and how long their horse stood. */
interface Kept {
  mounted: boolean;
  at: Point;
  ridden: number;
  boosting: number;
  standing: number;
}

export class HorseSounds {
  private readonly kept = new Map<number, Kept>();

  /** `riders` `seconds` on from the last frame, over `ground`: each cue heard where it is, with whose it is. */
  frame(
    riders: Iterable<Rider>,
    seconds: number,
    ground: StepGround,
    hear: (cue: string, at: Point, key: number) => void,
  ): void {
    const present = new Set<number>();
    for (const rider of riders) {
      const { id, feet, mounted, boosting } = rider;
      present.add(id);
      const kept = this.kept.get(id);
      if (!kept) {
        this.kept.set(id, { mounted, at: feet, ridden: 0, boosting, standing: 0 });
        continue;
      }
      if (mounted !== kept.mounted) {
        if (mounted) for (const cue of ['horse.mount', 'horse.whinny']) hear(cue, feet, id);
        else hear('horse.dismount', feet, id);
      }
      const moved = Math.hypot(feet[0] - kept.at[0], feet[1] - kept.at[1]);
      const speed = seconds > 0 && moved < LEAP_M ? moved / seconds : 0;
      if (mounted) {
        const gait: Gait = boosting > 0 || speed > BOOSTED_MS ? 'boost' : speed > GALLOP_MS ? 'gallop' : 'walk';
        const ridden = kept.ridden + (moved < LEAP_M ? moved : 0);
        if (stepsBetween(kept.ridden, ridden, STRIDE_M[gait]) > 0) hear(hoofCue(gait, stepCue(feet, ground)), feet, id);
        if (boosting > 0 && kept.boosting <= 0) hear('horse.boost', feet, id);
        kept.ridden = ridden;
        kept.standing = speed < STILL_MS ? kept.standing + seconds : 0;
        if (kept.standing >= SNORT_S) {
          hear('horse.snort', feet, id);
          kept.standing = 0;
        }
      } else kept.standing = 0;
      [kept.mounted, kept.at, kept.boosting] = [mounted, feet, boosting];
    }
    for (const id of this.kept.keys()) if (!present.has(id)) this.kept.delete(id);
  }
}
