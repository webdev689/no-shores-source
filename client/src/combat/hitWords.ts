// The words a fight throws up where each thing happened, after DFO's damage numbers and Destiny's: a blow's number
// in the game's own face, popped large for two frames and settling, then rising in held steps and blinking out; a
// crit's and a kill's larger and in gold, stamped CRIT or SLAIN beside it. What the same blow did besides (it
// staggered, or a wind-up held through it) rides on its number. Blows on one foe in quick succession add into one
// rising total. A number stands where the blow met the body, thrown to the side the stroke travelled, kept clear of
// every plate drawn and of the other words, so a crowd of numbers never piles into one.
import { motionReduced } from '../plus/kit.ts';
import type { FightEvent } from '../network/messages.ts';
import { EVENT, type Tone, wordOf } from './cues.ts';
import { element } from '../plus/meter.ts';

/** How long a word stands, in frames at 60 a second: a crit's and a kill's longer. */
export const WORD_FRAMES = { plain: 57, loud: 72 } as const;
export const WORD_SECONDS = WORD_FRAMES.plain / 60;
/** A word's motion, in frames: popped 1.4 times for two, 1.15 for two, then risen 4 px every 4; blinking out over its
 *  last 6. */
const POP = [1.4, 1.4, 1.15, 1.15] as const;
const RISE = { every: 4, pixels: 4 } as const;
const BLINK_FRAMES = 6;
/** Each word's size in CSS pixels, on the face's grid of 11: a number, a crit's or a kill's, a small word on one. */
export const WORD_PX = { word: 22, loud: 33, tag: 11 } as const;
/** How far to the side the stroke travelled a number is thrown, and how far it may scatter beside that (CSS px). */
export const WORD_THROW_PX = 28;
export const WORD_SCATTER_PX = 10;
/** A number stands this far clear of a plate, and two words this far clear of each other (CSS px). */
const PLATE_CLEAR_PX = 24;
const WORD_GAP_PX = 2;
/** Blows by one striker on one defender within this long add into one number (seconds). */
const SUM_S = 0.6;
/** In first person, a word on the player stands this far below the crosshair, the next ones each a line lower. */
const OWN_WORD_BELOW = 56;
const OWN_WORD_LINE = 26;

/** The events whose word rides on the number of the blow that brought them, the same striker's on the same defender. */
const JOINS: ReadonlySet<number> = new Set([EVENT.staggered, EVENT.killed]);
/** The word on the player's blow that lands on a foe winding up and does not break it. */
export const HOLDS = 'Holds';
export const SLAIN = 'Slain';
export const CRIT_WORD = 'Crit';

/** A word to say: its text and tone, who struck whom, the small words on it, and for a number: what it numbers, the
 *  word before it (a riposte's), whether it was a crit or a kill, the element it burnt in and its stroke. */
export interface Said {
  readonly text: string;
  readonly tone: Tone;
  readonly defender: number;
  readonly tags: string[];
  readonly striker?: number;
  readonly amount?: number;
  readonly before?: string;
  readonly crit?: boolean;
  killed?: boolean;
  readonly element?: number;
  readonly stroke?: number;
}

/** What a frame's events say, the player numbered `player`: each blow's number with what it did besides on it, and a
 *  word alone for the rest. `holding` answers whether a foe still winds up its telegraphed blow. */
export function wordsOf(events: readonly FightEvent[], player: number, holding: (id: number) => boolean): Said[] {
  const said: Said[] = [];
  const numbers = new Map<string, Said>();
  const pair = (event: FightEvent) => `${event.striker}:${event.defender}`;
  for (const event of events) {
    const word = event.kind === EVENT.hit ? wordOf(event, player) : null;
    if (!word) continue;
    const amount = Math.max(1, Math.round(event.amount));
    const before = word.text.endsWith(` ${amount}`) ? word.text.slice(0, -String(amount).length - 1) : '';
    const made: Said = {
      ...word,
      defender: event.defender,
      tags: [],
      striker: event.striker,
      amount,
      ...(before ? { before } : {}),
      crit: !!event.crit,
      element: event.element ?? 0,
      stroke: event.stroke,
    };
    said.push(made);
    numbers.set(pair(event), made);
  }
  for (const event of events) {
    const word = event.kind === EVENT.hit ? null : wordOf(event, player);
    if (!word) continue;
    const number = JOINS.has(event.kind) ? numbers.get(pair(event)) : undefined;
    if (number && event.kind === EVENT.killed) number.killed = true;
    else if (number) number.tags.push(word.text);
    else said.push({ ...word, defender: event.defender, tags: [] });
  }
  for (const number of numbers.values())
    if (number.striker === player && number.tags.length === 0 && !number.killed && holding(number.defender))
      number.tags.push(HOLDS);
  return said;
}

/** A word `frame` frames into its life of `life`: how much larger it stands, how far it has risen (CSS px) and whether
 *  it shows; with motion reduced (`still`) it neither pops nor rises. */
export function wordPose(frame: number, life: number, still = false): { scale: number; rise: number; shown: boolean } {
  const blinking = frame - (life - BLINK_FRAMES);
  const shown = frame < life && (blinking < 0 || Math.floor(blinking / 2) % 2 === 1);
  if (still) return { scale: 1, rise: 0, shown };
  const scale = POP[frame] ?? 1;
  const rise = frame < POP.length ? 0 : Math.floor((frame - POP.length) / RISE.every + 1) * RISE.pixels;
  return { scale, rise, shown };
}

/** A box on the display, CSS pixels. */
export interface Box {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

/** Where a word's box goes, wanted at `want`: pushed down, a step at a time, until it stands clear of every plate
 *  (each a column above its bottom edge, where a lifted plate may stand) by PLATE_CLEAR_PX and of every word placed. */
export function placeWord(want: Box, plates: readonly Box[], placed: readonly Box[]): Box {
  let box = want;
  for (let tries = 0; tries < 8; tries++) {
    const across = (other: Box, gap: number) => box.left < other.right + gap && box.right > other.left - gap;
    const plate = plates.find((other) => across(other, 0) && box.top < other.bottom + PLATE_CLEAR_PX);
    const word = placed.find(
      (other) => across(other, WORD_GAP_PX) && box.top < other.bottom + WORD_GAP_PX && box.bottom > other.top,
    );
    const below = plate ? plate.bottom + PLATE_CLEAR_PX : word ? word.bottom + WORD_GAP_PX : null;
    if (below === null) return box;
    box = { ...box, top: below, bottom: below + (box.bottom - box.top) };
  }
  return box;
}

/** A word on the display: over a place in the world, or (null) at the player's own spot in first person. */
interface Word {
  readonly element: HTMLElement;
  readonly rise: HTMLElement;
  readonly number: HTMLElement;
  readonly at: readonly [number, number, number] | null;
  readonly line: number;
  readonly side: number;
  readonly across: number;
  readonly key: string | null;
  readonly stamps: Set<string>;
  said: Said;
  life: number;
  frames: number;
}

type Project = (point: readonly [number, number, number]) => { readonly x: number; readonly y: number } | null;

/** The words standing on the display. */
export class Words {
  private readonly over: HTMLElement;
  private words: Word[] = [];

  constructor(over: HTMLElement) {
    this.over = over;
  }

  /** Says `said` over `place` (null for the player's own spot), thrown to `side` (-1 left, 1 right, 0 neither) and
   *  scattered beside that by `scatter` (0 to 1); a shield's word in its `shield`'s colour (the gear crate's number).
   *  A number by the same striker on the same defender as one still young adds into it, and pops again. */
  say(
    said: Pick<Said, 'text' | 'tone' | 'tags'> & Partial<Said> & { readonly shield?: number },
    place: Word['at'],
    side = 0,
    scatter = Math.random(),
  ): void {
    const summed = said.amount !== undefined && said.striker !== undefined;
    const key = summed ? `${said.striker}:${said.defender}:${said.tone}` : null;
    const young = key ? this.words.find((word) => word.key === key && word.frames < SUM_S * 60) : undefined;
    if (young && young.said.amount !== undefined && said.amount !== undefined) {
      const { crit = false, killed = false } = young.said;
      const amount = young.said.amount + said.amount;
      young.said = { ...young.said, amount, crit: crit || !!said.crit, killed: killed || !!said.killed };
      young.number.textContent = textOf(young.said);
      this.stamp(young);
      [young.frames, young.life] = [0, lifeOf(young.said)];
      return;
    }
    const made = element('div', `word ${said.tone}`, this.over);
    if (said.shield !== undefined) made.dataset['element'] = String(said.shield);
    if (said.element) made.dataset['glow'] = String(said.element);
    const rise = element('span', 'rise', made);
    const number = element('span', 'number', rise, textOf(said));
    for (const tag of said.tags) element('small', 'tag', rise, tag);
    const line = place ? 0 : this.words.filter((word) => !word.at).length;
    const across = place ? Math.round((scatter * 2 - 1) * WORD_SCATTER_PX) : 0;
    const full: Said = { defender: -1, ...said };
    const word: Word = {
      element: made,
      rise,
      number,
      at: place,
      line,
      side: place ? side : 0,
      across,
      key,
      stamps: new Set(),
      said: full,
      life: 0,
      frames: 0,
    };
    this.stamp(word);
    word.life = lifeOf(full);
    this.words.push(word);
  }

  /** Stamps a crit's word and a kill's beside its number, larger and in gold. */
  private stamp(word: Word): void {
    const { crit = false, killed = false } = word.said;
    word.element.classList.toggle('loud', crit || killed);
    for (const [name, wanted] of [
      [CRIT_WORD, crit],
      [SLAIN, killed],
    ] as const) {
      if (!wanted || word.stamps.has(name)) continue;
      word.stamps.add(name);
      element('b', 'stamp', word.rise, name);
    }
  }

  /** Moves each word to where `project` puts its place on a display `width` by `height`, `seconds` on, clear of
   *  `plates` and of each other, and takes away those whose time is up or whose place is off the screen. */
  update(project: Project, width: number, height: number, seconds: number, plates: readonly Box[] = []): void {
    const still = motionReduced();
    const placed: Box[] = [];
    this.words = this.words.filter((word) => {
      word.frames += seconds * 60;
      const frame = Math.floor(word.frames + 1e-6);
      const ownSpot = { x: width / 2, y: height / 2 + OWN_WORD_BELOW + word.line * OWN_WORD_LINE };
      const spot = word.at ? project(word.at) : ownSpot;
      if (frame >= word.life || !spot) {
        word.element.remove();
        return false;
      }
      const pose = wordPose(frame, word.life, still);
      const [half, size] = [widthOf(word) / 2, sizeOf(word.said)];
      // Its near edge stands its throw from the blow, so the blow itself stays clear; a crit's or a kill's twice as far.
      const thrown = word.side * (WORD_THROW_PX * (size === WORD_PX.loud ? 2 : 1) + half);
      const middle = Math.round(spot.x + word.across + thrown);
      const top = Math.round(spot.y - pose.rise - size / 2);
      const want = { left: middle - half, right: middle + half, top, bottom: top + size };
      // A word whose place is off the screen's foot or side (a body right before the eyes) stands just inside it.
      const inside = word.at ? clampedTo(want, width, height) : want;
      const box = word.at ? placeWord(inside, plates, placed) : want;
      placed.push(box);
      const scaled = pose.scale === 1 ? '' : ` scale(${pose.scale})`;
      const across = (box.left + box.right) / 2;
      word.element.style.transform = `translate(${across.toFixed(1)}px, ${box.top.toFixed(1)}px)${scaled}`;
      word.element.style.visibility = pose.shown ? '' : 'hidden';
      return true;
    });
  }
}

/** A word's text: a number's total, after the word before it. */
const textOf = (said: Pick<Said, 'text'> & Partial<Said>): string =>
  said.amount === undefined ? said.text : said.before ? `${said.before} ${said.amount}` : String(said.amount);
const lifeOf = (said: Partial<Said>): number => (said.crit || said.killed ? WORD_FRAMES.loud : WORD_FRAMES.plain);
const sizeOf = (said: Partial<Said>): number => (said.crit || said.killed ? WORD_PX.loud : WORD_PX.word);
/** How wide a word stands, from its letters at the face's grid (CSS px), its stamps beside it. */
function widthOf(word: Word): number {
  const letters = textOf(word.said).length * sizeOf(word.said) * 0.6;
  const stamps = (word.said.crit ? 4 : 0) + (word.said.killed ? 5 : 0);
  const tags = word.said.tags.reduce((sum, tag) => sum + tag.length, 0);
  return letters + stamps * WORD_PX.word * 0.6 + tags * WORD_PX.tag * 0.7 + 8;
}

/** How far inside the display's edges a word stays (CSS px): clear of its sides and the vitals at its foot. */
const EDGE_PX = { side: 8, top: 8, foot: 140 } as const;
/** `box` moved to stand within a display `width` by `height`. */
function clampedTo(box: Box, width: number, height: number): Box {
  const [wide, high] = [box.right - box.left, box.bottom - box.top];
  const left = Math.min(Math.max(box.left, EDGE_PX.side), Math.max(EDGE_PX.side, width - EDGE_PX.side - wide));
  const top = Math.min(Math.max(box.top, EDGE_PX.top), Math.max(EDGE_PX.top, height - EDGE_PX.foot - high));
  return { left, right: left + wide, top, bottom: top + high };
}
