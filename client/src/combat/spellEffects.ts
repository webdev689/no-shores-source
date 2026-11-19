import type { SeenSpell } from '../network/artMessages.ts';

/** A spell as the page keeps it: as the room last sent it. */
export type KeptSpell = SeenSpell;

/** Every spell in the room, every player's, as its snapshots send them: a drawer glides each between them as the foes'
 *  figures glide. Gone from a snapshot, gone here. */
export class SpellEffects {
  readonly spells = new Map<number, KeptSpell>();
  /** The Art each caster last cast in, by the room's number for them: their next cast glows in it. */
  readonly arts = new Map<number, number>();

  /** Takes a snapshot's spells. */
  take(seen: readonly SeenSpell[]): void {
    const present = new Set<number>();
    for (const spell of seen) {
      present.add(spell.id);
      this.arts.set(spell.caster, spell.art);
      this.spells.set(spell.id, spell);
    }
    for (const id of this.spells.keys()) if (!present.has(id)) this.spells.delete(id);
  }

  /** Lets every spell go: the room left. */
  clear(): void {
    this.spells.clear();
    this.arts.clear();
  }
}
