// The owner's eighth beat: in first person, flat on the deck, the eyes blinking, the view swimming, the ears ringing;
// rising to the feet and looking round at two ships jammed into one and burning; then the camera eases out of the eyes
// to over the player's shoulder, where their control begins, their sword and shield gone from them.
import { Cues } from '../../cinema/cues.ts';
import { motionReduced } from '../../plus/kit.ts';
import { type Point3, type RailKey, railShot } from '../../cinema/rail.ts';
import { frameOf, type Shot } from '../camera.ts';
import type { Actor } from './actors.ts';
import type { Beat, Tick } from './beat.ts';
import { YOU_ID } from './helm.ts';
import { unarmed } from './look.ts';
import type { Hearing } from '../audio/music/directorLaw.ts';
import { fought, hushed } from './music.ts';
import type { StoryFrame } from './stage.ts';
import type { Story } from './story.ts';
import { topAt, type WreckLayout } from './wreckLayout.ts';
import type { WreckRun } from './wreckRun.ts';
import { setAblaze, type WreckScenery } from './wreckScenery.ts';
import { blurAt, darkAt, OPEN_S } from './waking.ts';

const LENS = { fov: 1.0, near: 0.05, far: 20_000 } as const;
/** When the eyes are open for good, when the player stands, when the camera leaves the eyes, and when control comes,
 *  once it has eased to over their shoulder. */
const STAND_S = 10.5;
const LEAVE_S = 13;
const CONTROL_S = LEAVE_S + 2.5;
/** How far out of the eyes the camera stands before the player's own figure is drawn, metres. */
const SEEN_FROM_M = 1;

/** A shot as a camera rail's key: its eye, a point ahead along its look, and its lens. */
function restingKey(shot: Shot): Pick<RailKey, 'eye' | 'look' | 'fov'> {
  const [east, south, up] = frameOf(shot).forward;
  const [x, y, z] = shot.eye;
  return { eye: [x, y, z], look: [x + east * 10, y + south * 10, z + up * 10], fov: shot.fov };
}

export class Wake implements Beat {
  readonly name = 'wake';
  readonly skippable = true;
  readonly fromBlack = true;
  /** It fades in by its own darkening, the eyes blinking open. */
  readonly fadeInS = 0;
  private readonly story: Story;
  private readonly layout: WreckLayout;
  private readonly scenery: WreckScenery;
  private readonly cues: Cues;
  private back: RailKey[];
  /** The run once it has opened, whose resting shot the camera eases out to, taken as it leaves the eyes. */
  private run: WreckRun | null = null;
  private shouldered = false;
  /** Whether the run's camera has worked out its course: once, while the player still lies on the deck. */
  private warmed = false;
  private since = 0;
  /** Set once skipped: its moments left still change the world, but none sounds. */
  private skipped = false;
  /** How long the heart has beaten, seconds: from the wake's first frame, as its sound begins, so the two keep time. */
  private heart = 0;
  done = false;

  constructor(story: Story, layout: WreckLayout, scenery: WreckScenery, run: Promise<WreckRun>) {
    this.story = story;
    this.layout = layout;
    this.scenery = scenery;
    const { stage } = story;
    const { ambience, screen } = stage.parts;
    setAblaze(story, layout);
    screen.bars(false);
    screen.darken(1);
    screen.blur(blurAt(0, 0));
    this.back = this.backKeys(null);
    // The camera ends where the run's own takes the player standing, so play begins without a cut: taken as the
    // camera leaves the eyes, once the wreck's mesh has come, as the run's camera keeps clear of what it draws. A run
    // that fails to open is the fight's to tell.
    void run.then(
      (opened) => (this.run = opened),
      () => undefined,
    );
    this.cues = new Cues([
      [0.4, () => this.skipped || ambience.thud()],
      [STAND_S, () => ambience.heartbeat(false)],
    ]);
  }

  /** The player's eye on the deck where they woke: lying, sitting, standing. */
  private eyeAt(height: number): Point3 {
    const [x, y] = this.layout.wake.at;
    return [x, y, topAt(this.layout.course, x, y) + height];
  }

  /** Out of the eyes to over the player's shoulder, `rest`, the shot play begins from (until the run opens, a shot
   *  behind them, up and to the right). */
  private backKeys(rest: Shot | null): RailKey[] {
    const facing = this.layout.wake.facing;
    const stand = this.eyeAt(1.65);
    const ahead: Point3 = [stand[0] + Math.sin(facing) * 20, stand[1] - Math.cos(facing) * 20, stand[2] - 2];
    const right = facing + Math.PI / 2;
    const behind: Point3 = [
      stand[0] - Math.sin(facing) * 3.6 + Math.sin(right) * 0.9,
      stand[1] + Math.cos(facing) * 3.6 - Math.cos(right) * 0.9,
      stand[2] + 0.9,
    ];
    const shoulder = rest ? restingKey(rest) : { eye: behind, look: ahead, fov: 0.9 };
    return [
      { at: LEAVE_S, eye: stand, look: ahead, fov: LENS.fov },
      { at: CONTROL_S, ...shoulder },
    ];
  }

  /** Ready once the wreck the eyes open on is drawn. */
  get ready(): boolean {
    return !this.scenery.coming;
  }

  skip(): void {
    this.skipped = true;
    this.cues.finish();
    const { screen } = this.story.stage.parts;
    screen.darken(0);
    screen.blur(0);
    // The director frames a beat once more after its skip: that frame is the wake's last, eyes open.
    this.since = CONTROL_S;
    this.done = true;
  }

  /** Nothing over the ringing and the heart; then, as the camera leaves the eyes, the Boarding's first part, tense. */
  music(): Hearing {
    return this.since >= LEAVE_S ? fought(null, 'boarding', 'tension') : hushed(true);
  }

  frame(tick: Tick): StoryFrame {
    const { stage } = this.story;
    if (this.heart === 0 && !this.skipped) stage.parts.ambience.heartbeat(true);
    this.since += tick.seconds;
    // The camera's course is long to work out: done as soon as the wreck is drawn, while the player still lies there,
    // never as the camera leaves the eyes and the music begins.
    if (this.run && !this.scenery.coming && !this.warmed) {
      this.run.restingShot();
      this.warmed = true;
    }
    this.heart += tick.seconds;
    this.cues.step(this.since);
    stage.stepWeather(tick.seconds);
    const { screen } = stage.parts;
    screen.darken(darkAt(this.since, motionReduced() ? undefined : this.heart));
    screen.blur(blurAt(this.since, this.heart));
    if (this.since >= CONTROL_S) this.done = true;
    const shot = this.shotAt(this.since);
    return {
      shot,
      actors: this.thirdPerson ? [this.you()] : [],
      drawers: [this.scenery.drawer],
      hulls: this.scenery.hulls,
      focus: [shot.eye[0], shot.eye[1]],
      heard: { at: 'sea', deck: true, sailing: false },
    };
  }

  /** The player standing where they woke, their hands empty, seen once the camera has left their eyes. */
  private you(): Actor {
    const [x, y] = this.layout.wake.at;
    const { facing } = this.layout.wake;
    const z = topAt(this.layout.course, x, y);
    return { id: YOU_ID, dress: unarmed(this.story.dress), anim: 'idle', x, y, z, facing };
  }

  /** Whether the player's own figure shows: once the camera stands a metre out of their eyes, so the back of their
   *  head never fills the view. */
  get thirdPerson(): boolean {
    if (this.since < LEAVE_S) return false;
    const [eye, stand] = [this.shotAt(this.since).eye, this.eyeAt(1.65)];
    return Math.hypot(eye[0] - stand[0], eye[1] - stand[1], eye[2] - stand[2]) >= SEEN_FROM_M;
  }

  private shotAt(since: number): Shot {
    const facing = this.layout.wake.facing;
    if (since >= LEAVE_S && !this.shouldered && this.run) {
      this.back = this.backKeys(this.run.restingShot());
      this.shouldered = true;
    }
    if (since >= LEAVE_S) return { ...LENS, ...railShot(this.back, since, LENS.fov, 'both') };
    // Lying: looking up into the storm, the head lolling; sitting up; standing and looking round.
    const rise = Math.min(1, Math.max(0, (since - OPEN_S) / (STAND_S - OPEN_S)));
    const eased = rise * rise * (3 - 2 * rise);
    const sway = Math.sin(since * 0.9) * 0.08 * (1 - eased);
    const around = since > STAND_S ? Math.sin((since - STAND_S) * 1.6) * 0.8 : 0;
    return {
      ...LENS,
      eye: this.eyeAt(0.3 + 1.35 * eased),
      yaw: facing + sway + around,
      pitch: -1.25 * (1 - eased) + 0.12 * eased,
    };
  }
}
