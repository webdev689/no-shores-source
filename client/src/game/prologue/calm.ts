// The owner's sixth beat: the fight won, the air goes still while the storm rages on, and the camera comes down from
// the fight to the Brig's deck, where the crew talk among the wrecks of the ships they beat; the lookout cuts the
// mate off (the ram beat's first cry).
import { Cues } from '../../cinema/cues.ts';
import { lookAt, type RailKey, railShot } from '../../cinema/rail.ts';
import type { AmbienceLevels } from '../../cinema/ambience.ts';
import type { ShipPlace } from '../../ships/shipView.ts';
import type { Line } from '../../speech/cast.ts';
import type { Shot } from '../camera.ts';
import type { Beat, Tick } from './beat.ts';
import { youAtHelm } from './helm.ts';
import { storyCue } from './music.ts';
import { type Wreck, wrecksOn } from './battle.ts';
import { onDeck } from './sailing.ts';
import { STILL } from './skies.ts';
import type { StoryFrame } from './stage.ts';
import type { Story } from './story.ts';

export const LENS = { fov: 0.85, near: 0.3, far: 30_000 } as const;
/** The deck shot the crew talk in: from over the helm, looking forward down her deck. */
export const DECK_VIEW = { eye: [-15.5, -1.6, 7.4], look: [4, 0.4, 3.2] } as const;
/** The still air on her deck, the storm still heard round her. */
export const CALM_SOUND: Partial<AmbienceLevels> = { wind: 0.3, rain: 0.7, waves: 0.7, creak: 0.7 };
/** How long the camera takes down to her deck, when the crew begin to talk, and how long the mate's last line runs
 *  before the lookout cuts in. */
const DOWN_S = 3;
const TALK_S = 3.2;
const CUT_S = 1.3;
/** The look out to the wrecks while the lookout speaks of them: how long the camera takes there and back, its lens,
 *  and where it stands, behind his head and to one side, so he and the nearest wreck are both in the picture. */
const LOOK_OUT_S = 1.4;
const OUT_LENS = 0.55;
const BEHIND_M = 3;
const ASIDE_M = 1.1;
const OVER_HEAD_M = 0.35;
/** Once the lookout has begun, the camera pushes in on the wreck until the picture is this many metres high at her,
 *  so a ship beaten far off reads as clearly as one near; never narrower than the least lens. */
const PUSH_AFTER_S = 1.8;
const PUSH_S = 2;
const FRAMED_M = 45;
const LEAST_LENS = 0.04;

/** A camera kept with the Brig's deck (her frame), steadied so the picture does not heel with her. */
export function onBrig(own: ShipPlace, keys: readonly RailKey[], time: number): Shot {
  const steady: ShipPlace = { ...own, pitch: own.pitch * 0.3, roll: own.roll * 0.3 };
  const carried = keys.map((key) => ({ ...key, eye: onDeck(steady, ...key.eye), look: onDeck(steady, ...key.look) }));
  return { ...LENS, ...railShot(carried, time, LENS.fov) };
}

/** The shot `share` of the way (eased) from `from` to `to`: eye, look and lens alike, the look the short way round. */
export function eased(from: Shot, to: Shot, share: number): Shot {
  const clamped = Math.min(1, Math.max(0, share));
  const along = clamped * clamped * (3 - 2 * clamped);
  const mix = (start: number, end: number) => start * (1 - along) + end * along;
  const turn = Math.atan2(Math.sin(to.yaw - from.yaw), Math.cos(to.yaw - from.yaw));
  return {
    ...to,
    eye: [mix(from.eye[0], to.eye[0]), mix(from.eye[1], to.eye[1]), mix(from.eye[2], to.eye[2])],
    yaw: from.yaw + turn * along,
    pitch: mix(from.pitch, to.pitch),
    fov: mix(from.fov, to.fov),
  };
}

export class Calm implements Beat {
  readonly name = 'calm';
  readonly skippable = true;
  private readonly story: Story;
  private readonly from: Shot;
  private readonly cues: Cues;
  /** The beaten ships as the fight left them; those going down settle on as the crew talk. */
  private readonly laid: readonly Wreck[];
  private since = 0;
  /** When the lookout began to speak of the wrecks, and when the next line drew the camera back, or -1. */
  private lookingOut = -1;
  private lookedBack = -1;
  /** When the mate's last line began, or -1. */
  private cutFrom = -1;
  private skipped = false;
  /** Why the talk could not be played, thrown from the next frame for the director to go on past it. */
  private failure: { readonly error: unknown } | null = null;
  done = false;

  constructor(story: Story, from: Shot, wrecks: readonly Wreck[]) {
    this.story = story;
    this.from = from;
    this.laid = wrecks;
    storyCue('calm');
    const { stage, brig } = story;
    stage.weatherTowards(STILL, 4);
    stage.parts.ambience.set(CALM_SOUND, 4);
    story.lightning.striking = false;
    brig.way = 0;
    const said = (line: Line) => this.said(line);
    const failed = (error: unknown) => (this.failure = { error });
    this.cues = new Cues([[TALK_S, () => void stage.play('calm', true, {}, said).then(() => this.lastLine(), failed)]]);
  }

  /** The lookout's line turns the camera out to the wrecks he speaks of, and the line after it brings it back. */
  private said(line: Line): void {
    if (line.who === 'lookout' && this.lookingOut < 0 && this.wrecks.length > 0) this.lookingOut = this.since;
    else if (this.lookingOut >= 0 && this.lookedBack < 0) this.lookedBack = this.since;
  }

  /** The mate's last line, which the lookout cuts into: said only while the calm still plays. */
  private lastLine(): void {
    if (this.skipped || this.done) return;
    this.cutFrom = this.since;
    void this.story.stage.play('calmCutOff');
  }

  skip(): void {
    this.skipped = true;
    this.done = true;
  }

  frame(tick: Tick): StoryFrame {
    const { story } = this;
    const { stage, brig, lightning, sailing } = story;
    if (this.failure) throw this.failure.error;
    this.since += tick.seconds;
    if (!this.skipped) this.cues.step(this.since);
    if (this.cutFrom >= 0 && this.since - this.cutFrom >= CUT_S) this.done = true;
    const strike = lightning.step(tick.seconds, [brig.x, brig.y]);
    stage.stepWeather(tick.seconds, strike.flash, strike.bolt);
    const ships = sailing.frame(
      [brig.sailed(), ...this.wrecks.map((wreck) => wreck.ship)],
      tick.seconds,
      tick.clock,
      stage.windBearing(),
      stage.swell(),
    );
    const own = ships[0]?.place;
    if (!own) throw new Error('the Brig is not sailing');
    const deck = onBrig(own, [{ at: 0, eye: [...DECK_VIEW.eye], look: [...DECK_VIEW.look] }], 0);
    const down = eased(this.from, deck, this.since / DOWN_S);
    const pushed = (this.since - this.lookingOut - PUSH_AFTER_S) / PUSH_S;
    const out = this.lookingOut >= 0 ? this.outToWrecks(own, ships.slice(1), pushed) : null;
    const shot = out
      ? eased(
          eased(down, out, (this.since - this.lookingOut) / LOOK_OUT_S),
          down,
          this.lookedBack >= 0 ? (this.since - this.lookedBack) / LOOK_OUT_S : 0,
        )
      : down;
    return {
      shot,
      ships,
      actors: [
        ...brig.crew(own, tick.clock, { gunner: 'idle', bosun: 'idle', lookout: 'idle' }),
        youAtHelm(story, own, 'idle'),
      ],
      heads: brig.heads(own),
      land: false,
      focus: [brig.x, brig.y],
    };
  }

  /** The wrecks as they lie now, still above water, for the ram to draw on from. */
  get wrecks(): Wreck[] {
    return wrecksOn(this.laid, this.since);
  }

  /** Over the lookout's shoulder to the nearest wreck, his head on the view as he begins, then pushed in on her by
   *  `pushed` of the way, so a ship beaten far off reads as clearly as one near. */
  private outToWrecks(own: ShipPlace, wrecks: readonly { readonly place: ShipPlace }[], pushed: number): Shot | null {
    const head = this.story.brig.head(own, 'lookout');
    const nearest = wrecks
      .map((wreck) => wreck.place)
      .sort((one, other) => Math.hypot(one.x - own.x, one.y - own.y) - Math.hypot(other.x - own.x, other.y - own.y))[0];
    if (!head || !nearest) return null;
    const [toX, toY] = [nearest.x - head[0], nearest.y - head[1]];
    const far = Math.hypot(toX, toY) || 1;
    const [alongX, alongY] = [toX / far, toY / far];
    const eye: [number, number, number] = [
      head[0] - alongX * BEHIND_M - alongY * ASIDE_M,
      head[1] - alongY * BEHIND_M + alongX * ASIDE_M,
      head[2] + OVER_HEAD_M,
    ];
    const fitted = Math.max(LEAST_LENS, Math.min(OUT_LENS, 2 * Math.atan(FRAMED_M / 2 / far)));
    const share = Math.min(1, Math.max(0, pushed));
    const fov = OUT_LENS + (fitted - OUT_LENS) * share * share * (3 - 2 * share);
    return { ...LENS, fov, eye, ...lookAt(eye, [nearest.x, nearest.y, nearest.z + 6]) };
  }
}
