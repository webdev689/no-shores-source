/**
 * The ships gone down at sea, counted toward the bounties and quests of the players who fought them. No room holds a
 * character at sea, so the sea's host claims each fighter's kept character only while no other room holds it (a sea
 * count is never worth a player's place on land), counts the ship by the rules, and lets it go at once, untouched
 * when nothing moved.
 */

import type { Characters } from './accounts/characters.ts';

/** A ship gone down at sea as the room tells it (`room_ship_downs`). */
export interface ShipDown {
  readonly water: string | null;
  readonly rank: number;
  readonly players: readonly string[];
}

/** Counts each ship gone down toward the bounties and quests of each player at sea who fought her, by their session's
 *  token (`tokens`, by account): `count` is the rules' (`RoomDoor.countKept`), at the Unix `minute`. */
export async function countAtSea(
  downs: readonly ShipDown[],
  tokens: ReadonlyMap<string, string>,
  kept: Pick<Characters, 'claim' | 'release'>,
  count: (ask: string) => string,
  minute: number,
): Promise<void> {
  for (const down of downs)
    for (const account of down.players) {
      const token = tokens.get(account);
      if (!token) continue;
      const holder = `sea:${crypto.randomUUID()}`;
      const claimed = await kept.claim(token, holder, false).catch(() => null);
      if (!claimed) continue;
      const counted = count(JSON.stringify({ kept: claimed.body, water: down.water, rank: down.rank, minute }));
      await kept.release(claimed.account, holder, counted === '' ? null : counted).catch(() => false);
    }
}
