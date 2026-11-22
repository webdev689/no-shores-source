import type { Plate } from '../../../generated/messages/ts/overlook/wire/plate.ts';

/** What others read over a player's head, as the room sends it: their username (empty for a guest), their level, and
 *  whether a menu is open on their screen. */
export interface PlayerPlate {
  readonly player: number;
  readonly name: string;
  readonly level: number;
  readonly menu: boolean;
}

/** The plates a message holds. */
export function platesOf(count: number, entry: (index: number) => Plate | null): PlayerPlate[] {
  return Array.from({ length: count }, (unused, index) => {
    const each = entry(index);
    return {
      player: each?.player() ?? 0,
      name: each?.name() ?? '',
      level: each?.level() ?? 0,
      menu: each?.menu() ?? false,
    };
  });
}
