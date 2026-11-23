// What the story leaves to play on foot in Overlook's social space: the stranger's last moment (`Epilogue`), in which
// she welcomes the player to Overlook (`tour.ts`). While she speaks the view is hers, flown from place to place, and
// the player's keys are held; a press of Space (jump) moves her words on a line. Her farewell asks the room for her
// gift. Leaving the place ends it all at once, the view and the keys the player's again.
import { ASKS, type GearAsk, type GearState } from '../../network/gearMessages.ts';
import type { CardAt } from '../../player/cards.ts';
import type { Block } from '../../rules/movementRules.ts';
import type { Shot } from '../camera.ts';
import type { StationInfo } from '../nodes.ts';
import type { Epilogue } from '../prologue/epilogue.ts';
import { COUNTERS, talkAt } from '../quests/questBook.ts';
import { StrangerWelcome } from './tour.ts';

type You = { readonly x: number; readonly y: number; readonly z: number; readonly facing: number };

/** Where the player stands as the stranger meets them: the place's kind and counters, the floor a figure stands on,
 *  the blocks the camera's lines must clear, this room's word on the player's gear, and how an ask reaches it. */
export interface Arrival {
  readonly node: { readonly kind: string; readonly stations?: readonly StationInfo[] };
  readonly floor: (x: number, y: number) => number;
  readonly blocks: readonly Block[];
  readonly gear: GearState | null;
  readonly ask: (asked: GearAsk) => void;
}

/** Whether a word of the room on the player's own character (`claimed`) shows the stranger's task waiting. */
const owed = (gear: GearState | null): boolean =>
  gear?.quest?.claimed === true && talkAt(gear.quest, 'stranger') !== null;

export class AfterStory {
  /** The stranger's last moment, set as the story hands the player over; null once she has gone or been left. */
  private epilogue: Epilogue | null = null;
  /** Her welcome, set on the first frame in a social space. */
  private welcome: StrangerWelcome | null = null;
  /** Whether her farewell has asked for her gift, and whether the room has been asked for it in this page. */
  private farewell = false;
  private gifted = false;
  /** Where the player stood on the last frame. */
  private you: You = { x: 0, y: 0, z: 0, facing: 0 };

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
    this.gift(here);
    this.you = you;
    const epilogue = this.epilogue;
    if (!epilogue || epilogue.done) {
      [this.epilogue, this.welcome] = [null, null];
      return [];
    }
    if (!this.welcome && here.node.kind === 'social') {
      const place = { stations: here.node.stations ?? [], groundAt: here.floor, blocks: here.blocks };
      const welcome = new StrangerWelcome(place, {
        play: (scene) => epilogue.say(scene),
        gift: () => void (this.farewell = true),
        faces: () => {
          const her = epilogue.where;
          return her && { stranger: [her.x, her.y, her.z], player: [this.you.x, this.you.y, this.you.z] };
        },
      });
      epilogue.words = () => welcome.run();
      this.welcome = welcome;
    }
    return epilogue.frame(shot, viewport, seconds, clock, you, veiled);
  }

  /** Her gift, asked of the room once in a page: after her farewell, or owed with no welcome to hear in a social space
   *  (a reload mid-welcome, a browser that played the story before); never before this room's gear is the player's
   *  own and shows her task waiting, so no temporary character, nor another room's, takes it. */
  private gift(here: Arrival): void {
    const due = here.node.kind === 'social' && (this.farewell || this.past);
    if (this.gifted || !due || !owed(here.gear)) return;
    this.gifted = true;
    here.ask({ kind: ASKS.speakWith, column: COUNTERS.stranger ?? 0 });
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

/** The HUD's parts of the player's own play that a cutscene hides. */
export interface HeldHud {
  hints(hints: readonly never[]): void;
  marks(marks: readonly never[]): void;
  readonly tasks: { show(quest: null): void };
}

/** The HUD while she speaks, as a cutscene's: the fight's bars and compass, the tracker, the marks and the key strip
 *  hidden, the dialogue box hers; each comes back on the next frame after, as the game sets them. */
export function heldHud(hud: HeldHud, display: { hideDisplay(): void }): void {
  display.hideDisplay();
  hud.hints([]);
  hud.marks([]);
  hud.tasks.show(null);
}
