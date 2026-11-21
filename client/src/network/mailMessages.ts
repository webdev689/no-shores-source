import type { Gear } from '../../../generated/messages/ts/overlook/wire/gear.ts';
import type { GearItem as GearItemTable } from '../../../generated/messages/ts/overlook/wire/gear-item.ts';
import type { GearItem, GearVestige } from './gearMessages.ts';

/** A letter of the game's mail (protocol's `GearLetter`): its number, where what it holds came from (the gear crate's
 *  `mail::Source`, worded by `letterWords`), whether it tells of a letter a full mailbox let go, and what it holds, a
 *  Vestige or an item, or neither. */
export interface GearLetter {
  readonly id: number;
  readonly from: number;
  readonly crowded: boolean;
  readonly vestige: GearVestige | null;
  readonly item: GearItem | null;
}

/** The letters a gear message holds, oldest first, each item read by `itemOf` as the message's own items are. */
export function mailOf(gear: Gear, itemOf: (item: GearItemTable) => GearItem): GearLetter[] {
  return Array.from({ length: gear.mailLength() }, (unused, place) => {
    const letter = gear.mail(place);
    if (!letter) throw new Error(`letter ${place} is missing`);
    const vestige = letter.vestige();
    const item = letter.item();
    return {
      id: letter.id(),
      from: letter.from(),
      crowded: letter.crowded(),
      vestige: vestige
        ? { id: vestige.id(), rarity: vestige.rarity(), slot: vestige.slot(), level: vestige.level(), vaulted: false }
        : null,
      item: item ? itemOf(item) : null,
    };
  });
}
