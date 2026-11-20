// What the story leaves to play on foot in Overlook's social space: the stranger's last moment (`Epilogue`), and once
// she has gone, on that first arrival only, Elder Maren Hale's welcome, unless the browser has it played. Leaving the
// place before the stranger has gone forgoes the welcome. Under `npm run dev` (or a built page on localhost),
// `?welcome=1` plays it at once on arriving in a social space, played or not, as `?prologue=<beat>` starts the story
// where asked.
import cast from '../../../../content/story/cast.json' with { type: 'json' };
import scenes from '../../../../content/story/welcome.json' with { type: 'json' };
import type { CardAt, Cards } from '../../player/cards.ts';
import { castOf, scenesOf } from '../../speech/cast.ts';
import { DialogueBox } from '../../speech/dialogue.ts';
import { Overheads } from '../../speech/overheads.ts';
import type { Shot } from '../camera.ts';
import type { Epilogue } from '../prologue/epilogue.ts';
import { Objective } from '../prologue/objective.ts';
import { worldOutput } from '../uiSounds.ts';
import type { NodeInfo } from '../worldData.ts';
import { Welcome, type WelcomeParts, type WelcomeVoice, welcomePlayed } from './welcome.ts';

type You = { readonly x: number; readonly y: number; readonly z: number; readonly facing: number };

export class AfterStory {
  /** The stranger's last moment, set as the story hands the player over; null once she has gone or been left. */
  epilogue: Epilogue | null = null;
  private welcome: Welcome | null = null;
  private readonly parts: WelcomeParts & { readonly kept: Pick<Storage, 'getItem' | 'setItem'> };
  private readonly voice: () => WelcomeVoice;
  /** The development switch, until a social space is arrived in. */
  private asked: boolean;

  constructor(parts: AfterStory['parts'], voice: () => WelcomeVoice, asked: boolean) {
    [this.parts, this.voice, this.asked] = [parts, voice, asked];
  }

  /** A frame on foot in `node`; `veiled` while the arrival's veil is still up. The cards of whoever is drawn. */
  frame(
    shot: Shot,
    viewport: { readonly width: number; readonly height: number },
    seconds: number,
    clock: number,
    you: You,
    veiled: boolean,
    node: NodeInfo,
  ): CardAt[] {
    const epilogue = this.epilogue;
    if (epilogue && !epilogue.done) return epilogue.frame(shot, viewport, seconds, clock, you, veiled);
    if (!veiled && node.kind === 'social' && (epilogue || this.asked)) {
      const wanted = this.asked || !welcomePlayed(this.parts.kept);
      [this.epilogue, this.asked] = [null, false];
      if (wanted) this.welcome = Welcome.begin(node, this.parts, this.voice);
    }
    const cards = this.welcome?.frame(shot, viewport, seconds, clock, you) ?? [];
    if (this.welcome?.done) this.welcome = null;
    return cards;
  }

  /** The place is left: the stranger goes, the welcome ends where it is, and one not yet begun is forgone. Before the
   *  player has arrived anywhere the stranger has no place to leave, and waits for it. */
  leave(): void {
    this.welcome?.leave();
    this.welcome = null;
    this.epilogue?.leave();
    if (this.epilogue?.done) this.epilogue = null;
  }
}

/** What the story leaves on the game's own page: the welcome's words read from content/story/, its speech on the
 *  HUD, kept in the browser, and the development switch read from the address. */
export function afterStoryOn(
  hudRoot: HTMLElement,
  forge: Cards,
  groundAt: (x: number, y: number) => number | null,
): AfterStory {
  const read = castOf(cast);
  const voice = () => ({
    dialogue: new DialogueBox(hudRoot, worldOutput),
    overheads: new Overheads(hudRoot, worldOutput),
    objective: new Objective(hudRoot),
  });
  // A built page served on this machine honours it too, for the headless pictures taken of a built page.
  const here = import.meta.env.DEV || location.hostname === 'localhost';
  const asked = here && new URLSearchParams(location.search).get('welcome') === '1';
  return new AfterStory(
    { forge, groundAt, cast: read, scenes: scenesOf(scenes, read), kept: localStorage },
    voice,
    asked,
  );
}
