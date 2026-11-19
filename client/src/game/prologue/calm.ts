// The owner's sixth beat: the fight won, the air goes still while the storm rages on, and the camera comes down from
// the fight to the Brig's deck, where the crew talk among the wrecks of the ships they beat; the lookout cuts the
// mate off (the ram beat's first cry).
import { Cues } from '../../cinema/cues.ts';
import { type RailKey, railShot } from '../../cinema/rail.ts';
import type { AmbienceLevels } from '../../cinema/ambience.ts';
import type { ShipPlace } from '../../ships/shipView.ts';
import type { Shot } from '../camera.ts';
import type { Beat, Tick } from './beat.ts';
import { youAtHelm } from './helm.ts';
import { storyCue } from './music.ts';
import { onDeck, type Sailed } from './sailing.ts';
import { STILL } from './skies.ts';
import type { StoryFrame } from './stage.ts';
import type { Story } from './story.ts';

export const LENS = { fov: 0.85, near: 0.3, far: 30_000 } as const;
/** The deck shot the crew talk in: from over the helm, looking forward down her deck. */
export const DECK_VIEW = { eye: [-15.5, -1.6, 7.4], look: [4, 0.4, 3.2] } as const;
/** The still air on her deck, the storm still heard round her. */
export const CALM_SOUND: Partial<AmbienceLevels> = { wind: 0.3, rain: 0.7, waves: 0.7, creak: 0.7 };
/** How long the camera takes down to her deck, when the crew begin to talk, how long the mate's last line runs before
 *  the lookout cuts in, and how long a wreck going down takes to settle as low as she will. */
const DOWN_S = 3;
const TALK_S = 3.2;
const CUT_S = 1.3;
const SETTLE_S = 20;

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
  /** The beaten ships where the fight left them; those going down settle on as the crew talk. */
  private readonly wrecks: readonly { readonly ship: Sailed; readonly settling: boolean }[];
  private since = 0;
  /** When the mate's last line began, or -1. */
  private cutFrom = -1;
  private skipped = false;
  done = false;

  constructor(story: Story, from: Shot, wrecks: readonly Sailed[]) {
    this.story = story;
    this.from = from;
    this.wrecks = wrecks.map((ship) => ({ ship, settling: (ship.sinking ?? 0) >= 0.3 }));
    storyCue('calm');
    const { stage, brig } = story;
    stage.weatherTowards(STILL, 4);
    stage.parts.ambience.set(CALM_SOUND, 4);
    story.lightning.striking = false;
    brig.way = 0;
    this.cues = new Cues([[TALK_S, () => void stage.play('calm').then(() => this.lastLine())]]);
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
    this.since += tick.seconds;
    if (!this.skipped) this.cues.step(this.since);
    if (this.cutFrom >= 0 && this.since - this.cutFrom >= CUT_S) this.done = true;
    const strike = lightning.step(tick.seconds, [brig.x, brig.y]);
    stage.stepWeather(tick.seconds, strike.flash, strike.bolt);
    const wrecks = this.wrecks.map(({ ship, settling }) =>
      settling ? { ...ship, sinking: (ship.sinking ?? 0) + this.since / SETTLE_S } : ship,
    );
    const ships = sailing.frame(
      [brig.sailed(), ...wrecks],
      tick.seconds,
      tick.clock,
      stage.windBearing(),
      stage.swell(),
    );
    const own = ships[0]?.place;
    if (!own) throw new Error('the Brig is not sailing');
    const deck = onBrig(own, [{ at: 0, eye: [...DECK_VIEW.eye], look: [...DECK_VIEW.look] }], 0);
    return {
      shot: eased(this.from, deck, this.since / DOWN_S),
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
}
