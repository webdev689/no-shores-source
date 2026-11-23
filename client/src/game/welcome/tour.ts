// The stranger's welcome to Overlook, said as the player arrives with her after the shore: a little of the world, then
// each place to visit named in turn while the camera flies to it and holds there (`framing.ts`), then her farewell
// face to face and her gift of Aurem, the view easing back over the player's shoulder as she walks off. No game key
// acts from her first word until the view is the player's again. No drawing and no words here: the epilogue stands
// her figure and plays each scene this names (`epilogue.ts`, `afterStory.ts`).
import { smooth } from '../../cinema/rail.ts';
import { type Shot, panShot } from '../camera.ts';
import { type Place, counterShot, facesShot, hallShot } from './framing.ts';

type Point3 = readonly [number, number, number];

/** One step of her welcome: the scene she says, and the counters the camera frames meanwhile, by their station's
 *  kind (none keeps the view on the player); in the Hall of the Arts (`hall`), seen from inside; or the pair of them
 *  face to face (`faces`). */
export interface TourStep {
  readonly scene: string;
  readonly kinds: readonly string[];
  readonly hall?: boolean;
  readonly faces?: boolean;
}

const HOUSES = ['stormcallers', 'veiled', 'lamplighters'];
export const TOUR: readonly TourStep[] = [
  { scene: 'strangerHistory', kinds: [], faces: true },
  { scene: 'tourSmiths', kinds: ['armorsmith', 'weaponsmith'] },
  { scene: 'tourMage', kinds: ['mage'] },
  { scene: 'tourVault', kinds: ['vault'] },
  { scene: 'tourTailor', kinds: ['tailor'] },
  { scene: 'tourTack', kinds: ['tack'] },
  { scene: 'tourPost', kinds: ['mail'] },
  { scene: 'tourHarbour', kinds: ['harbourmaster'] },
  { scene: 'tourHall', kinds: HOUSES, hall: true },
  { scene: 'tourHallStorm', kinds: ['stormcallers'], hall: true },
  { scene: 'tourHallVeiled', kinds: ['veiled'], hall: true },
  { scene: 'tourHallLamps', kinds: ['lamplighters'], hall: true },
  { scene: 'strangerFarewell', kinds: [], faces: true },
];

/** How long the camera takes to fly from one place to the next, seconds. */
export const FLY_S = 2.4;

/** What the welcome speaks and gives with: a scene played, resolved once said, her gift asked of the room, and where
 *  her feet and the player's stand. */
export interface WelcomeVoice {
  readonly play: (scene: string) => Promise<void>;
  readonly gift: () => void;
  readonly faces?: () => { readonly stranger: Point3; readonly player: Point3 } | null;
}

export class StrangerWelcome {
  /** Whether the player's keys are held: from her first word until the view is theirs again, or the player leaves. */
  holding = false;
  private readonly place: Place;
  private readonly voice: WelcomeVoice;
  /** Whether her farewell is said and the view eases back to the player's own, their keys given back once it is. */
  private returning = false;
  /** The step whose place the camera is asked to frame; undefined once framed. */
  private asked: TourStep | undefined;
  /** The shot a flight leaves from and the one it goes to; null is the player's own view. */
  private from: Shot | null = null;
  private to: Shot | null = null;
  private flown = FLY_S;
  private last: Shot | null = null;
  private ended = false;

  constructor(place: Place, voice: WelcomeVoice) {
    [this.place, this.voice] = [place, voice];
  }

  /** Says each step in turn, the camera flying as each begins; then gives her gift. Resolves once said, or ended. */
  async run(): Promise<void> {
    this.holding = !this.ended;
    for (const step of TOUR) {
      if (this.ended) return;
      this.asked = step;
      try {
        await this.voice.play(step.scene);
      } catch (error) {
        console.error(`the stranger's ${step.scene} could not be played:`, error);
      }
    }
    if (this.ended) return;
    this.voice.gift();
    // She walks off: the view eases back over the player's shoulder, then the keys are theirs.
    [this.from, this.to, this.flown, this.returning] = [this.last, null, 0, true];
  }

  /** The view this frame, the player's own being `own`: hers while she speaks, eased from place to place. */
  shot(own: Shot, seconds: number): Shot {
    if (this.asked) this.aim(this.asked, own);
    this.flown = Math.min(FLY_S, this.flown + seconds);
    if (this.returning && this.flown >= FLY_S) [this.holding, this.returning] = [false, false];
    const shot = panShot(this.from ?? own, this.to ?? own, smooth(this.flown / FLY_S));
    this.last = shot;
    return this.ended ? own : shot;
  }

  /** The player has left: the view is theirs again at once, with their keys, and nothing more is said or given. */
  end(): void {
    [this.ended, this.holding, this.from, this.to, this.asked, this.returning] = [
      true,
      false,
      null,
      null,
      undefined,
      false,
    ];
  }

  /** Sets a flight from where the view stands to the place of a step, or to the player; a place the plaza lacks keeps
   *  the view where it is. */
  private aim({ kinds, hall, faces }: TourStep, own: Shot): void {
    this.asked = undefined;
    const pair = faces ? this.voice.faces?.() : null;
    const to = pair
      ? facesShot(own, pair.stranger, pair.player, this.place.blocks)
      : kinds.length === 0
        ? null
        : (hall ? hallShot : counterShot)(this.place, kinds, own);
    if (kinds.length > 0 && !to) return;
    if (to === null && this.to === null) return;
    [this.from, this.to, this.flown] = [this.last, to, 0];
  }
}
