// The mark each other player wears over their ship at sea: the plate they wear over their head on land, its square
// and their name, stood clear over the masthead of their ship as it is drawn, larger than life.
import { type PlatedPlayer, PlayerPlates } from '../combat/playerPlates.ts';
import type { SeenShip } from '../network/messages.ts';
import type { PlayerPlate } from '../network/plateMessages.ts';
import { SLOOP_HULL, plateOverM } from '../ships/hulls.ts';
import { rosterNow } from './companyHud.ts';

/** How far across the water from the eye another player's ship wears its mark, metres: about where a ship drawn
 *  75 m long shrinks to a few pixels, past which a mark names a speck. */
export const SEA_PLATE_RANGE_M = 8_000;

/** The marks over other players' ships, laid as the plates on land are: out to `SEA_PLATE_RANGE_M`, the plate's foot
 *  where `seaPlated` puts each one's feet. */
export function seaPlates(): PlayerPlates {
  return new PlayerPlates(SEA_PLATE_RANGE_M, 0);
}

/** Each other player's ship in `others` whose plate the room sent, as its mark is drawn, the ships drawn `scale`
 *  times their size: its feet over its masthead, where the plate over a captain's ship stands in a fight. Every other
 *  player sails the Sloop, as the sea draws them. */
export function seaPlated(
  others: readonly SeenShip[],
  plates: ReadonlyMap<number, PlayerPlate>,
  scale: number,
): PlatedPlayer[] {
  const company = new Set((rosterNow()?.company?.members ?? []).map((member) => member.name.toLowerCase()));
  const over = plateOverM(SLOOP_HULL) * scale;
  return others.flatMap((ship) => {
    const plate = plates.get(ship.player);
    if (!plate) return [];
    const feet = [ship.x, ship.y, over] as const;
    return [{ id: ship.player, feet, plate, company: plate.name !== '' && company.has(plate.name.toLowerCase()) }];
  });
}
