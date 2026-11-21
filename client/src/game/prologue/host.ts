// The story as the game holds it: the tap to start shown at once, the story started once the game has loaded (at the
// helm for a player back from Discord who has not played it through; or, if it cannot start, the player sent on to
// Overlook), its frames, keys, pointer and touches, and its end, which lets the story's own parts go and hands the
// player to the game with the epilogue to play on foot and their look to dress them.
import type { InputFrame } from '../../player/input.ts';
import type { Dress } from '../../player/dressing.ts';
import { rosterOf } from '../../rules/roster.ts';
import { backAtHelm } from './accountAsk.ts';
import { beatNamed, prologuePlayed } from './beat.ts';
import type { Epilogue } from './epilogue.ts';
import { fightPointer } from './fightPointer.ts';
import { plainDressOf } from './look.ts';
import { type Started, startStory, type StoryGame } from './storyStart.ts';
import { tapToStart } from './tap.ts';
import type { Stack } from '../../ui/stack.ts';

/** How the story leaves the player: with the epilogue to play if they played it through, and their everyday dress. */
export interface StoryLeft {
  readonly epilogue: Epilogue | null;
  readonly dress: Dress;
}

export class StoryHost {
  private story: Started | null = null;
  private started: (story: Started | null) => void = () => undefined;
  private readonly ready = new Promise<Started | null>((resolve) => (this.started = resolve));
  private readonly canvas: HTMLCanvasElement;

  constructor(stack: Stack, canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    void tapToStart(stack, this.ready).then(async () => (this.story = await this.ready));
    canvas.addEventListener('pointerdown', () => this.story?.prologue.press());
    // A touch held anywhere on the view skips, so it is heard from the window.
    addEventListener('pointerdown', (event) => event.pointerType === 'touch' && this.story?.prologue.touch(true));
    for (const ending of ['pointerup', 'pointercancel'] as const)
      addEventListener(ending, (event) => event.pointerType === 'touch' && this.story?.prologue.touch(false));
    fightPointer(canvas, () => this.story?.prologue.fight ?? null);
  }

  /** Starts the story on the game's parts, once the rooms' module has compiled; `failed` if it cannot start. */
  begin(game: Omit<StoryGame, 'roster'>, failed: () => void): void {
    // A player back from Discord picks the story up at the helm, where they left it; the mark is read and cleared
    // here, and a story played through is never begun again from it.
    const back = backAtHelm(sessionStorage, prologuePlayed(localStorage)) ? 'creation' : null;
    const from = (import.meta.env.DEV ? beatNamed(new URLSearchParams(location.search).get('prologue')) : null) ?? back;
    game.roomModule
      .then((module) => startStory({ ...game, roster: rosterOf(module) }, from))
      .then(
        (started) => {
          // A headless check reads the story's state from the page.
          if (import.meta.env.DEV) Object.assign(window, { __prologue: started.prologue });
          this.started(started);
        },
        (error: unknown) => {
          // A story that cannot start leaves the player arriving at Overlook.
          console.error('the story could not start:', error);
          this.started(null);
          failed();
        },
      );
  }

  key(key: string, down: boolean): void {
    this.story?.prologue.key(key, down);
  }

  /** Whether a click should lock the pointer for the story's play on foot. */
  get wantsPointer(): boolean {
    return this.story?.prologue.wantsPointer ?? false;
  }

  /** A frame of the story; once it ends, what it leaves the player with (and the story is let go). */
  frame(controls: InputFrame, seconds: number, size: { width: number; height: number }): StoryLeft | null {
    const story = this.story;
    if (!story) return null;
    const viewport = { width: this.canvas.clientWidth, height: this.canvas.clientHeight };
    story.prologue.frame(controls, seconds, size, viewport);
    const ended = story.prologue.end;
    if (!ended) return null;
    this.story = null;
    story.leave();
    return { epilogue: ended === 'played' ? story.epilogue : null, dress: plainDressOf(story.look()) };
  }
}
