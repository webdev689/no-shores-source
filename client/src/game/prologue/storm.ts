// The owner's second beat: from the title the camera pulls away over the sea into a stormfront (the light failing,
// rain driving, thunder), a strike's flash covers the leap far out to sea, and the camera rushes low over the swell
// until the Brig comes out of the rain; it rises along her side, passes over her working crew from bow to stern, and
// comes to rest at her helm, where the player stands.
import { Cues } from '../../cinema/cues.ts';
import { type RailKey, railShot } from '../../cinema/rail.ts';
import type { ShipPlace } from '../../ships/shipView.ts';
import type { Shot } from '../camera.ts';
import type { Beat, Tick } from './beat.ts';
import { storyCue } from './music.ts';
import { onDeck } from './sailing.ts';
import { STORM } from './skies.ts';
import type { StoryFrame } from './stage.ts';
import type { Story } from './story.ts';
import { creationEye, youAtHelm } from './helm.ts';

const LENS = { fov: 0.9, near: 0.3, far: 30_000 } as const;
/** The pull away from the title, then the leap, then the run to the Brig and over her. */
const PULL_S = 7;
const RUN_S = 20;

/** The run in the Brig's own frame (metres to her bow, to her starboard, up from her waterline), so it keeps with
 *  her as she sails: low over the swell astern and to port, up along her port side, over her deck aft to her helm. */
function runKeys(): RailKey[] {
  const creation = creationEye(0);
  return [
    { at: 0, eye: [-420, -260, 22], look: [0, 0, 6] },
    { at: 6, eye: [-150, -90, 14], look: [0, 0, 8] },
    { at: 9.5, eye: [-30, -24, 9], look: [8, 0, 6] },
    { at: 12.5, eye: [14, -9, 8], look: [16, 0, 3] },
    { at: 15, eye: [4, -5.5, 7.5], look: [-4, 1, 3] },
    { at: 17.5, eye: [-7, -4.5, 6.8], look: [-11, 0, 4] },
    { at: RUN_S, eye: creation.eye, look: creation.look },
  ];
}

export class StormDive implements Beat {
  readonly name = 'storm';
  readonly skippable = true;
  private readonly story: Story;
  private readonly from: Shot;
  private readonly cues: Cues;
  private readonly run: RailKey[];
  private since = 0;
  private leapt = false;
  done = false;

  constructor(story: Story, from: Shot) {
    this.story = story;
    this.from = from;
    this.run = runKeys();
    const { stage, lightning } = story;
    const { ambience, screen } = stage.parts;
    storyCue('storm');
    screen.bars(true);
    stage.weatherTowards({ ...STORM, seaGain: 1.2, rain: 0.4 }, PULL_S);
    ambience.set({ wind: 0.6, rain: 0.5, waves: 0.5, gulls: 0 }, PULL_S);
    this.cues = new Cues([
      [2.5, () => ambience.thunder(6)],
      [5, () => ambience.thunder(3.5)],
      [PULL_S - 0.6, () => ambience.whoosh()],
      [PULL_S, () => this.leap()],
      [PULL_S + 4, () => this.strikeNear(-300)],
      [PULL_S + 9, () => this.strikeNear(500)],
      [PULL_S + 14, () => (lightning.on = true)],
    ]);
  }

  /** The leap out to the stormfront, hidden in a strike's white: the Brig's storm, its full weather. */
  private leap(): void {
    if (this.leapt) return;
    this.leapt = true;
    const { stage } = this.story;
    stage.parts.screen.flash(0.9);
    stage.weatherTowards(STORM, 0);
    stage.parts.ambience.set({ wind: 1, rain: 1, waves: 1, creak: 0.5 }, 1.5);
    this.strikeNear(0);
  }

  private strikeNear(across: number): void {
    const { brig, lightning } = this.story;
    const place = this.place();
    const point = onDeck(place, 260, across, 0);
    lightning.strike(point[0], point[1], [brig.x, brig.y]);
  }

  private place(): ShipPlace {
    return { x: this.story.brig.x, y: this.story.brig.y, z: 0, heading: this.story.brig.heading, pitch: 0, roll: 0 };
  }

  skip(): void {
    this.cues.finish();
    this.since = PULL_S + RUN_S;
    this.done = true;
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
      ? sailing.frame([brig.sailed()], tick.seconds, tick.clock, story.places.heading + 2.6, swell)
      : [];
    const own = ships[0]?.place ?? this.place();
    const shot = this.leapt ? this.runShot(own) : this.pullShot();
    if (this.since >= PULL_S + RUN_S) this.done = true;
    const actors = this.leapt ? [...brig.crew(own, tick.clock), youAtHelm(story, own, 'idle')] : [];
    return {
      shot,
      ships,
      actors,
      land: !this.leapt,
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

  /** The run to the Brig, kept with her as she sails, a little of her rise and fall in it. */
  private runShot(own: ShipPlace): Shot {
    const calm: ShipPlace = { ...own, pitch: 0, roll: 0, z: own.z * 0.35 };
    const carried = this.run.map((key) => ({ ...key, eye: onDeck(calm, ...key.eye), look: onDeck(calm, ...key.look) }));
    return { ...LENS, ...railShot(carried, this.since - PULL_S, LENS.fov) };
  }
}
