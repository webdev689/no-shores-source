// The words a fight throws up where each thing happened, after DFO's damage numbers and Destiny's: a blow's number
// in the game's own face, popped large for two frames and settling, then rising in held steps and blinking out; a
// crit's and a kill's larger and in gold, stamped CRIT or SLAIN beside it. What the same blow did besides (it
// staggered, or a wind-up held through it) rides on its number. Blows on one foe in quick succession add into one
// rising total. A number stands where the blow met the body, thrown to the side the stroke travelled, kept clear of
// every plate drawn and of the other words, so a crowd of numbers never piles into one.
import { GLOW_RAMPS, type Rgb } from '../elementGlow.ts';
import { motionReduced } from '../plus/kit.ts';
import type { FightEvent } from '../network/messages.ts';
import { ELEMENTS } from '../player/gear.ts';
import type { Node } from '../ui/node.ts';
import { baselineRise } from './barDraw.ts';
import { EVENT, type Tone, wordOf } from './cues.ts';

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
  readonly at: readonly [number, number, number] | null;
  readonly line: number;
  readonly side: number;
  readonly across: number;
  /** How far it has been pushed down to clear the plates, which it never rises back from while it shows. */
  drop: number;
  readonly key: string | null;
  /** The element a shield that took it stands in (the gear crate's number). */
  readonly shield: number | null;
  said: Said;
  life: number;
  frames: number;
  /** Where it stands this frame (its box's middle across and its top, CSS pixels), how much larger, and whether it
   *  shows. */
  pose: { readonly x: number; readonly y: number; readonly scale: number; readonly shown: boolean } | null;
}

type Project = (point: readonly [number, number, number]) => { readonly x: number; readonly y: number } | null;

/** The colour of a word's number: an element's own light on the player's blow that burnt in it, a crit's or a kill's
 *  gold (a blow taken's red), else its tone's; a shield's in its element's colour. */
const TONE_COLOURS: Readonly<Record<Tone, string>> = {
  dealt: '#f2f2f2',
  taken: '#ff7468',
  great: '#ffd95a',
  good: '#ffd95a',
  plain: '#bfc8d2',
  warn: '#ffffff',
  shield: '#f2efe6',
  healed: '#7ee06a',
};
const STAMP_GOLD = '#ffd95a';
const cssOf = ([red, green, blue]: Rgb) =>
  `rgb(${Math.round(red * 255)}, ${Math.round(green * 255)}, ${Math.round(blue * 255)})`;

function numberColour(word: Word): string {
  const { said } = word;
  const glow = said.tone === 'dealt' && said.element ? GLOW_RAMPS[said.element as 1 | 2 | 3]?.[2] : undefined;
  if (glow) return cssOf(glow);
  if (said.crit || said.killed) return said.tone === 'taken' ? TONE_COLOURS.taken : STAMP_GOLD;
  if (said.tone === 'shield' && word.shield !== null) return ELEMENTS[word.shield]?.colour ?? TONE_COLOURS.shield;
  return TONE_COLOURS[said.tone];
}

/** The words standing on the display. */
export class Words {
  private words: Word[] = [];

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
      [young.frames, young.life] = [0, lifeOf(young.said)];
      return;
    }
    const line = place ? 0 : this.words.filter((word) => !word.at).length;
    const across = place ? Math.round((scatter * 2 - 1) * WORD_SCATTER_PX) : 0;
    const full: Said = { defender: -1, ...said };
    this.words.push({
      at: place,
      line,
      side: place ? side : 0,
      across,
      key,
      shield: said.shield ?? null,
      said: full,
      life: lifeOf(full),
      frames: 0,
      drop: 0,
      pose: null,
    });
  }

  /** The words standing: what each says, and where it stood this frame (its middle across and its top). */
  get standing(): readonly {
    readonly text: string;
    readonly stamps: readonly string[];
    readonly tags: readonly string[];
    readonly x: number | null;
    readonly y: number | null;
  }[] {
    return this.words.map((word) => ({
      text: textOf(word.said),
      stamps: stampsOf(word.said),
      tags: word.said.tags,
      x: word.pose?.x ?? null,
      y: word.pose?.y ?? null,
    }));
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
      if (frame >= word.life || !spot) return false;
      const pose = wordPose(frame, word.life, still);
      const [half, size] = [widthOf(word) / 2, sizeOf(word.said)];
      // Its near edge stands its throw from the blow, so the blow itself stays clear; a crit's or a kill's twice as far.
      const thrown = word.side * (WORD_THROW_PX * (size === WORD_PX.loud ? 2 : 1) + half);
      const middle = Math.round(spot.x + word.across + thrown);
      const top = Math.round(spot.y - pose.rise - size / 2);
      const want = { left: middle - half, right: middle + half, top, bottom: top + size };
      // A word whose place is off the screen's foot or side (a body right before the eyes) stands just inside it.
      const inside = word.at ? clampedTo(want, width, height) : want;
      // Pushed down to clear a plate, it stays down, so a plate fading out never lets it jump back up.
      const lowered = { ...inside, top: inside.top + word.drop, bottom: inside.bottom + word.drop };
      const box = word.at ? placeWord(lowered, plates, placed) : want;
      if (word.at) word.drop = box.top - inside.top;
      placed.push(box);
      word.pose = { x: (box.left + box.right) / 2, y: box.top, scale: pose.scale, shown: pose.shown };
      return true;
    });
  }

  /** The words as they stand: each its number in the game's face, outlined hard, with the small words on it and its
   *  stamps beside it in gold, grown about its middle while it pops. */
  nodes(): Node[] {
    return this.words.flatMap((word) => {
      const pose = word.pose;
      if (!pose?.shown) return [];
      const { said } = word;
      const loud = !!(said.crit || said.killed);
      const warn = said.tone === 'warn';
      const grow = pose.scale;
      const outline = (width: number) =>
        warn ? {} : { edge: 'halo' as const, edgeColour: '#000000', edgeWidth: width };
      const size = (loud ? 3 : 2) * grow;
      const small = (words: string, step: number): Node => ({
        text: { words: words.toUpperCase(), size: step * grow, colour: STAMP_GOLD, wrap: false, ...outline(2) },
        offset: [0, -Math.round(baselineRise(step * grow, size))],
      });
      // Its middle where a line as tall as its letters would stand, so its rise is the letters' own.
      const tall = (loud ? 3 : 2) * 11 + (warn ? 8 : 0);
      return [
        {
          direction: 'row',
          alignY: 'end',
          gap: 6 * grow,
          // A warning on red inside a white edge 2 px deep, its words 2 px in from that.
          ...(warn ? { padding: [4, 8] as const, fill: '#a0140c', outline: { width: 2, colour: '#ffffff' } } : {}),
          float: { to: 'screen', anchor: [0.5, 0.5], x: pose.x, y: pose.y + tall / 2, z: 1 },
          children: [
            { text: { words: textOf(said), size, colour: numberColour(word), wrap: false, ...outline(loud ? 3 : 2) } },
            ...said.tags.map((tag) => small(tag, 1)),
            ...stampsOf(said).map((stamp) => small(stamp, 2)),
          ],
        } satisfies Node,
      ];
    });
  }
}

/** The stamps beside a crit's number and a kill's. */
const stampsOf = (said: Partial<Said>): string[] => [
  ...(said.crit ? [CRIT_WORD] : []),
  ...(said.killed ? [SLAIN] : []),
];

/** A word's text: a number's total, after the word before it. */
export const textOf = (said: Pick<Said, 'text'> & Partial<Said>): string =>
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
