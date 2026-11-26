/**
 * Who stands ashore, told to the sea. Every room on an island (a node's room, its dungeons' and runs', a passage
 * zone's, a sea island's room and its dungeon's) names the accounts of the players it holds to all three seas as each
 * one's account is known and every 15 seconds after, with the host's time, as a sea room stops ticking while nobody
 * sails it. The sea keeps each named account's parked ship seen
 * while it lies at that island (a run started at sea keeps it seen wherever it lies), holds a sea island named, and
 * answers with every ship parked at the island, which the room sends in its snapshots (crates/room/src/sea_parked.rs).
 */

import type { Reach } from './arrival.ts';
import { nodeRoom, passageRoom, seaRoomName, startedAtSea } from './roomNames.ts';

/** How often a room names its players again: three times within the 45 s a naming keeps a ship seen. */
export const ASHORE_EVERY_MS = 15_000;

/** How long a sea's last answer is handed on once it stops answering: as long as a naming keeps a ship seen there. */
const ANSWER_KEPT_MS = 45_000;

/** How far apart the numbers of the ships of each sea after the first are set, so two seas' ships never share one. */
const SEA_APART = 2 ** 30;

/** Where a room stands ashore: the sea rooms it names its players to, its island as its word names it (none for a run
 *  started at sea), and whether its page draws the ships parked there: an island's own ground does, a dungeon, a run
 *  or a passage zone does not, so it is handed none to send. */
export interface Place {
  readonly seas: readonly string[];
  readonly island: { readonly continent: string } | { readonly island: number; readonly seed: string } | null;
  readonly draws: boolean;
}

/** Every sea, by its tier: a player may come ashore anywhere from any of them (a social space's or an outpost's node
 *  from any tier, an Elite Dungeon's run, a Breach's zone and run and a passage zone from a node at any), so every
 *  room on land names its players to all three. */
const SEAS = [0, 1, 2].map(seaRoomName);

/** Where the room `name` stands ashore: at the sea island it is on or behind (`isle`), at its node's island (`reach`,
 *  null where unknown) or a passage zone's, or anywhere for a run started at sea; null for a room on no island. */
export function placeOf(
  name: string,
  reach: Reach | null,
  isle: { readonly id: number; readonly seed: string } | null,
): Place | null {
  if (isle) return { seas: SEAS, island: { island: isle.id, seed: isle.seed }, draws: name.startsWith('isle-') };
  const passage = passageRoom(name);
  if (passage) return { seas: SEAS, island: { continent: passage.island }, draws: false };
  const node = name.startsWith('node-') ? nodeRoom(name.slice('node-'.length)) : null;
  if (!node) return null;
  if (startedAtSea(name)) return { seas: SEAS, island: null, draws: false };
  const draws = node.dungeon === null && node.run === null;
  return reach ? { seas: SEAS, island: { continent: reach.continent }, draws } : null;
}

/** A room's naming of its players ashore: where it stands (none for a room on no island, which names no one), each
 *  player's account as the room learns it, and each sea's last answer with the time of the naming it answered. */
export class Ashore {
  private place: Place | null = null;
  private readonly accounts = new Map<number, string>();
  private readonly answers = new Map<string, { readonly at: number; readonly ships: readonly { number: number }[] }>();
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

  /** A player's account, as the room learns it: ashore, the seas are told at once. At sea (`seas`, this sea's tier),
   *  the other two are told to let go of the player's ship parked there, as they sail it here now. */
  own(player: number, account: string, seas: number | null = null): void {
    if (seas !== null) {
      const word = JSON.stringify({ accounts: [], afloat: [account], seconds: Math.floor(Date.now() / 1000) });
      for (const sea of SEAS.filter((name) => name !== seaRoomName(seas)))
        void this.sea(sea)
          .ashoreWord(word)
          .catch(() => undefined);
      return;
    }
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
   *  not answer keeps its last answer for `ANSWER_KEPT_MS`, one not open has none. */
  private name(now: number): void {
    const place = this.place;
    if (!place) return;
    this.told = now;
    const lapsed = [...this.answers].filter(([, answer]) => now - answer.at > ANSWER_KEPT_MS);
    lapsed.forEach(([sea]) => this.answers.delete(sea));
    if (lapsed.length > 0) this.hand(place);
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
          const apart = ships.map((ship) => ({ ...ship, number: ship.number + index * SEA_APART }));
          this.answers.set(sea, { at: now, ships: apart });
          this.hand(place);
        })
        .catch(() => undefined);
    });
  }

  /** Hands the room every ship the seas' last answers hold, where its page draws them. */
  private hand(place: Place): void {
    if (place.draws) this.give(JSON.stringify([...this.answers.values()].flatMap((answer) => answer.ships)));
  }
}
