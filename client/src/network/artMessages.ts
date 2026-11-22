import type { Gear } from '../../../generated/messages/ts/overlook/wire/gear.ts';
import type { Snapshot } from '../../../generated/messages/ts/overlook/wire/snapshot.ts';

/** A Core slot with no fragment in it, as the gear message carries it (protocol's gear_wire NO_FRAGMENT). */
const NO_FRAGMENT = 255;
/** How many Core slots each Art has. */
const CORE_SLOTS = 3;

type Point = readonly [number, number, number];

/** The player's own Arts as the room last sent them: the Art worn (1 Storm, 2 Divine, 3 Shadow, 0 none), each Art's
 *  Core in the Arts' order (three slots, each a fragment's place in its Art's list or null), how far the Anima has
 *  charged and each Tenet recharged, 0 to 1 (1 ready), as the room's tick that sent them had it; and what each Art's
 *  road has earned in the Arts' order (1 the Art, 2 its first Tenet, 4 its second), none from a room that sends none. */
export interface ArtState {
  readonly art: number;
  readonly cores: readonly (readonly (number | null)[])[];
  readonly anima: number;
  readonly tenets: readonly [number, number];
  readonly earned?: readonly number[];
}

/** Every bit an Art's road earns: the Art and both its Tenets. */
export const ALL_EARNED = 0b111;

/** What the road of the Art numbered `art` has earned, by `ArtState.earned`'s bits; all of it where the room has
 *  said nothing of it, so nothing is locked the room may allow. */
export const earnedOf = (state: ArtState | null | undefined, art: number): number =>
  state?.earned?.[art - 1] ?? ALL_EARNED;

/** The spells, by the number a cast and a spell's kind carry: each its Art's number less one, times three, plus its
 *  ability (0 the Anima, 1 and 2 the Tenets), plus one; and a Duskraven's bolt. */
export const SPELLS = {
  tempest: 1,
  quicken: 2,
  arcLash: 3,
  sunwell: 4,
  mend: 5,
  dawnflare: 6,
  duskraven: 7,
  duskDaggers: 8,
  vanish: 9,
  bolt: 10,
} as const;

/** The number of an Art's ability (0 the Anima, 1 and 2 the Tenets). */
export const spellNumber = (art: number, ability: number): number => (art - 1) * 3 + ability + 1;

/** A cast an input carries: the spell, and where it is aimed (Dusk Daggers' ring), if it is. */
export interface CastAsk {
  readonly spell: number;
  readonly aim: Point | null;
}

/** A spell every player sees, as a snapshot carries it (crates/room/src/spells.rs): its number in the room, its kind
 *  (`SPELLS`), its caster and Art, where it is, where it heads (a Dawnflare's end, Arc Lash's reach ahead), the foe it
 *  seeks, the ticks it has lasted of its life, and how far it reaches (a ring's or a well's radius, a cone's
 *  length). */
export interface SeenSpell {
  readonly id: number;
  readonly kind: number;
  readonly caster: number;
  readonly art: number;
  readonly at: Point;
  readonly heads: Point | null;
  readonly seeks: number | null;
  readonly age: number;
  readonly life: number;
  readonly radius: number;
}

const pointOf = (numbers: Float64Array | null): Point | null => {
  const [x, y, z] = numbers ?? [];
  return x === undefined || y === undefined || z === undefined ? null : [x, y, z];
};

/** The Arts a gear message holds; Art 0 where none is worn, as in the prologue's room. */
export function artsOf(gear: Gear): ArtState {
  const numbers = Array.from(gear.coresArray() ?? []);
  const cores = Array.from({ length: Math.ceil(numbers.length / CORE_SLOTS) }, (unused, art) =>
    numbers.slice(art * CORE_SLOTS, art * CORE_SLOTS + CORE_SLOTS).map((set) => (set === NO_FRAGMENT ? null : set)),
  );
  const [first = 0, second = 0] = Array.from(gear.tenetsArray() ?? []);
  const earned = Array.from(gear.artsEarnedArray() ?? []);
  return { art: gear.art(), cores, anima: gear.anima(), tenets: [first, second], earned };
}

/** Every spell a snapshot holds. */
export function spellsOf(snapshot: Snapshot): SeenSpell[] {
  return Array.from({ length: snapshot.spellsLength() }, (unused, index) => {
    const spell = snapshot.spells(index);
    if (!spell) throw new Error(`snapshot spell ${index} does not read`);
    return {
      id: spell.id(),
      kind: spell.kind(),
      caster: spell.caster(),
      art: spell.art(),
      at: pointOf(spell.atArray()) ?? [0, 0, 0],
      heads: pointOf(spell.headsArray()),
      seeks: spell.seeks() || null,
      age: spell.age(),
      life: spell.life(),
      radius: spell.radius(),
    };
  });
}
