// A horse's sounds, from Freesound as the world's are: its hooves at a walk, a gallop and a boost on the ground, stone
// or water (`stepCue`'s grounds, wood ringing as stone), a stride's recording after another as it goes; the rider
// mounting, the horse whinnying as they do, and getting down; a snort now and then while it stands; and the boost's
// start. Each is silent until the owner picks its recording on the sound sheet, as every cue of the world's is.
import { lengthOfCue } from '../soundSamples.ts';
import { type StepGround, stepCue } from './worldCues.ts';

type Point = readonly [number, number, number];

/** How a horse goes: at a walk, a gallop or boosted. */
export type Gait = 'walk' | 'gallop' | 'boost';
/** The seconds a cue's recording lasts; null where it has none yet. */
export type Length = (cue: string) => number | null;
/** Faster than this a horse gallops (metres a second): between the walk's 6 and the gallop's 12. */
const GALLOP_SPEED = 8;
/** A horse standing this long snorts, and again each time as long. */
export const SNORT_S = 9;
/** A rider that moved farther than this in a frame was placed afresh, not ridden. */
const LEAP_M = 3;
/** Slower than this a horse stands. */
const STILL_SPEED = 0.2;

/** The grounds a horse's hooves are heard on. */
const GROUNDS = ['ground', 'stone', 'water'] as const;
/** Every cue a horse plays. */
export const HORSE_CUES: readonly string[] = [
  ...(['walk', 'gallop', 'boost'] as const).flatMap((gait) => GROUNDS.map((ground) => `horse.${gait}.${ground}`)),
  ...['horse.mount', 'horse.whinny', 'horse.dismount', 'horse.snort', 'horse.boost'],
];

/** The ground a horse's hooves strike where a footstep would sound on `step`: wood, which only the wreck has, as
 *  stone. */
export const hoofGround = (step: ReturnType<typeof stepCue>): Exclude<typeof step, 'step.wood'> =>
  step === 'step.wood' ? 'step.stone' : step;

/** The hooves' cue at `gait` on the ground a footstep there would sound on. */
export const hoofCue = (gait: Gait, step: ReturnType<typeof stepCue>): string =>
  `horse.${gait}.${hoofGround(step).slice('step.'.length)}`;

/** Someone as their horse is heard: their fighter's number, their feet, whether they ride, and the seconds their
 *  boost still runs. */
export interface Rider {
  readonly id: number;
  readonly feet: Point;
  readonly mounted: boolean;
  readonly boosting: number;
}

/** A rider as last heard: whether they rode, where, the seconds left of the stride heard, their boost and how long
 *  their horse stood. */
interface Kept {
  mounted: boolean;
  at: Point;
  stride: number;
  boosting: number;
  standing: number;
}

export class HorseSounds {
  private readonly kept = new Map<number, Kept>();
  private readonly length: Length;

  /** `length`: how long each cue's recording lasts, which paces the strides. */
  constructor(length: Length = lengthOfCue) {
    this.length = length;
  }

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
        this.kept.set(id, { mounted, at: feet, stride: 0, boosting, standing: 0 });
        continue;
      }
      if (mounted !== kept.mounted) {
        if (mounted) for (const cue of ['horse.mount', 'horse.whinny']) hear(cue, feet, id);
        else hear('horse.dismount', feet, id);
      }
      const moved = Math.hypot(feet[0] - kept.at[0], feet[1] - kept.at[1]);
      const speed = seconds > 0 && moved < LEAP_M ? moved / seconds : 0;
      kept.stride = Math.max(0, kept.stride - seconds);
      if (mounted) {
        const gait: Gait = boosting > 0 ? 'boost' : speed > GALLOP_SPEED ? 'gallop' : 'walk';
        // A horse keeps its stride's pace at a gait, going faster by a longer stride: the next stride is heard as the
        // last one's recording ends, so strides played back to back keep the recording's own pace.
        if (speed >= STILL_SPEED && kept.stride <= 0) {
          const cue = hoofCue(gait, stepCue(feet, ground));
          const lasts = this.length(cue);
          if (lasts !== null && lasts > 0) {
            hear(cue, feet, id);
            kept.stride = lasts;
          }
        }
        if (boosting > 0 && kept.boosting <= 0) hear('horse.boost', feet, id);
        kept.standing = speed < STILL_SPEED ? kept.standing + seconds : 0;
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
