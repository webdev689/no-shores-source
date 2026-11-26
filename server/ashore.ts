/**
 * Who stands ashore, told to the sea. Every room on an island (a node's room, its dungeons' and runs', a sea island's
 * room and its dungeon's) names the accounts of the players it holds to the sea rooms they land from (every tier's
 * for a social space, its own tier's otherwise) as each one's account is known and every 15 seconds after, with the
 * host's time, as a sea room stops ticking while nobody sails it. The sea keeps each named account's parked ship seen
 * while it lies at that island (a run started at sea keeps it seen wherever it lies), holds a sea island named, and
 * answers with every ship parked at the island, which the room sends in its snapshots (crates/room/src/sea_parked.rs).
 */

import type { Reach } from './arrival.ts';
import { nodeRoom, seaRoomName, startedAtSea } from './roomNames.ts';

/** How often a room names its players again: three times within the 45 s a naming keeps a ship seen. */
export const ASHORE_EVERY_MS = 15_000;

/** How far apart the numbers of the ships of each sea after the first are set, so two seas' ships never share one. */
const SEA_APART = 2 ** 30;

/** Where a room stands ashore: the sea rooms it names its players to, and its island as its word names it, none for a
 *  run started at sea. */
export interface Place {
  readonly seas: readonly string[];
  readonly island: { readonly continent: string } | { readonly island: number; readonly seed: string } | null;
}

/** Where the room `name` stands ashore: at the sea island it is on or behind (`isle`, with its sea's room), at its
 *  node's island (`reach`, null where unknown), or anywhere for a run started at sea; null for a room on no island. */
export function placeOf(
  name: string,
  reach: Reach | null,
  isle: { readonly id: number; readonly seed: string; readonly sea: string } | null,
): Place | null {
  if (isle) return { seas: [isle.sea], island: { island: isle.id, seed: isle.seed } };
  const node = name.startsWith('node-') ? nodeRoom(name.slice('node-'.length)) : null;
  if (!node) return null;
  // Entered from any tier's sea (`arrives`), a run started at sea names its players to all three.
  if (startedAtSea(name)) return { seas: [0, 1, 2].map(seaRoomName), island: null };
  if (!reach) return null;
  const seas = reach.social ? [0, 1, 2].map(seaRoomName) : [seaRoomName(node.seas)];
  return { seas, island: { continent: reach.continent } };
}

/** A room's naming of its players ashore: where it stands (none for a room on no island, which names no one), each
 *  player's account as the room learns it, and each sea's last answer. */
export class Ashore {
  private place: Place | null = null;
  private readonly accounts = new Map<number, string>();
  private readonly answers = new Map<string, readonly { readonly number: number }[]>();
  private told = 0;
  private readonly sea: (name: string) => { ashoreWord(word: string): Promise<string> };
  private readonly give: (ships: string) => void;

  /** `sea` reaches a sea's room by its name; `give` hands the room the ships parked at its island, as JSON. */
  constructor(sea: (name: string) => { ashoreWord(word: string): Promise<string> }, give: (ships: string) => void) {
    [this.sea, this.give] = [sea, give];
  }

  /** Where the room stands, once it has opened (`placeOf`). */
  stand(place: Place | null): void {
    this.place = place;
  }

  /** A player's account, as the room learns it: the seas are told at once. */
  own(player: number, account: string): void {
    this.accounts.set(player, account);
    this.name(Date.now());
  }

  left(player: number): void {
    this.accounts.delete(player);
  }

  /** Names the players again once `ASHORE_EVERY_MS` has passed since the last. */
  due(now: number): void {
    if (now - this.told >= ASHORE_EVERY_MS) this.name(now);
  }

  /** Tells each sea who stands here, and hands the room every ship the seas answer are parked here: a sea that does
   *  not answer keeps its last answer, one not open has none. */
  private name(now: number): void {
    const place = this.place;
    if (!place) return;
    this.told = now;
    const word = JSON.stringify({
      accounts: [...this.accounts.values()],
      ...place.island,
      seconds: Math.floor(now / 1000),
    });
    place.seas.forEach((sea, index) => {
      void this.sea(sea)
        .ashoreWord(word)
        .then((answer) => {
          const ships = answer ? (JSON.parse(answer) as { number: number }[]) : [];
          this.answers.set(
            sea,
            ships.map((ship) => ({ ...ship, number: ship.number + index * SEA_APART })),
          );
          this.give(JSON.stringify([...this.answers.values()].flat()));
        })
        .catch(() => undefined);
    });
  }
}
