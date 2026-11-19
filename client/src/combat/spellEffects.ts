import type { SeenSpell } from '../network/artMessages.ts';

type Point = readonly [number, number, number];

/** A spell as the page keeps it: as the room last sent it, where it was at the snapshot before (null when new), and
 *  the room ticks between the two snapshots. */
export interface KeptSpell extends SeenSpell {
  readonly before: Point | null;
  readonly ticks: number;
}

/** Every spell in the room, every player's, as its snapshots send them: each kept with where it was the snapshot
 *  before, so a drawer can glide it between the two as the foes' figures glide. Gone from a snapshot, gone here. */
export class SpellEffects {
  readonly spells = new Map<number, KeptSpell>();

  /** Takes a snapshot's spells, `ticks` room ticks after the last. */
  take(seen: readonly SeenSpell[], ticks: number): void {
    const present = new Set<number>();
    for (const spell of seen) {
      present.add(spell.id);
      this.spells.set(spell.id, { ...spell, before: this.spells.get(spell.id)?.at ?? null, ticks });
    }
    for (const id of this.spells.keys()) if (!present.has(id)) this.spells.delete(id);
  }

  /** Lets every spell go: the room left. */
  clear(): void {
    this.spells.clear();
  }

  /** Where a spell is `share` of the way from the snapshot before to the last (0 to 1). */
  static glided(spell: KeptSpell, share: number): Point {
    const from = spell.before ?? spell.at;
    const part = Math.min(1, Math.max(0, share));
    const along = (axis: 0 | 1 | 2) => from[axis] + (spell.at[axis] - from[axis]) * part;
    return [along(0), along(1), along(2)];
  }
}
