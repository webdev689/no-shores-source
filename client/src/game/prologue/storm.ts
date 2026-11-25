// The owner's second beat: from the title the camera pulls away over the sea into a stormfront (the light failing,
// rain driving, thunder), a strike's flash covers the leap far out to sea, and the camera rushes low over the swell
// until the Brig comes out of the rain; it rises along its side, passes over its working crew from bow to stern, and
// comes to rest at its helm, where the player stands.
import { Cues } from '../../cinema/cues.ts';
import { type RailKey, railShot } from '../../cinema/rail.ts';
import type { ShipPlace } from '../../ships/shipView.ts';
import type { Shot } from '../camera.ts';
import type { Beat, Tick } from './beat.ts';
import type { Hearing } from '../audio/music/directorLaw.ts';
import { sung } from './music.ts';
import { onDeck } from './sailing.ts';
import { STORM } from './skies.ts';
import type { StoryFrame } from './stage.ts';
import type { Story } from './story.ts';
import { CREATION_LENS, creationEye, helmDeck, youAtHelm } from './helm.ts';

const LENS = { fov: 0.9, near: 0.3, far: 30_000 } as const;
/** The pull away from the title, then the leap, then the run to the Brig and over it. */
const PULL_S = 7;
const RUN_S = 20;
/** When the run comes over its deck, seconds into it: from there its frame eases from the sea's level to its deck's
 *  as the helm rides it. */
const OVER_DECK_S = 12.5;

/** The run in the Brig's own frame (metres to its bow, to its starboard, up from its waterline), so it keeps with
 *  it as it sails: low over the swell astern and to port, then well out from its port side, bow to quarter, its
 *  crew at work across the deck, and in under the spanker's boom to the creation's own shot off the helm's port side,
 *  outboard of its rail, for a view `aspect` wide to its height. Its yards reach 6.5 m out each side and its spanker
 *  swings some 8 m out over its quarter, so the run keeps 16 m out until it comes in under the boom (5.9 m up), at the
 *  quarter's height. */
export function runKeys(aspect: number): RailKey[] {
  const creation = creationEye(aspect);
  return [
    { at: 0, eye: [-420, -260, 22], look: [0, 0, 6] },
    { at: 6, eye: [-150, -90, 14], look: [0, 0, 8] },
    { at: 9.5, eye: [-34, -40, 12], look: [0, 0, 7] },
    { at: OVER_DECK_S, eye: [18, -24, 11], look: [2, 0, 6] },
    { at: 15, eye: [-4, -18, 8.5], look: [-6, 0, 5] },
    { at: 17.5, eye: [-11.5, -10, 5.3], look: [-9.5, 0, 4.6] },
    // It ends in the creation's own lens, so the helm takes the shot up without a jump.
    { at: RUN_S, eye: creation.eye, look: creation.look, fov: CREATION_LENS.fov },
  ];
}

export class StormDive implements Beat {
  readonly name = 'storm';
  readonly skippable = true;
  private readonly story: Story;
  private readonly from: Shot;
  private readonly cues: Cues;
  private since = 0;
  private leapt = false;
  /** Set once skipped: its moments left still change the world, but none sounds or flashes. */
  private skipped = false;
  done = false;

  constructor(story: Story, from: Shot) {
    this.story = story;
    this.from = from;
    const { stage, lightning } = story;
    const { ambience, screen } = stage.parts;
    screen.bars(true);
    stage.weatherTowards({ ...STORM, seaGain: 1.2, rain: 0.4 }, PULL_S);
    ambience.set({ wind: 0.6, rain: 0.5, waves: 0.5, gulls: 0 }, PULL_S);
    this.cues = new Cues([
      [2.5, () => this.skipped || ambience.thunder(6)],
      [5, () => this.skipped || ambience.thunder(3.5)],
      [PULL_S - 0.6, () => this.skipped || ambience.whoosh()],
      [PULL_S, () => this.leap()],
      [PULL_S + 4, () => this.strikeNear(-300)],
      [PULL_S + 9, () => this.strikeNear(500)],
      [PULL_S + 14, () => (lightning.striking = true)],
    ]);
  }

  /** The leap out to the stormfront, hidden in a strike's white: the Brig's storm, its full weather. */
  private leap(): void {
    if (this.leapt) return;
    this.leapt = true;
    const { stage } = this.story;
    stage.weatherTowards(STORM, 0);
    stage.parts.ambience.set({ wind: 1, rain: 1, waves: 1, creak: 0.5 }, 1.5);
    if (this.skipped) return;
    stage.parts.screen.flash(0.9);
    this.strikeNear(0);
  }

  private strikeNear(across: number): void {
    if (this.skipped) return;
    const { brig, lightning } = this.story;
    const place = this.place();
    const point = onDeck(place, 260, across, 0);
    lightning.strike(point[0], point[1], [brig.x, brig.y]);
  }

  private place(): ShipPlace {
    return { x: this.story.brig.x, y: this.story.brig.y, z: 0, heading: this.story.brig.heading, pitch: 0, roll: 0 };
  }

  skip(): void {
    this.skipped = true;
    this.cues.finish();
    this.since = PULL_S + RUN_S;
    this.done = true;
  }

  /** The storm's song, all but its peak, as the camera finds the Brig. */
  music(): Hearing {
    return sung('storm', 'combat');
  }

  frame(tick: Tick): StoryFrame {
    const { story } = this;
    const { stage, brig, lightning, sailing } = story;
    this.since += tick.seconds;
    this.cues.step(this.since);
    brig.step(tick.seconds);
    const strike = lightning.step(tick.seconds, [brig.x, brig.y]);
    stage.stepWeather(tick.seconds, strike.flash, strike.bolt);
    const swell = stage.swell();
    const ships = this.leapt
      ? sailing.frame([brig.sailed()], tick.seconds, tick.clock, stage.windBearing(), swell)
      : [];
    const own = ships[0]?.place ?? this.place();
    const aspect = tick.viewport.width / Math.max(1, tick.viewport.height);
    const shot = this.leapt ? this.runShot(own, aspect) : this.pullShot();
    if (this.since >= PULL_S + RUN_S) this.done = true;
    const actors = this.leapt ? [...brig.crew(own), youAtHelm(story, own, 'idle')] : [];
    return {
      shot,
      ships,
      actors,
      land: !this.leapt,
      heard: { at: 'sea', deck: false, sailing: true },
      heads: this.leapt ? brig.heads(own) : undefined,
      focus: [shot.eye[0], shot.eye[1]],
    };
  }

  /** Up from the title and round toward the open sea, where the storm stands. */
  private pullShot(): Shot {
    const share = Math.min(1, this.since / PULL_S);
    const eased = share * share * (3 - 2 * share);
    const turn = Math.atan2(
      Math.sin(this.story.places.home + Math.PI - this.from.yaw),
      Math.cos(this.story.places.home + Math.PI - this.from.yaw),
    );
    const yaw = this.from.yaw + turn * eased;
    const forward = eased * eased * 1800;
    return {
      ...LENS,
      eye: [
        this.from.eye[0] + Math.sin(yaw) * forward,
        this.from.eye[1] - Math.cos(yaw) * forward,
        this.from.eye[2] + 260 * eased,
      ],
      yaw,
      pitch: this.from.pitch * (1 - eased) - 0.05 * eased,
      fov: this.from.fov,
    };
  }

  /** The run to the Brig, kept with it as it sails: a little of its rise and fall in it over the sea, then, over
   *  its deck, more of it until it rides it as the helm's camera does. */
  private runShot(own: ShipPlace, aspect: number): Shot {
    const deck = helmDeck(own);
    const share = Math.min(1, Math.max(0, (this.since - PULL_S - OVER_DECK_S) / (RUN_S - OVER_DECK_S)));
    const frame: ShipPlace = {
      ...own,
      pitch: deck.pitch * share,
      roll: deck.roll * share,
      z: own.z * 0.35 * (1 - share) + deck.z * share,
    };
    const carried = runKeys(aspect).map((key) => ({
      ...key,
      eye: onDeck(frame, ...key.eye),
      look: onDeck(frame, ...key.look),
    }));
    return { ...LENS, ...railShot(carried, this.since - PULL_S, LENS.fov) };
  }
}
