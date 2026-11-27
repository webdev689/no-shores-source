// The owner's third beat, at the Brig's helm in the storm: the player creates their account, then makes themselves
// (body, race, skin, hair), watching their whole figure in armour with sword and shield change as they choose, turning
// on the spot at a press. The storm goes on round them, set at the beat's start as the storm before
// leaves it, so a page started here plays as the story does.
import type { Tick, Beat } from './beat.ts';
import { accountStep, lookStep } from './creation.ts';
import { creationShot, helmDeck, youAtHelm } from './helm.ts';
import type { AccountLink } from '../../network/accounts.ts';
import { inPlayPlayed } from '../characters/characterMark.ts';
import { armouredDress, keepLook, keptLook, type Look } from './look.ts';
import type { Hearing } from '../audio/music/directorLaw.ts';
import { sung } from './music.ts';
import { STORM } from './skies.ts';
import type { StoryFrame } from './stage.ts';
import type { Story } from './story.ts';

/** A turn of the figure at a press, radians, and how fast it eases there (a share a second). */
const TURN_STEP = Math.PI / 4;
const TURN_EASE = 6;

/** The helm's two windows, as the creation makes them, and whether the account signed in to there has its character
 *  in play past the story (`inPlayPlayed`). */
export interface MakingSteps {
  readonly account: typeof accountStep;
  readonly look: typeof lookStep;
  readonly played?: (link: AccountLink) => Promise<boolean>;
}

export class Making implements Beat {
  readonly name = 'creation';
  readonly skippable = false;
  private readonly story: Story;
  private turn = 0;
  private turnTo = 0;
  /** Whether the look is chosen: the figure turns back to the bow, and the helm is done once it faces it, as the
   *  player stands at the helm in the beats after. */
  private chosen = false;
  /** What could not be done (a window that could not be made), thrown from the next frame. */
  private failure: { readonly error: unknown } | null = null;
  /** Ends the helm's windows when the story moves on from it, so none stays over the beats after or acts there. */
  private readonly left = new AbortController();

  /** Whether the account signed in to here has its character in play past the story, which then ends here. */
  onward = false;

  constructor(story: Story, steps: MakingSteps = { account: accountStep, look: lookStep }) {
    this.story = story;
    const { stage, lightning } = story;
    stage.weatherTowards(STORM, 0);
    stage.parts.ambience.set({ wind: 1, rain: 1, waves: 1, creak: 0.5, gulls: 0 }, 1.5);
    lightning.striking = true;
    void this.steps(steps).catch((error: unknown) => (this.failure = { error }));
  }

  private async steps(steps: MakingSteps): Promise<void> {
    const { story } = this;
    const { stack } = story.stage.parts;
    story.stage.parts.screen.bars(false);
    const { signal } = this.left;
    const signedIn = await steps.account(stack, story.link, signal);
    // A player signed in here to an account whose character in play has played the story goes on past it, as the
    // character screen sends one: the story is the character's, not this browser's.
    const played = steps.played ?? ((link: AccountLink) => inPlayPlayed(localStorage, link));
    if (signedIn.kind === 'account' && story.link && (await played(story.link)) && !signal.aborted) {
      story.look = keptLook(localStorage) ?? story.look;
      this.onward = true;
      return;
    }
    const chosen = await steps.look(
      stack,
      story.look,
      (look) => this.dressAs(look),
      (step) => (this.turnTo += step * TURN_STEP),
      signal,
    );
    // A step that answers after the helm was left has no player left to dress.
    if (signal.aborted) return;
    this.dressAs(chosen);
    keepLook(localStorage, chosen);
    // The accounts keep it with the character too, so its slot shows it on any browser.
    void story.link?.keepLook(chosen);
    this.turn = Math.atan2(Math.sin(this.turn), Math.cos(this.turn));
    this.turnTo = 0;
    this.chosen = true;
  }

  get done(): boolean {
    return this.onward || (this.chosen && Math.abs(this.turn) < 0.01);
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

  /** The storm's floor and its tension only, quieter, while the player makes their look at the helm. */
  music(): Hearing {
    return sung('storm', 'tension');
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
    const shot = creationShot(helmDeck(own), aspect);
    // Turned left at a press, the figure faces to port of the bow, as a turn to its own left.
    const you = { ...youAtHelm(story, own, 'idle'), facing: own.heading + this.turn };
    return {
      shot,
      ships,
      actors: [...brig.crew(own), you],
      land: false,
      heard: { at: 'sea', deck: true, sailing: true },
      focus: [shot.eye[0], shot.eye[1]],
    };
  }
}
