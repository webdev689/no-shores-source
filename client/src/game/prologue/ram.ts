// The owner's sixth and seventh beats: the fight won, the air goes still while the storm rages on, and the camera
// comes down to the deck, where the crew talk; then the lookout cries out, a larger ship comes out of the storm
// straight for her side, the camera pulls sharply out to show her coming, the crew brace, and she strikes. Black.
import { Cues } from '../../cinema/cues.ts';
import { type RailKey, railShot } from '../../cinema/rail.ts';
import { motionReduced } from '../../plus/kit.ts';
import type { ShipPlace } from '../../ships/shipView.ts';
import type { Shot } from '../camera.ts';
import type { Beat, Tick } from './beat.ts';
import { youAtHelm } from './helm.ts';
import { storyCue } from './music.ts';
import { onDeck, type Sailed } from './sailing.ts';
import { STILL } from './skies.ts';
import type { StoryFrame } from './stage.ts';
import type { Story } from './story.ts';

const LENS = { fov: 0.85, near: 0.3, far: 30_000 } as const;
/** The deck shot the crew talk in: from over the helm, looking forward down her deck. */
const DECK_VIEW = { eye: [-15.5, -1.6, 7.4], look: [4, 0.4, 3.2] } as const;
/** The larger ship: drawn this many times the Brig (a stand-in until her own hull is published), as dark as a
 *  shadow, coming from this far to starboard and striking this many seconds in. */
export const RAMMER_SCALE = 1.3;
const RAMMER_FROM_M = 150;
const IMPACT_S = 10;
/** Her bow meets the Brig's side when their middles are this far apart: half the Brig's beam and half the rammer's
 *  length as drawn. */
const MEET_M = 2.6 + 15.4 * RAMMER_SCALE;

/** A camera kept with the Brig's deck (her frame), steadied so the picture does not heel with her. */
function onBrig(own: ShipPlace, keys: readonly RailKey[], time: number): Shot {
  const steady: ShipPlace = { ...own, pitch: own.pitch * 0.3, roll: own.roll * 0.3 };
  const carried = keys.map((key) => ({ ...key, eye: onDeck(steady, ...key.eye), look: onDeck(steady, ...key.look) }));
  return { ...LENS, ...railShot(carried, time, LENS.fov) };
}

export class Calm implements Beat {
  readonly name = 'calm';
  readonly skippable = true;
  private readonly story: Story;
  private readonly from: Shot;
  private since = 0;
  private spoken = false;
  done = false;

  constructor(story: Story, from: Shot) {
    this.story = story;
    this.from = from;
    storyCue('calm');
    const { stage } = story;
    stage.weatherTowards(STILL, 4);
    stage.parts.ambience.set({ wind: 0.3, rain: 0.7, waves: 0.7, creak: 0.7 }, 4);
    story.lightning.on = false;
    window.setTimeout(() => void stage.play('calm').then(() => (this.spoken = true)), 3200);
  }

  skip(): void {
    this.story.stage.parts.dialogue.skip();
    this.spoken = true;
    this.done = true;
  }

  frame(tick: Tick): StoryFrame {
    const { story } = this;
    const { stage, brig, lightning, sailing } = story;
    this.since += tick.seconds;
    const strike = lightning.step(tick.seconds, [brig.x, brig.y]);
    stage.stepWeather(tick.seconds, strike.flash, strike.bolt);
    const ships = sailing.frame([brig.sailed()], tick.seconds, tick.clock, story.places.heading + 2.6, stage.swell());
    const own = ships[0]?.place;
    if (!own) throw new Error('the Brig is not sailing');
    // Down from where the fight left the camera to her deck, over three seconds.
    const deck = onBrig(own, [{ at: 0, eye: [...DECK_VIEW.eye], look: [...DECK_VIEW.look] }], 0);
    const share = Math.min(1, this.since / 3);
    const eased = share * share * (3 - 2 * share);
    const shot: Shot = {
      ...deck,
      eye: [0, 1, 2].map((axis) => (this.from.eye[axis] ?? 0) * (1 - eased) + (deck.eye[axis] ?? 0) * eased) as [number, number, number],
      yaw: this.from.yaw + Math.atan2(Math.sin(deck.yaw - this.from.yaw), Math.cos(deck.yaw - this.from.yaw)) * eased,
      pitch: this.from.pitch * (1 - eased) + deck.pitch * eased,
    };
    if (this.spoken && this.since > 4) this.done = true;
    return {
      shot,
      ships,
      actors: [...brig.crew(own, tick.clock, { gunner: 'idle', bosun: 'idle', lookout: 'idle' }), youAtHelm(story, own, 'idle')],
      heads: brig.heads(own),
      land: false,
      focus: [brig.x, brig.y],
    };
  }
}

export class Ram implements Beat {
  readonly name = 'ram';
  readonly skippable = true;
  private readonly story: Story;
  private readonly cues: Cues;
  /** Where the larger ship comes from: her bearing from the Brig's middle. */
  private readonly from: number;
  private since = 0;
  private struck = -1;
  done = false;
  /** Where the two ships met, for the wreck that is left of them. */
  meeting: { readonly x: number; readonly y: number; readonly heading: number } | null = null;

  constructor(story: Story) {
    this.story = story;
    this.from = story.brig.heading + Math.PI / 2;
    const { stage } = story;
    storyCue('ram');
    this.cues = new Cues([
      [0, () => void stage.play('ram')],
      [2.3, () => this.strikeOverHer()],
      [2.4, () => stage.parts.ambience.whoosh()],
      [IMPACT_S, () => this.impact()],
      [IMPACT_S + 0.45, () => stage.parts.screen.fade(1, 0.5)],
      [IMPACT_S + 0.5, () => stage.parts.ambience.ringing(6)],
      [IMPACT_S + 1.6, () => (this.done = true)],
    ]);
  }

  private strikeOverHer(): void {
    const at = this.rammer(2.3);
    this.story.lightning.strike(at.x + 40, at.y + 30, [this.story.brig.x, this.story.brig.y]);
  }

  private impact(): void {
    const { stage, brig } = this.story;
    this.struck = this.since;
    stage.parts.ambience.crash();
    stage.parts.screen.flash(0.25);
    this.meeting = { x: brig.x, y: brig.y, heading: brig.heading };
  }

  /** The larger ship at `time`: coming at the Brig's side at a steady pace, her bow on it at the impact. */
  private rammer(time: number): Sailed {
    const { brig } = this.story;
    const share = Math.min(1, Math.max(0, time / IMPACT_S));
    const away = RAMMER_FROM_M + (MEET_M - RAMMER_FROM_M) * share;
    const x = brig.x + Math.sin(this.from) * away;
    const y = brig.y - Math.cos(this.from) * away;
    const after = this.struck >= 0 ? Math.min(1, (this.since - this.struck) / 0.5) : 0;
    return {
      who: 'rammer',
      hull: 'brig',
      x,
      y,
      heading: this.from + Math.PI,
      underWay: true,
      scale: RAMMER_SCALE,
      shade: 0.38,
      rise: after * 1.4,
    };
  }

  skip(): void {
    this.story.stage.parts.dialogue.skip();
    this.cues.finish();
    this.done = true;
  }

  frame(tick: Tick): StoryFrame {
    const { story } = this;
    const { stage, brig, lightning, sailing } = story;
    this.since += tick.seconds;
    this.cues.step(this.since);
    const strike = lightning.step(tick.seconds, [brig.x, brig.y]);
    stage.stepWeather(tick.seconds, strike.flash, strike.bolt);
    const lurch = this.struck >= 0 ? Math.min(1, (this.since - this.struck) / 0.35) : 0;
    const ships = sailing.frame(
      [brig.sailed({ heel: -0.32 * lurch }), this.rammer(this.since)],
      tick.seconds,
      tick.clock,
      story.places.heading + 2.6,
      stage.swell(),
    );
    const own = ships[0]?.place;
    if (!own) throw new Error('the Brig is not sailing');
    const braced = this.since > 6.4;
    const moves = braced ? { mate: 'crouch', bosun: 'crouch', gunner: 'crouch', lookout: 'crouch' } : { lookout: 'gesture' };
    return {
      shot: this.shot(own),
      ships,
      actors: [...brig.crew(own, tick.clock, moves), youAtHelm(story, own, braced ? 'block' : 'idle')],
      heads: brig.heads(own),
      land: false,
      focus: [brig.x, brig.y],
    };
  }

  /** On deck as the lookout cries; sharply out and up to show her coming; back down by the helm as she strikes;
   *  the view shaken by the blow. */
  private shot(own: ShipPlace): Shot {
    const side = this.from - own.heading;
    const [across, ahead] = [Math.sin(side), Math.cos(side)];
    const keys: RailKey[] = [
      { at: 0, eye: [...DECK_VIEW.eye], look: [ahead * 30, across * 30, 4] },
      { at: 2, eye: [-14, -3, 6.5], look: [ahead * 80, across * 80, 6] },
      { at: 3.4, eye: [-70, -70 * across - 10, 48], look: [ahead * 40, across * 40, 4] },
      { at: 6.4, eye: [-60, -55 * across - 20, 40], look: [ahead * 25, across * 25, 5] },
      { at: 7.6, eye: [-15, -2.4 * across, 4.9], look: [ahead * 24, across * 24, 9] },
      { at: IMPACT_S + 2, eye: [-14.5, -2.2 * across, 4.9], look: [ahead * 20, across * 20, 8] },
    ];
    const shot = onBrig(own, keys, this.since);
    if (this.struck < 0 || motionReduced()) return shot;
    const shake = Math.max(0, 1 - (this.since - this.struck) / 1.2) * 0.6;
    const wobble = (rate: number) => Math.sin(this.since * rate) * shake;
    return { ...shot, eye: [shot.eye[0] + wobble(61), shot.eye[1] + wobble(53), shot.eye[2] + wobble(71)], pitch: shot.pitch + wobble(47) * 0.05 };
  }
}
