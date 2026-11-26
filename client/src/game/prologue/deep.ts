// The owner's twelfth beat: the player sinking into the deep beside the wreck, its hulls and fires above seen through
// the surface, the dead of their crew sinking round them; then through their own eyes, looking up as the light fails,
// until a bright flash, a voice from nowhere, and black.
import { Cues } from '../../cinema/cues.ts';
import { motionReduced } from '../../plus/kit.ts';
import { lookAt, type Point3 } from '../../cinema/rail.ts';
import { type Dress, plainDress, type Race } from '../../player/dressing.ts';
import type { Shot } from '../camera.ts';
import { type Actor, ACTOR_IDS } from './actors.ts';
import { type Beat, SCENE, type Tick } from './beat.ts';
import { YOU_ID } from './helm.ts';
import type { Hearing } from '../audio/music/directorLaw.ts';
import { sung } from './music.ts';
import { DEEP } from './skies.ts';
import type { StoryFrame } from './stage.ts';
import type { Story } from './story.ts';
import type { WreckLayout } from './wreckLayout.ts';
import { pulseAt } from './waking.ts';
import { lightFires, type WreckScenery } from './wreckScenery.ts';
import { seaTakenDress } from './look.ts';

const LENS = { fov: 0.95, near: 0.1, far: 4_000 } as const;
/** How fast the body sinks, metres a second; when the camera goes into the player's eyes; the flash; the end. */
const SINK_M_S = 1.1;
const EYES_S = 9;
const FLASH_S = 15.5;
const DEEP_S = 21.5;
/** The voice from nowhere, after the flash has begun to fade. */
const VOICE_S = FLASH_S + 1.6;
/** How far east of where Thule stands the body went into the sea, thrown over the rail, metres. */
const THROWN_M = 10;
/** The fallen crew round the player, the Brig's own hands: across and along from them, how much deeper or
 *  shallower, their look. */
const FALLEN: readonly {
  readonly at: Point3;
  readonly race: Race;
  readonly tone: number;
  readonly body: Dress['body'];
  readonly anim: string;
}[] = [
  { at: [3.2, 1.5, 2.5], race: 'human', tone: 0.8, body: 'male', anim: 'fallen' },
  { at: [-2.6, 3.4, -1.5], race: 'felid', tone: 0.5, body: 'male', anim: 'fallen' },
  { at: [1.4, -3.8, 4.5], race: 'human', tone: 0.2, body: 'male', anim: 'fallen' },
  { at: [-4.5, -1.2, 6], race: 'anole', tone: 0.5, body: 'male', anim: 'fallen' },
  { at: [5.5, -2.5, -3], race: 'human', tone: 0.45, body: 'female', anim: 'fallen' },
];

export class Deep implements Beat {
  readonly name = 'deep';
  readonly skippable = true;
  readonly fromBlack = true;
  get ready(): boolean {
    return !this.scenery.coming;
  }
  private readonly story: Story;
  private readonly over: readonly [number, number];
  private readonly scenery: WreckScenery;
  private readonly cues: Cues;
  private since = 0;
  /** How long the heart has beaten, seconds, from the first frame, as its sound begins; and whether it still beats. */
  private heart = 0;
  private beating = false;
  /** Whether the voice has said its last line, and whether the deep's time has run: it ends once both have, so a line
   *  waiting for a press is never left behind it. */
  private voiced = false;
  private timeUp = false;
  done = false;

  constructor(story: Story, layout: WreckLayout, scenery: WreckScenery) {
    this.story = story;
    const [x, y] = layout.arena.thule;
    this.over = [x + THROWN_M, y];
    this.scenery = scenery;
    const { stage } = story;
    const { screen, ambience, flames } = stage.parts;
    story.lightning.striking = false;
    stage.weatherTowards(DEEP, 0);
    ambience.set({ deep: 1, rain: 0, wind: 0, waves: 0.15, fire: 0.1, creak: 0, gulls: 0 }, 1);
    lightFires(flames, layout);
    this.cues = new Cues([
      [EYES_S - 0.4, () => screen.fade(0.6, 0.4)],
      [EYES_S, () => screen.fade(0, 0.8)],
      [
        FLASH_S - 2.5,
        () => {
          ambience.heartbeat(false);
          this.beating = false;
        },
      ],
      [FLASH_S, () => this.flash()],
      [VOICE_S, () => void stage.play('deep').then(() => (this.voiced = true))],
      [DEEP_S - SCENE.outS, () => screen.fade(1, SCENE.outS)],
      [DEEP_S, () => (this.timeUp = true)],
    ]);
  }

  private flash(): void {
    const { stage } = this.story;
    stage.parts.ambience.flash();
    stage.parts.screen.flash(2.2);
    stage.parts.screen.darken(0);
  }

  /** Cut short, the deep leaves the world as its end does, black and still, with neither its flash nor its voice. */
  skip(): void {
    const { screen, ambience } = this.story.stage.parts;
    ambience.heartbeat(false);
    screen.darken(0);
    screen.fade(1, 0);
    this.done = true;
  }

  /** The wreck's fires are put out with the wreck, and the heart stops, however the deep was left: the shore has
   *  neither. */
  leave(): void {
    const { flames, ambience } = this.story.stage.parts;
    flames.clear();
    ambience.heartbeat(false);
  }

  /** The player's body: under the surface and going down. */
  private body(): Point3 {
    return [this.over[0], this.over[1], -2.5 - this.since * SINK_M_S];
  }

  /** The deep's song: the theme slowed on voices under the sea. */
  music(): Hearing {
    return sung('deep', 'peak');
  }

  frame(tick: Tick): StoryFrame {
    const { stage } = this.story;
    // The director frames a beat once more after its skip: nothing of it may run then.
    if (!this.done) {
      if (this.since === 0) {
        stage.parts.ambience.heartbeat(true);
        this.beating = true;
      }
      this.since += tick.seconds;
      this.heart += tick.seconds;
      this.cues.step(this.since);
      if (this.timeUp && this.voiced) this.done = true;
    }
    // The fire above flickers through the water.
    const flicker = 0.75 + 0.25 * Math.sin(this.since * 7.3) * Math.sin(this.since * 3.1);
    stage.stepWeather(tick.seconds);
    stage.parts.scene.weather = {
      ...stage.parts.scene.weather,
      glow: { colour: [1, 0.5, 0.18], strength: 0.8 * flicker },
    };
    const eyes = !this.done && this.since >= EYES_S && this.since < FLASH_S;
    // The eyes closing, darker with each beat of the heart while it still beats.
    const pulse = this.beating && !motionReduced() ? pulseAt(this.heart) : 0;
    if (eyes)
      stage.parts.screen.darken(Math.min(1, Math.min(0.85, (this.since - EYES_S) / (FLASH_S - EYES_S - 0.5)) + pulse));
    const body = this.body();
    const actors: Actor[] = FALLEN.map((one, index) => ({
      id: ACTOR_IDS + 70 + index,
      dress: { ...plainDress(one.race, one.tone), body: one.body },
      anim: one.anim,
      x: body[0] + one.at[0],
      y: body[1] + one.at[1],
      z: body[2] + one.at[2] - this.since * (0.25 + index * 0.08),
      facing: index * 1.3,
    }));
    if (!eyes)
      actors.push({
        id: YOU_ID,
        dress: seaTakenDress(this.story.look),
        anim: 'fallen',
        x: body[0],
        y: body[1],
        z: body[2],
        facing: 0.4,
      });
    return {
      shot: this.shot(body, eyes),
      actors,
      drawers: [this.scenery.drawer],
      hulls: this.scenery.hulls,
      land: false,
      focus: [body[0], body[1]],
    };
  }

  /** Beside and below the body looking up past it to the burning light; then the player's own eyes, looking up. */
  private shot(body: Point3, eyes: boolean): Shot {
    if (eyes)
      return {
        ...LENS,
        eye: [body[0], body[1], body[2] + 1.6],
        yaw: 0.5,
        pitch: -1.35 + Math.sin(this.since * 0.4) * 0.05,
      };
    const eye: Point3 = [body[0] - 5.5, body[1] + 4, body[2] - 3.5 - Math.min(2, this.since * 0.2)];
    const target: Point3 = [body[0], body[1], body[2] + 2.5];
    return { ...LENS, eye: [...eye], ...lookAt(eye, target) };
  }
}
