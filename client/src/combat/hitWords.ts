// The words a fight throws up over where each thing happened, after DFO's damage numbers: a blow's number rises and
// fades, a great turn larger and in gold, and what the same blow did besides (it staggered, it slew, or a wind-up held
// through it) rides on its number as a small word under it rather than rising on its own over it. A flurry fans out a
// little either side, so its numbers do not stack into one.
import type { FightEvent } from '../network/messages.ts';
import { EVENT, type Tone, wordOf } from './cues.ts';
import { element } from './meter.ts';

/** How long a word stands, in seconds (the sheet's rise is as long), and how far either side of its place it may
 *  stand, in CSS pixels. */
export const WORD_SECONDS = 0.95;
export const WORD_SCATTER_PX = 36;
/** In first person, a word on the player stands this far below the crosshair, the next ones each a line lower. */
const OWN_WORD_BELOW = 56;
const OWN_WORD_LINE = 22;

/** The events whose word rides on the number of the blow that brought them, the same striker's on the same defender. */
const JOINS: ReadonlySet<number> = new Set([EVENT.staggered, EVENT.killed]);
/** The word on the player's blow that lands on a foe winding up and does not break it. */
export const HOLDS = 'Holds';

/** A word to say: its text and tone, whom it happened to, and the small words under it. */
export interface Said {
  readonly text: string;
  readonly tone: Tone;
  readonly defender: number;
  readonly tags: string[];
}

/** What a frame's events say, the player numbered `player`: each blow's number with what it did besides on it, and a
 *  word alone for the rest. `holding` answers whether a foe still winds up its telegraphed blow. */
export function wordsOf(events: readonly FightEvent[], player: number, holding: (id: number) => boolean): Said[] {
  const said: Said[] = [];
  const numbers = new Map<string, { said: Said; striker: number }>();
  const pair = (event: FightEvent) => `${event.striker}:${event.defender}`;
  for (const event of events) {
    const word = event.kind === EVENT.hit ? wordOf(event, player) : null;
    if (!word) continue;
    const made = { ...word, defender: event.defender, tags: [] };
    said.push(made);
    numbers.set(pair(event), { said: made, striker: event.striker });
  }
  for (const event of events) {
    const word = event.kind === EVENT.hit ? null : wordOf(event, player);
    if (!word) continue;
    const number = JOINS.has(event.kind) ? numbers.get(pair(event)) : undefined;
    if (number) number.said.tags.push(word.text);
    else said.push({ ...word, defender: event.defender, tags: [] });
  }
  for (const { said: number, striker } of numbers.values())
    if (striker === player && number.tags.length === 0 && holding(number.defender)) number.tags.push(HOLDS);
  return said;
}

/** A word on the display: over a place in the world, or (null) at the player's own spot in first person. */
interface Word {
  readonly element: HTMLElement;
  readonly at: readonly [number, number, number] | null;
  readonly line: number;
  readonly across: number;
  age: number;
}

type Project = (point: readonly [number, number, number]) => { readonly x: number; readonly y: number } | null;

/** The words standing on the display. */
export class Words {
  private readonly over: HTMLElement;
  private words: Word[] = [];

  constructor(over: HTMLElement) {
    this.over = over;
  }

  /** Says `said` over `place` (null for the player's own spot), `scatter` (0 to 1) setting how far to either side. */
  say(said: Pick<Said, 'text' | 'tone' | 'tags'>, place: Word['at'], scatter = Math.random()): void {
    const made = element('div', `word ${said.tone}`, this.over);
    const rise = element('span', 'rise', made, said.text);
    for (const tag of said.tags) element('small', 'tag', rise, tag);
    const line = place ? 0 : this.words.filter((word) => !word.at).length;
    const across = place ? Math.round((scatter * 2 - 1) * WORD_SCATTER_PX) : 0;
    this.words.push({ element: made, at: place, line, across, age: 0 });
  }

  /** Moves each word to where `project` puts its place on a display `width` by `height`, `seconds` on, and takes away
   *  those whose time is up or whose place is off the screen. The sheet rises and fades each. */
  update(project: Project, width: number, height: number, seconds: number): void {
    this.words = this.words.filter((word) => {
      word.age += seconds;
      const ownSpot = { x: width / 2, y: height / 2 + OWN_WORD_BELOW + word.line * OWN_WORD_LINE };
      const spot = word.at ? project(word.at) : ownSpot;
      if (word.age >= WORD_SECONDS || !spot) {
        word.element.remove();
        return false;
      }
      word.element.style.transform = `translate(${(spot.x + word.across).toFixed(1)}px, ${spot.y.toFixed(1)}px)`;
      return true;
    });
  }
}
