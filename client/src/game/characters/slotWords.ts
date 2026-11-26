// What a slot says of its character: its level, Prestige and Defense as its room kept them to show, its emblem, the
// house it is pledged to in that house's own colour, where it last was, and whether its story waits.
import cosmetics from '../../../../content/gear/cosmetics.json' with { type: 'json' };
import factions from '../../../../content/gear/factions.json' with { type: 'json' };
import type { Slot } from '../../network/characters.ts';
import { type Emblem, emblemOf } from '../../plus/emblemArt.ts';
import { colourOf } from '../../ui/quads.ts';
import { INK } from '../gearNodes.ts';
import { FIRST_NODE } from '../nodes.ts';

/** What one slot shows: none of it for an empty slot. */
export interface SlotWords {
  readonly level: number | null;
  readonly prestige: number | null;
  readonly defense: number | null;
  readonly emblem: Emblem;
  readonly house: string;
  readonly houseColour: string;
  readonly place: string;
  /** "The prologue waits" for one not past it; null for one that is. */
  readonly story: string | null;
}

/** The share of white a colour must hold to read on the screen's dark ground. */
const READS = 0.4;

/** A house's own colour: the lighter of its dye's middle tones that reads on the dark ground. */
function houseColourOf(dye: string): string {
  const look = cosmetics.cosmetics.find((each) => each.id === dye)?.look ?? [];
  const tones = [look[2], look[3]].filter((tone): tone is string => typeof tone === 'string');
  const light = (tone: string) => {
    const [red, green, blue] = colourOf(tone);
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  return tones.find((tone) => light(tone) >= READS) ?? tones.at(-1) ?? INK.word;
}

/** The house a character is pledged to, by its number, in its colour; "No house" for none. */
export function houseOf(pledge: number | null): { readonly name: string; readonly colour: string } {
  const house = factions.factions.find((each) => each.id === pledge);
  return house ? { name: house.name, colour: houseColourOf(house.dye) } : { name: 'No house', colour: INK.faint };
}

/** Where a character last was, in words: at sea, or the social space it stood in; Overlook for one never kept in
 *  either, which is where it arrives. */
export function placeWords(place: Slot['place'], placeName: (id: string) => string): string {
  if (place?.kind === 'sea') return 'At sea';
  return placeName(place?.kind === 'social' ? place.node : FIRST_NODE);
}

/** What a slot shows of its character; an empty slot's words are all none, its emblem the first. */
export function slotWords(slot: Slot | null, placeName: (id: string) => string): SlotWords {
  const shown = slot?.shown ?? null;
  const house = houseOf(slot?.pledge ?? null);
  return {
    level: shown?.level ?? (slot ? 1 : null),
    prestige: slot ? (shown?.prestige ?? 0) : null,
    defense: shown?.defense ?? null,
    emblem: emblemOf(shown?.emblem ?? null),
    house: house.name,
    houseColour: house.colour,
    place: slot ? placeWords(slot.place, placeName) : '',
    story: slot && !slot.prologue ? 'The prologue waits' : null,
  };
}
