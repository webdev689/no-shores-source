// What the story leaves to play on foot in Overlook's social space: the stranger's last moment (`Epilogue`), in which
// she welcomes the player to Overlook (`tour.ts`). While she speaks the view is hers, flown from place to place, and
// the player's keys are held; a press of Space (jump) moves her words on a line. Her farewell asks the room for her
// gift. Leaving the place ends it all at once, the view and the keys the player's again.
import type { CardAt } from '../../player/cards.ts';
import type { Shot } from '../camera.ts';
import type { StationInfo } from '../nodes.ts';
import type { Epilogue } from '../prologue/epilogue.ts';
import { StrangerWelcome } from './tour.ts';

type You = { readonly x: number; readonly y: number; readonly z: number; readonly facing: number };

/** Where the player stands as the stranger meets them: the place's kind and counters, the floor a figure stands on,
 *  and how her gift is asked of the room. */
export interface Arrival {
  readonly node: { readonly kind: string; readonly stations?: readonly StationInfo[] };
  readonly floor: (x: number, y: number) => number;
  readonly gift: () => void;
}

export class AfterStory {
  /** The stranger's last moment, set as the story hands the player over; null once she has gone or been left. */
  private epilogue: Epilogue | null = null;
  /** Her welcome, set on the first frame in a social space. */
  private welcome: StrangerWelcome | null = null;

  /** The story has ended and hands over the stranger's last moment, none where it was not played through. */
  storyEnded(epilogue: Epilogue | null): void {
    [this.epilogue, this.welcome] = [epilogue, null];
  }

  /** A frame on foot in `here`; `veiled` while the arrival's veil is still up. The cards of whoever is drawn. */
  frame(
    shot: Shot,
    viewport: { readonly width: number; readonly height: number },
    seconds: number,
    clock: number,
    you: You,
    veiled: boolean,
    here: Arrival,
  ): CardAt[] {
    const epilogue = this.epilogue;
    if (!epilogue || epilogue.done) {
      [this.epilogue, this.welcome] = [null, null];
      return [];
    }
    if (!this.welcome && here.node.kind === 'social') {
      const welcome = new StrangerWelcome(here.node.stations ?? [], here.floor, {
        play: (scene) => epilogue.say(scene),
        gift: here.gift,
      });
      epilogue.words = () => welcome.run();
      this.welcome = welcome;
    }
    return epilogue.frame(shot, viewport, seconds, clock, you, veiled);
  }

  /** The view this frame, the player's own being `own`: the welcome's while she speaks. */
  shot(own: Shot, seconds: number): Shot {
    return this.welcome?.shot(own, seconds) ?? own;
  }

  /** Whether the player's keys are held: while she speaks her welcome. */
  get holding(): boolean {
    return this.welcome?.holding ?? false;
  }

  /** Space pressed while she speaks: her words move on a line. */
  press(): void {
    if (this.holding) this.epilogue?.advance();
  }

  /** The place is left: the stranger goes, her welcome with her. Before the player has arrived anywhere the
   *  stranger has no place to leave, and waits for it. */
  leave(): void {
    this.welcome?.end();
    this.welcome = null;
    this.epilogue?.leave();
    if (this.epilogue?.done) this.epilogue = null;
  }

  /** Whether the story's last moment is past: the stranger has gone, or none waits. */
  get past(): boolean {
    return !this.epilogue || this.epilogue.done;
  }
}
