/**
 * A player who travels aboard a company member's ship, at sea. One joins the sea naming the member whose ship they
 * board by username (`?aboard=<username>`): the sea lets them in with no ship of their own, and theirs, if they keep
 * one, stays where it lies. Once their account is known they board that member's ship, the accounts saying who their
 * company is; one whose company has no such ship here is sent away, saying so (`room::sea::passengers`).
 */

import { USERNAME } from './accounts/names.ts';

/** Why a player asking to travel aboard is sent away: no ship of their company's by that name sails here. */
export const NOT_ABOARD = 'Their ship is not at sea.';

/** What boarding asks of the sea's room: a player's asking as they join, and their boarding (`roomDoor.ts`). */
export interface AboardRoom {
  askAboard(player: number): boolean;
  goAboard(player: number, word: string): boolean;
}

/** The username of the member whose ship a join asks to travel aboard (`?aboard=`), or null for none. */
export function aboardAsked(request: Request): string | null {
  const name = new URL(request.url).searchParams.get('aboard');
  return name !== null && USERNAME.test(name) ? name : null;
}

/** The sea's passengers as they join and as their accounts are known. */
export class Aboard {
  // shortcut: a join that never signs in keeps its entry for the room's life; drop it on leaving if rooms grow long.
  private readonly asked = new Map<number, string>();
  private readonly room: AboardRoom;
  private readonly company: (account: string) => Promise<readonly string[]>;
  private readonly away: (player: number, why: string) => void;

  /** `company` is the accounts' word on an account's company, its own among them; `away` sends a player off. */
  constructor(
    room: AboardRoom,
    company: (account: string) => Promise<readonly string[]>,
    away: (player: number, why: string) => void,
  ) {
    [this.room, this.company, this.away] = [room, company, away];
  }

  /** A player joined: one whose join asks to travel aboard asks the sea, before their character comes. */
  joined(player: number, request: Request): void {
    const captain = aboardAsked(request);
    if (captain !== null && this.room.askAboard(player)) this.asked.set(player, captain);
  }

  /** A player's account, once known: one who asked boards their company member's ship, or is sent away. */
  async owned(player: number, account: string): Promise<void> {
    const captain = this.asked.get(player);
    if (captain === undefined) return;
    this.asked.delete(player);
    const company = await this.company(account).catch(() => []);
    if (!this.room.goAboard(player, JSON.stringify({ captain, company }))) this.away(player, NOT_ABOARD);
  }
}
