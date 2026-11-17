import { ASKS, type GearState } from '../network/gearMessages.ts';
import type { Fighting } from './fighting.ts';

/** The gear crate's numbers for the kinds a test's player fights with. */
export const KIND = { sword: 2, bow: 8, pistolet: 10, shield: 12 } as const;

/**
 * Has a player in the Test Ground's room take up these kinds as the room demands, through their gear: each handed out
 * as a Normal item of level 1, then worn, the first in the main hand and a shield in the off hand. `gear` reads the
 * player's gear as the room last sent it, and `tick` runs the room a tick. For tests that fight with a weapon the
 * starting kit lacks.
 */
export function wear(
  fighting: Fighting,
  gear: () => GearState | null,
  tick: () => void,
  kinds: readonly number[],
): void {
  for (const kind of kinds) {
    const before = new Set(gear()?.items.map((item) => item.id) ?? []);
    fighting.askGear({ kind: ASKS.grantItem, itemKind: kind, rarity: 0, level: 1 });
    tick();
    tick();
    const item = gear()?.items.find((each) => !before.has(each.id) && each.kind === kind);
    if (!item) throw new Error(`the room handed out no item of kind ${kind}`);
    fighting.askGear({ kind: ASKS.wear, item: item.id, slot: kind === KIND.shield ? 1 : 0 });
    tick();
    tick();
  }
}
