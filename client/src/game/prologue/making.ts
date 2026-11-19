// The owner's third beat, at the Brig's helm in the storm: the player creates their account, then makes themselves
// (body, race, skin, hair), watching their whole figure in armour with sword and shield change as they choose, the
// camera turning round them at a press. The storm goes on round them.
import type { ShipPlace } from '../../ships/shipView.ts';
import type { Shot } from '../camera.ts';
import type { Beat, Tick } from './beat.ts';
import { accountStep, lookStep } from './creation.ts';
import { creationEye, youAtHelm } from './helm.ts';
import { armouredDress, keepLook, type Look } from './look.ts';
import { onDeck } from './sailing.ts';
import type { StoryFrame } from './stage.ts';
import type { Story } from './story.ts';

const LENS = { fov: 0.75, near: 0.2, far: 30_000 } as const;
/** A turn of the camera round the player at a press, radians, and how fast it eases there (a share a second). */
const TURN_STEP = Math.PI / 4;
const TURN_EASE = 6;

export class Making implements Beat {
  readonly name = 'creation';
  readonly skippable = false;
  private readonly story: Story;
  private turn = 0;
  private turnTo = 0;
  done = false;

  constructor(story: Story) {
    this.story = story;
    void this.steps();
  }

  private async steps(): Promise<void> {
    const { story } = this;
    const root = story.stage.parts.hudRoot;
    story.stage.parts.screen.bars(false);
    await accountStep(root, story.link);
    const chosen = await lookStep(
      root,
      story.look,
      (look) => this.dressAs(look),
      (step) => (this.turnTo += step * TURN_STEP),
    );
    this.dressAs(chosen);
    keepLook(localStorage, chosen);
    this.turnTo = 0;
    this.done = true;
  }

  private dressAs(look: Look): void {
    this.story.look = look;
    this.story.dress = armouredDress(look);
    this.story.walker.you.dress = this.story.dress;
  }

  frame(tick: Tick): StoryFrame {
    const { story } = this;
    const { stage, brig, lightning, sailing } = story;
    brig.step(tick.seconds);
    const strike = lightning.step(tick.seconds, [brig.x, brig.y]);
    stage.stepWeather(tick.seconds, strike.flash * 0.6, strike.bolt);
    const ships = sailing.frame([brig.sailed()], tick.seconds, tick.clock, stage.windBearing(), stage.swell());
    const own = ships[0]?.place;
    if (!own) throw new Error('the Brig is not sailing');
    this.turn += (this.turnTo - this.turn) * Math.min(1, tick.seconds * TURN_EASE);
    const shot = this.shot(own);
    return {
      shot,
      ships,
      actors: [...brig.crew(own, tick.clock), youAtHelm(story, own, 'guard')],
      land: false,
      focus: [shot.eye[0], shot.eye[1]],
    };
  }

  private shot(own: ShipPlace): Shot {
    // The camera keeps with her deck as she rides, but not her heel, so the figure holds still in the picture.
    const steady: ShipPlace = { ...own, roll: own.roll * 0.25, pitch: own.pitch * 0.25 };
    const { eye, look } = creationEye(this.turn);
    const [eyeWorld, lookWorld] = [onDeck(steady, ...eye), onDeck(steady, ...look)];
    const [east, south, up] = [lookWorld[0] - eyeWorld[0], lookWorld[1] - eyeWorld[1], lookWorld[2] - eyeWorld[2]];
    return {
      ...LENS,
      eye: eyeWorld,
      yaw: Math.atan2(east, -south),
      pitch: -Math.asin(up / (Math.hypot(east, south, up) || 1)),
    };
  }
}
