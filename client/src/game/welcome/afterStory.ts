// What the story leaves to play on foot in Overlook's social space: the stranger's last moment (`Epilogue`), and once
// she has gone, Elder Maren Hale's welcome. The browser keeps it due from the story's end until it is given, with the
// stops said, so a reload or a leaving before its end brings it on the next arrival in a social space, from where it
// was; leaving the place before the stranger has gone forgoes it. A browser that keeps nothing keeps it in the page.
// Under `npm run dev` (or a built page on localhost), `?welcome=1` plays it at once on arriving in a social space,
// played or not, as `?prologue=<beat>` starts the story where asked.
import cast from '../../../../content/story/cast.json' with { type: 'json' };
import scenes from '../../../../content/story/welcome.json' with { type: 'json' };
import type { CardAt, Cards } from '../../player/cards.ts';
import { castOf, scenesOf } from '../../speech/cast.ts';
import { DialogueBox } from '../../speech/dialogue.ts';
import { Overheads } from '../../speech/overheads.ts';
import type { Shot } from '../camera.ts';
import { OPEN_AT, type Opening } from '../gearScreen.ts';
import type { Epilogue } from '../prologue/epilogue.ts';
import { Objective } from '../prologue/objective.ts';
import { worldOutput } from '../uiSounds.ts';
import type { NodeInfo } from '../worldData.ts';
import {
  Welcome,
  type WelcomeParts,
  type WelcomeVoice,
  keepWelcome,
  welcomeDue,
  welcomePlayed,
  welcomeSaid,
} from './welcome.ts';

type You = { readonly x: number; readonly y: number; readonly z: number; readonly facing: number };

export class AfterStory {
  /** The stranger's last moment, set as the story hands the player over; null once she has gone or been left. */
  private epilogue: Epilogue | null = null;
  private welcome: Welcome | null = null;
  private readonly parts: WelcomeParts & { readonly kept: Pick<Storage, 'getItem' | 'setItem'> };
  private readonly voice: () => WelcomeVoice;
  /** The development switch, until a social space is arrived in. */
  private asked: boolean;
  /** Whether this arrival has been looked at for a welcome due, so it is looked at once a place. */
  private arrived = false;

  constructor(parts: AfterStory['parts'], voice: () => WelcomeVoice, asked: boolean) {
    // What the browser keeps is kept in the page too, and read from there first: a browser that stops keeping holds
    // only what it last kept.
    const page = new Map<string, string>();
    const kept = {
      getItem: (key: string) => {
        try {
          return page.get(key) ?? parts.kept.getItem(key);
        } catch {
          return page.get(key) ?? null;
        }
      },
      setItem: (key: string, value: string) => {
        page.set(key, value);
        parts.kept.setItem(key, value);
      },
    };
    [this.parts, this.voice, this.asked] = [{ ...parts, kept }, voice, asked];
  }

  /** The story has ended and hands over the stranger's last moment, none where it was not played through: then the
   *  welcome is due, unless already played. */
  storyEnded(epilogue: Epilogue | null): void {
    [this.epilogue, this.arrived] = [epilogue, false];
    if (epilogue && !welcomePlayed(this.parts.kept) && !welcomeDue(this.parts.kept))
      keepWelcome(this.parts.kept, 'due');
  }

  /** A frame on foot in `node`; `veiled` while the arrival's veil is still up, `held` while the menu or a keeper's
   *  screen is open. The cards of whoever is drawn. */
  frame(
    shot: Shot,
    viewport: { readonly width: number; readonly height: number },
    seconds: number,
    clock: number,
    you: You,
    veiled: boolean,
    node: NodeInfo,
    held = false,
  ): CardAt[] {
    const epilogue = this.epilogue;
    if (epilogue && !epilogue.done) return epilogue.frame(shot, viewport, seconds, clock, you, veiled);
    if (!veiled && node.kind === 'social' && !this.arrived) {
      this.arrived = true;
      const [asked, due] = [this.asked, welcomeDue(this.parts.kept)];
      [this.epilogue, this.asked] = [null, false];
      const said = asked ? [] : welcomeSaid(this.parts.kept);
      if (asked || due) this.welcome = Welcome.begin(node, this.parts, this.voice, you, said);
    }
    const cards = this.welcome?.frame(shot, viewport, seconds, clock, you, held) ?? [];
    if (this.welcome?.done) this.welcome = null;
    return cards;
  }

  /** The place is left: the stranger goes, the welcome ends where it is, and one not yet begun is forgone. Before the
   *  player has arrived anywhere the stranger has no place to leave, and waits for it. */
  leave(): void {
    this.welcome?.leave();
    this.welcome = null;
    this.epilogue?.leave();
    if (this.epilogue?.done) {
      this.epilogue = null;
      if (welcomeDue(this.parts.kept)) keepWelcome(this.parts.kept, 'forgone');
    }
    this.arrived = false;
  }

  /** The menu opens at `view`, as a counter opens it: her own counter's ends her walk. */
  counterOpened(view: string): void {
    this.welcome?.counterOpened(view);
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
  const after = new AfterStory(
    { forge, groundAt, cast: read, scenes: scenesOf(scenes, read), kept: localStorage },
    voice,
    asked,
  );
  addEventListener(OPEN_AT, (event) => after.counterOpened((event as CustomEvent<Opening>).detail.view));
  return after;
}
