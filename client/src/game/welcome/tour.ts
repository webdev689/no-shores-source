// The stranger's welcome to Overlook, said as the player arrives with her after the shore: a little of the world, then
// her farewell, both face to face (`framing.ts`), and her task heard by the room, the view easing back over the
// player's shoulder as she walks off. She names no place for the camera to fly to: the round of the keepers shows the
// way. No game key acts from her first word until the view is the player's again. No drawing and no words here: the
// epilogue stands her figure and plays each scene this names (`epilogue.ts`, `afterStory.ts`).
import { smooth } from '../../cinema/rail.ts';
import type { Block } from '../../rules/movementRules.ts';
import { type Shot, panShot } from '../camera.ts';
import { facesShot } from './framing.ts';

type Point3 = readonly [number, number, number];

/** One step of her welcome: the scene she says, seen face to face. */
export interface TourStep {
  readonly scene: string;
}

export const TOUR: readonly TourStep[] = [{ scene: 'strangerHistory' }, { scene: 'strangerFarewell' }];

/** How long the camera takes to come to the pair, or back to the player, seconds. */
export const FLY_S = 2.4;

/** What the welcome speaks with: a scene played, resolved once said, her task asked heard of the room, and where her
 *  feet and the player's stand. */
export interface WelcomeVoice {
  readonly play: (scene: string) => Promise<void>;
  readonly heard: () => void;
  readonly faces?: () => { readonly stranger: Point3; readonly player: Point3 } | null;
}

export class StrangerWelcome {
  /** Whether the player's keys are held: from her first word until the view is theirs again, or the player leaves. */
  holding = false;
  /** The solids the face-to-face shot's lines must clear. */
  private readonly blocks: readonly Block[];
  private readonly voice: WelcomeVoice;
  /** Whether her farewell is said and the view eases back to the player's own, their keys given back once it is. */
  private returning = false;
  /** Whether the pair is yet to be framed. */
  private asked = false;
  /** The shot a flight leaves from and the one it goes to; null is the player's own view. */
  private from: Shot | null = null;
  private to: Shot | null = null;
  private flown = FLY_S;
  /** The view last shown. */
  last: Shot | null = null;
  private ended = false;

  constructor(blocks: readonly Block[], voice: WelcomeVoice) {
    [this.blocks, this.voice] = [blocks, voice];
  }

  /** Says each step in turn, the pair framed as the first begins; then asks her task heard. Resolves once said, or
   *  ended. */
  async run(): Promise<void> {
    this.holding = !this.ended;
    this.asked = !this.ended;
    for (const step of TOUR) {
      if (this.ended) return;
      try {
        await this.voice.play(step.scene);
      } catch (error) {
        console.error(`the stranger's ${step.scene} could not be played:`, error);
      }
    }
    if (this.ended) return;
    this.voice.heard();
    // She walks off: the view eases back over the player's shoulder, then the keys are theirs.
    [this.from, this.to, this.flown, this.returning] = [this.last, null, 0, true];
  }

  /** The view this frame, the player's own being `own`: the pair's while she speaks, eased to and from it. */
  shot(own: Shot, seconds: number): Shot {
    if (this.asked) this.aim(own);
    this.flown = Math.min(FLY_S, this.flown + seconds);
    if (this.returning && this.flown >= FLY_S) [this.holding, this.returning] = [false, false];
    const shot = panShot(this.from ?? own, this.to ?? own, smooth(this.flown / FLY_S));
    this.last = shot;
    return this.ended ? own : shot;
  }

  /** The player has left: the view is theirs again at once, with their keys, and nothing more is said or asked. */
  end(): void {
    [this.ended, this.holding, this.from, this.to, this.asked, this.returning] = [
      true,
      false,
      null,
      null,
      false,
      false,
    ];
  }

  /** Sets a flight from where the view stands to the pair, seen from the side; with no pair to see yet, the view
   *  stays and the next frame asks again. */
  private aim(own: Shot): void {
    const pair = this.voice.faces?.();
    if (!pair) return;
    this.asked = false;
    [this.from, this.to, this.flown] = [this.last, facesShot(own, pair.stranger, pair.player, this.blocks), 0];
  }
}
