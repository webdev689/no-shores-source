// The owner's twelfth beat: the player sinking into the deep, the wreck's fire flickering through the surface above,
// the dead of their crew sinking round them; then through their own eyes, looking up as the light fails, until a
// bright flash, a voice from nowhere, and black.
import { Cues } from '../../cinema/cues.ts';
import { lookAt, type Point3 } from '../../cinema/rail.ts';
import { plainDress, type Race } from '../../player/dressing.ts';
import type { Shot } from '../camera.ts';
import { type Actor, ACTOR_IDS } from './actors.ts';
import type { Beat, Tick } from './beat.ts';
import { YOU_ID } from './helm.ts';
import { storyCue } from './music.ts';
import { DEEP } from './skies.ts';
import type { StoryFrame } from './stage.ts';
import type { Story } from './story.ts';

const LENS = { fov: 0.95, near: 0.1, far: 4_000 } as const;
/** How fast the body sinks, metres a second; when the camera goes into the player's eyes; the flash; the end. */
const SINK_M_S = 1.1;
const EYES_S = 9;
const FLASH_S = 15.5;
const DEEP_S = 21;
/** The fallen crew round the player: across and along from them, how much deeper or shallower, their look. */
const FALLEN: readonly { readonly at: Point3; readonly race: Race; readonly tone: number; readonly anim: string }[] = [
  { at: [3.2, 1.5, 2.5], race: 'human', tone: 0.8, anim: 'lie' },
  { at: [-2.6, 3.4, -1.5], race: 'felid', tone: 0.5, anim: 'fallen' },
  { at: [1.4, -3.8, 4.5], race: 'human', tone: 0.2, anim: 'lie' },
  { at: [-4.5, -1.2, 6], race: 'anole', tone: 0.5, anim: 'fallen' },
  { at: [5.5, -2.5, -3], race: 'human', tone: 0.45, anim: 'lie' },
];

export class Deep implements Beat {
  readonly name = 'deep';
  readonly skippable = true;
  private readonly story: Story;
  private readonly over: readonly [number, number];
  private readonly cues: Cues;
  private since = 0;
  done = false;

  constructor(story: Story, over: readonly [number, number]) {
    this.story = story;
    this.over = over;
    const { stage } = story;
    const { screen, ambience, flames } = stage.parts;
    storyCue('deep');
    stage.weatherTowards(DEEP, 0);
    ambience.set({ deep: 1, rain: 0, wind: 0, waves: 0.15, fire: 0.1, creak: 0, gulls: 0 }, 1);
    ambience.heartbeat(true);
    flames.clear();
    screen.fade(0, 2.5);
    this.cues = new Cues([
      [EYES_S - 0.4, () => screen.fade(0.6, 0.4)],
      [EYES_S, () => screen.fade(0, 0.8)],
      [FLASH_S - 2.5, () => ambience.heartbeat(false)],
      [FLASH_S, () => this.flash()],
      [DEEP_S - 1.5, () => screen.fade(1, 1.5)],
      [DEEP_S, () => (this.done = true)],
    ]);
  }

  private flash(): void {
    const { stage } = this.story;
    stage.parts.ambience.flash();
    stage.parts.screen.flash(2.2);
    stage.parts.screen.lids(0);
    window.setTimeout(() => void stage.play('deep', true), 1600);
  }

  skip(): void {
    this.story.stage.parts.dialogue.skip();
    this.cues.finish();
    this.story.stage.parts.screen.lids(0);
    this.done = true;
  }

  /** The player's body: under the surface and going down. */
  private body(): Point3 {
    return [this.over[0], this.over[1], -2.5 - this.since * SINK_M_S];
  }

  frame(tick: Tick): StoryFrame {
    const { stage } = this.story;
    this.since += tick.seconds;
    this.cues.step(this.since);
    // The fire above flickers through the water.
    const flicker = 0.75 + 0.25 * Math.sin(this.since * 7.3) * Math.sin(this.since * 3.1);
    stage.stepWeather(tick.seconds);
    stage.parts.scene.weather = { ...stage.parts.scene.weather, glow: { colour: [1, 0.5, 0.18], strength: 0.8 * flicker } };
    const eyes = this.since >= EYES_S && this.since < FLASH_S;
    if (eyes) stage.parts.screen.lids(Math.min(0.85, (this.since - EYES_S) / (FLASH_S - EYES_S - 0.5)));
    const body = this.body();
    const actors: Actor[] = FALLEN.map((one, index) => ({
      id: ACTOR_IDS + 70 + index,
      dress: plainDress(one.race, one.tone),
      anim: one.anim,
      x: body[0] + one.at[0],
      y: body[1] + one.at[1],
      z: body[2] + one.at[2] - this.since * (0.25 + index * 0.08),
      facing: index * 1.3,
    }));
    if (!eyes) actors.push({ id: YOU_ID, dress: this.story.dress, anim: 'fallen', x: body[0], y: body[1], z: body[2], facing: 0.4 });
    return { shot: this.shot(body, eyes), actors, land: false, focus: [body[0], body[1]] };
  }

  /** Beside and below the body looking up past it to the burning light; then the player's own eyes, looking up. */
  private shot(body: Point3, eyes: boolean): Shot {
    if (eyes) return { ...LENS, eye: [body[0], body[1], body[2] + 1.6], yaw: 0.5, pitch: -1.35 + Math.sin(this.since * 0.4) * 0.05 };
    const eye: Point3 = [body[0] - 5.5, body[1] + 4, body[2] - 3.5 - Math.min(2, this.since * 0.2)];
    const target: Point3 = [body[0], body[1], body[2] + 2.5];
    return { ...LENS, eye: [...eye], ...lookAt(eye, target) };
  }
}
