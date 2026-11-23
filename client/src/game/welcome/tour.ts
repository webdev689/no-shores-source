// The stranger's welcome to Overlook, said as the player arrives with her after the shore: a little of the world, then
// each place to visit named in turn while the camera flies to it and holds there, then back to the player for her
// farewell and her gift of Aurem. The player's keys are held from her first word to her last. No drawing and no
// words here: the epilogue stands her figure and plays each scene this names (`epilogue.ts`, `afterStory.ts`).
import { smooth, lookAt } from '../../cinema/rail.ts';
import { type Shot, panShot } from '../camera.ts';
import type { StationInfo } from '../nodes.ts';

/** One step of her welcome: the scene she says, and the counters the camera frames meanwhile, by their station's
 *  kind; none keeps the view on the player. */
export interface TourStep {
  readonly scene: string;
  readonly kinds: readonly string[];
}

export const TOUR: readonly TourStep[] = [
  { scene: 'strangerHistory', kinds: [] },
  { scene: 'tourSmiths', kinds: ['armorsmith', 'weaponsmith'] },
  { scene: 'tourMage', kinds: ['mage'] },
  { scene: 'tourVault', kinds: ['vault'] },
  { scene: 'tourTailorTack', kinds: ['tailor', 'tack'] },
  { scene: 'tourPost', kinds: ['mail'] },
  { scene: 'tourHarbour', kinds: ['harbourmaster'] },
  { scene: 'tourHall', kinds: ['stormcallers', 'lamplighters', 'veiled'] },
  { scene: 'strangerFarewell', kinds: [] },
];

/** How long the camera takes to fly from one place to the next, seconds. */
export const FLY_S = 2.4;
/** How far out over the plaza from a single counter the eye stands, and how high over the ground, metres; a group's
 *  spread widens both, so every counter of it stays in the view. */
const BACK_M = 14;
const HEIGHT_M = 9;
const SPREAD_BACK = 1.3;
const SPREAD_HEIGHT = 0.5;
/** The height over the ground the eye looks at: a keeper's chest. */
const LOOK_M = 1.5;

/** The shot framing the counters of `kinds`, each the one of its kind nearest the player's view (`own`): from out
 *  over the plaza before them and up, looking at their middle, through the player's own lens. Null where one of the
 *  kinds keeps no counter here. */
export function framing(
  stations: readonly StationInfo[],
  kinds: readonly string[],
  own: Shot,
  groundAt: (x: number, y: number) => number | null,
): Shot | null {
  const away = (station: StationInfo) => Math.hypot(station.counter[0] - own.eye[0], station.counter[1] - own.eye[1]);
  const named = kinds.map(
    (kind) => stations.filter((station) => station.kind === kind).sort((one, two) => away(one) - away(two))[0],
  );
  if (named.length === 0 || named.some((station) => !station)) return null;
  const found = named as StationInfo[];
  const mean = (value: (station: StationInfo) => number) =>
    found.reduce((sum, each) => sum + value(each), 0) / found.length;
  const [x, y] = [mean((each) => each.counter[0]), mean((each) => each.counter[1])];
  // A counter faces the plaza from its keeper: the eye stands out that way.
  let [outX, outY] = [
    mean((each) => each.counter[0] - each.keeper[0]),
    mean((each) => each.counter[1] - each.keeper[1]),
  ];
  const out = Math.hypot(outX, outY) || 1;
  [outX, outY] = [outX / out, outY / out];
  const spread = Math.max(...found.map((each) => Math.hypot(each.counter[0] - x, each.counter[1] - y)));
  const ground = groundAt(x, y) ?? own.eye[2];
  const back = BACK_M + spread * SPREAD_BACK;
  const eye = [x + outX * back, y + outY * back, ground + HEIGHT_M + spread * SPREAD_HEIGHT] as const;
  const look = lookAt(eye, [x, y, ground + LOOK_M]);
  return { ...own, eye, ...look };
}

/** What the welcome speaks and gives with: a scene played, resolved once said, and her gift asked of the room. */
export interface WelcomeVoice {
  readonly play: (scene: string) => Promise<void>;
  readonly gift: () => void;
}

export class StrangerWelcome {
  /** Whether the player's keys are held: from her first word until her farewell is said, or the player leaves. */
  holding = false;
  private readonly stations: readonly StationInfo[];
  private readonly groundAt: (x: number, y: number) => number | null;
  private readonly voice: WelcomeVoice;
  /** The kinds the camera is asked to frame; undefined once framed. */
  private asked: readonly string[] | undefined;
  /** The shot a flight leaves from and the one it goes to; null is the player's own view. */
  private from: Shot | null = null;
  private to: Shot | null = null;
  private flown = FLY_S;
  private last: Shot | null = null;
  private ended = false;

  constructor(
    stations: readonly StationInfo[],
    groundAt: (x: number, y: number) => number | null,
    voice: WelcomeVoice,
  ) {
    [this.stations, this.groundAt, this.voice] = [stations, groundAt, voice];
  }

  /** Says each step in turn, the camera flying as each begins; then gives her gift. Resolves once said, or ended. */
  async run(): Promise<void> {
    this.holding = !this.ended;
    for (const step of TOUR) {
      if (this.ended) return;
      this.asked = step.kinds;
      try {
        await this.voice.play(step.scene);
      } catch (error) {
        console.error(`the stranger's ${step.scene} could not be played:`, error);
      }
    }
    if (this.ended) return;
    this.voice.gift();
    this.holding = false;
  }

  /** The view this frame, the player's own being `own`: hers while she speaks, eased from place to place. */
  shot(own: Shot, seconds: number): Shot {
    if (this.asked) this.aim(this.asked, own);
    this.flown = Math.min(FLY_S, this.flown + seconds);
    const shot = panShot(this.from ?? own, this.to ?? own, smooth(this.flown / FLY_S));
    this.last = shot;
    return this.ended ? own : shot;
  }

  /** The player has left: the view is theirs again at once, with their keys, and nothing more is said or given. */
  end(): void {
    [this.ended, this.holding, this.from, this.to, this.asked] = [true, false, null, null, undefined];
  }

  /** Sets a flight from where the view stands to the place of `kinds`, or to the player; a place the plaza lacks keeps
   *  the view where it is. */
  private aim(kinds: readonly string[], own: Shot): void {
    this.asked = undefined;
    const to = kinds.length === 0 ? null : framing(this.stations, kinds, own, this.groundAt);
    if (kinds.length > 0 && !to) return;
    if (to === null && this.to === null) return;
    [this.from, this.to, this.flown] = [this.last, to, 0];
  }
}
