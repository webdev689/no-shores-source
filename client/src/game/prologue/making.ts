// The owner's third beat, at the Brig's helm in the storm: the player creates their account, then makes themselves
// (body, race, skin, hair), watching their whole figure in armour with sword and shield change as they choose, the
// camera turning round them at a press. The storm goes on round them, set at the beat's start as the storm before
// leaves it, so a page started here plays as the story does.
import type { Tick, Beat } from './beat.ts';
import { accountStep, lookStep } from './creation.ts';
import { creationShot, helmDeck, youAtHelm } from './helm.ts';
import { armouredDress, keepLook, type Look } from './look.ts';
import { storyCue } from './music.ts';
import { STORM } from './skies.ts';
import type { StoryFrame } from './stage.ts';
import type { Story } from './story.ts';

/** A turn of the camera round the player at a press, radians, and how fast it eases there (a share a second). */
const TURN_STEP = Math.PI / 4;
const TURN_EASE = 6;

/** The helm's two windows, as the creation makes them. */
export interface MakingSteps {
  readonly account: typeof accountStep;
  readonly look: typeof lookStep;
}

export class Making implements Beat {
  readonly name = 'creation';
  readonly skippable = false;
  private readonly story: Story;
  private turn = 0;
  private turnTo = 0;
  /** What could not be done (a window that could not be made), thrown from the next frame. */
  private failure: { readonly error: unknown } | null = null;
  /** Ends the helm's windows when the story moves on from it, so none stays over the beats after or acts there. */
  private readonly left = new AbortController();
  done = false;

  constructor(story: Story, steps: MakingSteps = { account: accountStep, look: lookStep }) {
    this.story = story;
    const { stage, lightning } = story;
    storyCue('storm');
    stage.weatherTowards(STORM, 0);
    stage.parts.ambience.set({ wind: 1, rain: 1, waves: 1, creak: 0.5, gulls: 0 }, 1.5);
    lightning.striking = true;
    void this.steps(steps).catch((error: unknown) => (this.failure = { error }));
  }

  private async steps(steps: MakingSteps): Promise<void> {
    const { story } = this;
    const root = story.stage.parts.hudRoot;
    story.stage.parts.screen.bars(false);
    const { signal } = this.left;
    await steps.account(root, story.link, signal);
    const chosen = await steps.look(
      root,
      story.look,
      (look) => this.dressAs(look),
      (step) => (this.turnTo += step * TURN_STEP),
      signal,
    );
    this.dressAs(chosen);
    keepLook(localStorage, chosen);
    this.turnTo = 0;
    this.done = true;
  }

  /** The story moves on from the helm: its windows go, and nothing pressed after redresses the player. */
  leave(): void {
    this.left.abort();
  }

  private dressAs(look: Look): void {
    this.story.look = look;
    this.story.dress = armouredDress(look);
    this.story.walker.you.dress = this.story.dress;
  }

  frame(tick: Tick): StoryFrame {
    if (this.failure) throw this.failure.error;
    const { story } = this;
    const { stage, brig, lightning, sailing } = story;
    brig.step(tick.seconds);
    const strike = lightning.step(tick.seconds, [brig.x, brig.y]);
    stage.stepWeather(tick.seconds, strike.flash * 0.6, strike.bolt);
    const ships = sailing.frame([brig.sailed()], tick.seconds, tick.clock, stage.windBearing(), stage.swell());
    const own = ships[0]?.place;
    if (!own) throw new Error('the Brig is not sailing');
    this.turn += (this.turnTo - this.turn) * Math.min(1, tick.seconds * TURN_EASE);
    const aspect = tick.viewport.width / Math.max(1, tick.viewport.height);
    const shot = creationShot(helmDeck(own), this.turn, aspect);
    return {
      shot,
      ships,
      actors: [...brig.crew(own, tick.clock), youAtHelm(story, own, 'guard')],
      land: false,
      focus: [shot.eye[0], shot.eye[1]],
    };
  }
}
