// The owner's seventh beat: the lookout cuts into the calm, crying out that a larger ship comes out of the storm
// straight for her side; the camera pulls sharply out to show her coming, the crew brace, and she strikes. Black.
// The larger ship is Captain Brannoc Thule's Frigate, drawn at her own size under sail, the wrecks of the fight still
// lying round them.
import ships from '../../../../content/ships/ships.json' with { type: 'json' };
import { Cues } from '../../cinema/cues.ts';
import type { RailKey } from '../../cinema/rail.ts';
import { motionReduced } from '../../plus/kit.ts';
import type { ShipPlace } from '../../ships/shipView.ts';
import type { Shot } from '../camera.ts';
import type { Beat, Tick } from './beat.ts';
import { CALM_SOUND, DECK_VIEW, onBrig } from './calm.ts';
import { type Wreck, wrecksOn } from './battle.ts';
import { youAtHelm } from './helm.ts';
import type { Hearing } from '../audio/music/directorLaw.ts';
import { hushed, sung } from './music.ts';
import type { Sailed } from './sailing.ts';
import { DUSK } from './skies.ts';
import type { StoryFrame } from './stage.ts';
import type { Story } from './story.ts';

/** The larger ship strikes this many seconds in. */
export const IMPACT_S = 10;
/** When the crew brace: every word of the beat has been said by then. */
export const BRACED_S = 6.4;
/** Her stem first touches the Brig's side when their middles are this far apart: the Brig's hull at its broadest
 *  out from her middle, and the Frigate's reach forward of hers to the head of her stem (each hull's box as the
 *  ships manifest measures it). */
export const MEET_M = ships.ships.brig.boxes.hull[1][1] + ships.ships.frigate.boxes.hull[1][0];
/** Her way, m/s: about 12 knots, what a Frigate makes under the storm's last gusts as the air falls still round the
 *  Brig; so she comes from this far off to strike on time. */
export const RAMMER_WAY_M_S = 6;
const RAMMER_FROM_M = MEET_M + RAMMER_WAY_M_S * IMPACT_S;
/** Lighter than a captain's ship in the fight, so in the storm's dark she reads as a ship, hull, masts and sails, and
 *  not as a black mass; still darker than the Brig. */
export const RAMMER_SHADE = 0.8;
/** The flashes behind her as she comes, so her masts and sails stand against them: when, and how far past her. */
const FLASHES_S = [2.3, 4.8] as const;
const FLASH_PAST_M = 120;

/** How far the larger ship's middle is from the Brig's at `time`: coming at a steady pace, her stem on her side at
 *  the impact. */
export function rammerAway(time: number): number {
  const share = Math.min(1, Math.max(0, time / IMPACT_S));
  return RAMMER_FROM_M + (MEET_M - RAMMER_FROM_M) * share;
}

/** The camera's way, in the Brig's frame, the larger ship coming from `side` (radians off her bow): on deck where the
 *  calm left it as the lookout cries; turned with him toward her; sharply out and up to show her coming; back down by
 *  the helm as she strikes. */
export function ramKeys(side: number): RailKey[] {
  const [across, ahead] = [Math.sin(side), Math.cos(side)];
  return [
    { at: 0, eye: [...DECK_VIEW.eye], look: [...DECK_VIEW.look] },
    { at: 1.2, eye: [-17.5, -2 * across, 8.4], look: [12 + ahead * 7, across * 7, 4] },
    { at: 2.6, eye: [-38 - ahead * 36, -36 * across, 26], look: [10 + ahead * 30, across * 30, 4] },
    { at: 3.6, eye: [-70 - ahead * 80, -80 * across, 48], look: [ahead * 40, across * 40, 4] },
    { at: BRACED_S, eye: [-60 - ahead * 75, -75 * across, 40], look: [ahead * 25, across * 25, 5] },
    { at: 7.6, eye: [-15, -2.4 * across, 4.9], look: [ahead * 24, across * 24, 9] },
    { at: IMPACT_S + 2, eye: [-14.5, -2.2 * across, 4.9], look: [ahead * 20, across * 20, 8] },
  ];
}

export class Ram implements Beat {
  readonly name = 'ram';
  readonly skippable = true;
  private readonly story: Story;
  private readonly cues: Cues;
  /** Where the larger ship comes from: her bearing from the Brig's middle. */
  private readonly from: number;
  /** The fight's wrecks as the calm left them, settling on. */
  private readonly wrecks: readonly Wreck[];
  private since = 0;
  private struck = -1;
  /** Set once skipped: its moments left still change the world, but none says or sounds a thing. */
  private skipped = false;
  done = false;
  /** Where the two ships met, for the wreck that is left of them. */
  meeting: { readonly x: number; readonly y: number } | null = null;

  constructor(story: Story, wrecks: readonly Wreck[]) {
    this.story = story;
    this.wrecks = wrecks;
    this.from = story.brig.heading + Math.PI / 2;
    const { stage, brig } = story;
    stage.weatherTowards(DUSK, 1);
    stage.parts.ambience.set(CALM_SOUND, 1);
    story.lightning.striking = false;
    brig.way = 0;
    const { ambience, dialogue, screen } = stage.parts;
    const heard = (moment: () => void) => () => {
      if (!this.skipped) moment();
    };
    this.cues = new Cues([
      // The lookout cuts the mate off.
      [
        0,
        heard(() => {
          dialogue.skip();
          void stage.play('ram');
        }),
      ],
      ...FLASHES_S.map((when): [number, () => void] => [when, heard(() => this.strikeBehindHer(when))]),
      [2.4, heard(() => ambience.whoosh())],
      [IMPACT_S, () => this.impact()],
      [
        IMPACT_S,
        heard(() => {
          ambience.crash();
          screen.flash(0.25);
        }),
      ],
      [IMPACT_S + 0.45, () => screen.fade(1, 0.5)],
      [IMPACT_S + 0.5, heard(() => ambience.ringing(6))],
      [IMPACT_S + 1.6, () => (this.done = true)],
    ]);
  }

  /** A strike past her as seen from the Brig, at `time`. */
  private strikeBehindHer(time: number): void {
    const { brig, lightning } = this.story;
    const past = rammerAway(time) + FLASH_PAST_M;
    lightning.strike(brig.x + Math.sin(this.from) * past, brig.y - Math.cos(this.from) * past, [brig.x, brig.y]);
  }

  private impact(): void {
    const { brig } = this.story;
    this.struck = this.since;
    this.meeting = { x: brig.x, y: brig.y };
  }

  /** The Frigate at `time`, under sail, her stem on the Brig's side at the impact. */
  private rammer(time: number): Sailed {
    const { brig } = this.story;
    const away = rammerAway(time);
    const after = this.struck >= 0 ? Math.min(1, (this.since - this.struck) / 0.5) : 0;
    return {
      who: 'rammer',
      hull: 'frigate',
      x: brig.x + Math.sin(this.from) * away,
      y: brig.y - Math.cos(this.from) * away,
      heading: this.from + Math.PI,
      underWay: true,
      shade: RAMMER_SHADE,
      rise: after * 1.4,
    };
  }

  skip(): void {
    this.skipped = true;
    this.cues.finish();
    this.done = true;
  }

  /** The Frigate's coming in Thule's half step, cut off by the crash and the black after it. */
  music(): Hearing {
    return this.struck >= 0 ? hushed(true) : sung('ram', 'peak');
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
      [
        brig.sailed({ heel: -0.32 * lurch }),
        this.rammer(this.since),
        ...wrecksOn(this.wrecks, this.since).map((wreck) => wreck.ship),
      ],
      tick.seconds,
      tick.clock,
      stage.windBearing(),
      stage.swell(),
    );
    const own = ships[0]?.place;
    if (!own) throw new Error('the Brig is not sailing');
    const braced = this.since > BRACED_S;
    const moves: Readonly<Record<string, string>> = braced
      ? { mate: 'crouch', bosun: 'crouch', gunner: 'crouch', lookout: 'crouch' }
      : { lookout: 'gesture' };
    return {
      shot: this.shot(own),
      ships,
      actors: [...brig.crew(own, tick.clock, moves), youAtHelm(story, own, braced ? 'block' : 'idle')],
      heads: brig.heads(own),
      land: false,
      heard: { at: 'sea', deck: true, sailing: false },
      focus: [brig.x, brig.y],
    };
  }

  /** The camera on its rail, the view shaken by the blow. */
  private shot(own: ShipPlace): Shot {
    const shot = onBrig(own, ramKeys(this.from - own.heading), this.since);
    if (this.struck < 0 || motionReduced()) return shot;
    const shake = Math.max(0, 1 - (this.since - this.struck) / 1.2) * 0.6;
    const wobble = (rate: number) => Math.sin(this.since * rate) * shake;
    return {
      ...shot,
      eye: [shot.eye[0] + wobble(61), shot.eye[1] + wobble(53), shot.eye[2] + wobble(71)],
      pitch: shot.pitch + wobble(47) * 0.05,
    };
  }
}
