// What the Arts' screen shows, from the Arts' own file and the room's word on what is worn: each Art with its spells
// and fragments, a card for each as the gear's cards are drawn, the Core's choice of fragments (none set twice), the
// pictures the HUD draws an Art with, and the asks the screen sends the room. Nothing changes until the room answers.

import arts from '../../../content/arts/arts.json' with { type: 'json' };
import { hudKeys } from './controls.ts';
import { FRAGMENT_MAPS } from './artFragments.ts';
import { EMBLEM_FRAME, EMBLEM_MAPS, SPELL_MAPS, mapSvg } from '../player/artGlyphs.ts';
import type { ArtState } from '../network/artMessages.ts';
import { ASKS, type GearAsk } from '../network/gearMessages.ts';
import { GIVES, HEALS_A_SECOND, LEVEL_MOST, folded, fragmentWords, lastingAt, powerAt, scaled } from './artLevels.ts';
import type { Card } from './gearCards.ts';

/** A spell: its key, name and words, its recharge in seconds, and its numbers by name. */
export interface Spell {
  readonly key: string;
  readonly name: string;
  readonly text: string;
  readonly rechargeS: number;
  readonly [field: string]: string | number | undefined;
}
/** A fragment of an Art's Core: its key, name and words, and its numbers by name. */
export interface Fragment {
  readonly key: string;
  readonly name: string;
  readonly text: string;
  readonly [field: string]: string | number | undefined;
}
/** An Art, as the Arts' file holds it: its id, key, name, element (the gear crate's number) and words, its Anima, its
 *  two Tenets and the six fragments of its Core. */
export interface Art {
  readonly id: number;
  readonly key: string;
  readonly name: string;
  readonly element: number;
  readonly blurb: string;
  readonly anima: Spell;
  readonly tenets: readonly Spell[];
  readonly core: readonly Fragment[];
}

/** The Arts, Storm first. */
export const ARTS: readonly Art[] = arts.arts;
/** The slots of an Art's Core. */
export const CORE_SLOTS = 3;

/** What the Arts' screen asks of the room: to wear an Art, to set one of an Art's fragments (its place in the Art's
 *  list) in one of its Core's slots, or to choose one not owned while its road's choice waits. */
export type ArtsAsk =
  | { readonly kind: 'wearArt'; readonly art: number }
  | { readonly kind: 'setCore'; readonly art: number; readonly slot: number; readonly fragment: number }
  | { readonly kind: 'chooseFragment'; readonly art: number; readonly fragment: number };

/** Each Art's Core by its id: each slot's fragment, by its place in the Art's list, or null while empty. */
export type Cores = Readonly<Record<number, readonly (number | null)[]>>;

export const artOf = (id: number): Art | undefined => ARTS.find((art) => art.id === id);

/** The room's word on the Arts as the screen reads it: each Art's Core by its id. */
export function coresOf(state: ArtState): Cores {
  return Object.fromEntries(state.cores.map((core, index) => [ARTS[index]?.id ?? index + 1, core]));
}

/** The screen's ask as an input carries it to the room. */
export function gearAskOf(ask: ArtsAsk): GearAsk {
  if (ask.kind === 'wearArt') return { kind: ASKS.wearArt, column: ask.art };
  if (ask.kind === 'chooseFragment') return { kind: ASKS.chooseFragment, column: ask.art, node: ask.fragment };
  return { kind: ASKS.setCore, column: ask.art, slot: ask.slot, node: ask.fragment };
}

/** An Art's Core as its slots: three, each a fragment or null, whatever the room sent. */
export function coreOf(cores: Cores, art: number): (number | null)[] {
  const sent = cores[art] ?? [];
  return Array.from({ length: CORE_SLOTS }, (unused, slot) => sent[slot] ?? null);
}

/** A spell's numbers its card lists, in this order, each with its label and how it is written. */
const NUMBERS: readonly (readonly [field: string, label: string, written: (value: number) => string])[] = [
  ['damage', 'Damage', String],
  ['heal', 'Heals', String],
  ['orbs', 'Orbs', String],
  ['radius', 'Radius', (value) => `${value} m`],
  ['reach', 'Reach', (value) => `${value} m`],
  ['coneDegrees', 'Cone', (value) => `${value} degrees`],
  ['length', 'Flies', (value) => `${value} m`],
  ['width', 'Burns within', (value) => `${value} m`],
  ['roll', 'Roll', (value) => `${value} m`],
  ['speed', 'Speed', (value) => `${value} m/s`],
  ['everyS', 'Strikes every', (value) => `${value} s`],
  ['lifeS', 'Lasts', (value) => `${value} s`],
  ['flightS', 'Flight', (value) => `${value} s`],
  ['healShare', 'Heals you', (value) => `${Math.round(value * 100)}% of its damage`],
];

/** What a spell or fragment gives and how long it lasts at `level`, with the fragments `held` in the Core, as a card's
 *  row; none if it gives nothing. */
function givesRow(key: string, level: number, held: readonly Fragment[] = []): [string, string][] {
  const gives = GIVES[key];
  if (!gives) return [];
  const seconds = folded(key, 'givesS', gives[1], held);
  return [[gives[0], `${Math.round(seconds * lastingAt(level) * 10) / 10} s`]];
}

/** The fragments an Art's Core holds, from each slot's index in the Art's list. */
export function heldOf(art: Art, core: readonly (number | null)[]): Fragment[] {
  return core.flatMap((index) => (index === null ? [] : (art.core[index] ?? [])));
}

/** A spell's numbers at an Art's `level` with the fragments `held` in its Core, as its card's rows: its harm, healing
 *  and life as the room scales them, and what the Core changes as the room folds it in. */
export function spellNumbers(spell: Spell, level = LEVEL_MOST, held: readonly Fragment[] = []): [string, string][] {
  const rows = NUMBERS.flatMap(([field, label, written]) => {
    const value = spell[field];
    return typeof value === 'number'
      ? [[label, written(scaled(spell.key, field, folded(spell.key, field, value, held), level))] as [string, string]]
      : [];
  });
  const linked = HEALS_A_SECOND[spell.key];
  const heals: [string, string][] =
    linked === undefined ? [] : [['Heals a second', String(Math.round(linked * powerAt(level) * 10) / 10)]];
  return [...rows, ...heals, ...givesRow(spell.key, level, held)];
}

/** A fragment's numbers the room scales by an Art's `level`, as its card's rows: the seconds it adds and what it
 *  gives, with the fragments `held` in the Core. Its other numbers stay in its words. */
export function fragmentNumbers(
  fragment: Fragment,
  level = LEVEL_MOST,
  held: readonly Fragment[] = [],
): [string, string][] {
  const more = typeof fragment['moreS'] === 'number' ? scaled(fragment.key, 'moreS', fragment['moreS'], level) : null;
  const rows: [string, string][] = more === null || more === fragment['moreS'] ? [] : [['Longer by', `${more} s`]];
  return [...rows, ...givesRow(fragment.key, level, held)];
}

/** A recharge as a player reads one: under a minute in seconds ("38 s"), else minutes and seconds ("8:20"). */
export function rechargeWords(seconds: number): string {
  const whole = Math.round(seconds);
  return whole < 60 ? `${whole} s` : `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/** A spell's card: its name, whether it is the Anima or a Tenet and its element, its recharge large, its numbers at
 *  the Art's `level` with its Core (`core`, each slot's index in the Art's) and what it does. */
export function spellCard(art: Art, spell: Spell, level = LEVEL_MOST, core: readonly (number | null)[] = []): Card {
  return {
    name: spell.name,
    rarity: 0,
    kind: spell === art.anima ? 'Anima' : 'Tenet',
    big: { label: 'Recharge', value: rechargeWords(spell.rechargeS) },
    rows: spellNumbers(spell, level, heldOf(art, core)),
    element: art.element,
    traits: [],
    words: spell.text,
    compare: null,
  };
}

/** A fragment's card: its name, its Art and element, its numbers at the Art's `level` with the Core's fragments
 *  (`core`, each slot's index in the Art's), what it does, and, set in a slot, which; not owned, how it is had. */
export function fragmentCard(
  art: Art,
  fragment: Fragment,
  setIn: number | null = null,
  level = LEVEL_MOST,
  howHad: string | null = null,
  core: readonly (number | null)[] = [],
): Card {
  const held = heldOf(art, core);
  const where = setIn === null ? '' : ` Set in Core slot ${setIn + 1}.`;
  return {
    name: fragment.name,
    rarity: 0,
    kind: `${art.name} fragment${howHad ? ', not owned' : ''}`,
    big: null,
    rows: fragmentNumbers(fragment, level, held),
    element: art.element,
    traits: [],
    words: `${fragmentWords(fragment, level)}${where}${howHad ? ` ${howHad}` : ''}`,
    compare: null,
  };
}

/** An empty Core slot's card. */
export function slotCard(art: Art, slot: number): Card {
  return {
    name: `Core slot ${slot + 1}`,
    rarity: 0,
    kind: `${art.name} Core`,
    big: null,
    rows: [],
    element: art.element,
    traits: [],
    words: `Empty. Set one of ${art.name}'s six fragments here.`,
    compare: null,
  };
}

/** An Art's card, on its diamond: its name and element, whether it is worn, its level, its spells, and its words. */
export function artCard(art: Art, worn = false, level = LEVEL_MOST): Card {
  return {
    name: art.name,
    rarity: 0,
    kind: worn ? 'Art, worn' : 'Art',
    big: { label: 'Level', value: level },
    rows: [
      ['Anima', art.anima.name],
      ['Tenets', art.tenets.map((tenet) => tenet.name).join(', ')],
    ],
    element: art.element,
    traits: [],
    words: art.blurb,
    compare: null,
  };
}

/** One fragment in a Core slot's flyout: its place in the Art's list, the slot it is set in (null for none), whether
 *  it is owned, and what choosing it asks: nothing while it is set here already or in another slot, as a fragment is
 *  never set twice, nor while it is not owned, as the room would refuse it (114). */
export interface FragmentChoice {
  readonly index: number;
  readonly fragment: Fragment;
  readonly setIn: number | null;
  readonly owned: boolean;
  readonly ask: ArtsAsk | null;
}

/** The flyout of `slot` in `art`'s Core: its six fragments, each with what choosing it asks; `owned` says which the
 *  player owns, by place. */
export function coreChoices(
  art: Art,
  core: readonly (number | null)[],
  slot: number,
  owned: (fragment: number) => boolean = () => true,
): FragmentChoice[] {
  return art.core.map((fragment, index) => {
    const found = core.indexOf(index);
    const setIn = found < 0 ? null : found;
    const mine = owned(index);
    const free = setIn === null && mine;
    const ask: ArtsAsk | null = free ? { kind: 'setCore', art: art.id, slot, fragment: index } : null;
    return { index, fragment, setIn, owned: mine, ask };
  });
}

/** The key that casts each spell, as bound now for the keys or the pad last used (`hudKeys`), or among `keys`: the
 *  Anima's, then each Tenet's. */
export function keyOf(art: Art, spell: Spell, keys: readonly string[] = hudKeys().arts): string {
  return spell === art.anima ? (keys[0] ?? '') : (keys[art.tenets.indexOf(spell) + 1] ?? '');
}

/** An Art's emblem in its diamond, as SVG. */
export const emblemSvg = (art: Art): string => mapSvg(EMBLEM_MAPS[art.key], art.element);
/** The double diamond an Art's emblem stands in on its screen, as SVG. */
export const frameSvg = (art: Art): string => mapSvg(EMBLEM_FRAME, art.element);
/** A spell's icon, as SVG. */
export const spellSvg = (art: Art, spell: Spell): string => mapSvg(SPELL_MAPS[spell.key], art.element);
/** A fragment's icon, as SVG. */
export const fragmentSvg = (art: Art, fragment: Fragment): string => mapSvg(FRAGMENT_MAPS[fragment.key], art.element);

/** The pictures the HUD's ability bar draws an Art with; null for no Art. */
export { abilityPictures } from '../player/artGlyphs.ts';
