/**
 * Who stands ashore, told to the sea. Every room on an island (a node's room, its dungeons' and runs', a passage
 * zone's, a sea island's room and its dungeon's) names its players to every sea (`SEAS`), each with their ship, level,
 * username and guild tag as they have them now, as each one's account is known and every 15 seconds after, with the
 * host's time, as a sea room stops ticking while nobody sails it. The sea keeps each named player's parked ship seen
 * while it lies at that island (a run started at sea keeps it seen wherever it lies), holds a sea island named, and
 * answers with every ship parked there and every traffic ship it has taken off its route, which an island's own ground
 * sends in its snapshots (crates/room/src/sea_parked.rs, crates/room-wasm/src/parked_door.rs).
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

/** Every sea a player may come ashore from, and so every room on land names its players to: the one, at Normal, for
 *  now (`seaRoom`), whatever tier a voyage sets out at. */
const SEAS = [seaRoomName(0)];

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

/** A sea's answer to a naming: the ships parked at the island, and the traffic ids it has taken off their routes. */
interface Answer {
  readonly ships: readonly { number: number }[];
  readonly taken: readonly number[];
}

/** A room's naming of its players ashore: where it stands (none for a room on no island, which names no one), each
 *  player whose account the room has learnt, and each sea's last answer with the time of the naming it answered. */
export class Ashore {
  private place: Place | null = null;
  private readonly players = new Set<number>();
  private readonly answers = new Map<string, Answer & { readonly at: number }>();
  private told = 0;
  private readonly sea: (name: string) => { ashoreWord(word: string): Promise<string> };
  private readonly give: (answer: string) => void;
  private readonly named: (player: number) => string;

  /** `sea` reaches a sea's room by its name; `give` hands the room the seas' answers made one (`Answer`), as JSON;
   *  `named` is the room's word on a player for the seas, their account, their ship and level as their character has
   *  them now and their username and guild tag as the accounts told it (`room_named`), empty for one it holds no
   *  account of. */
  constructor(
    sea: (name: string) => { ashoreWord(word: string): Promise<string> },
    give: (answer: string) => void,
    named: (player: number) => string,
  ) {
    [this.sea, this.give, this.named] = [sea, give, named];
  }

  /** Where the room stands, once it has opened (`placeOf`). */
  stand(place: Place | null): void {
    this.place = place;
  }

  /** A player's account, as the room learns it: ashore, the seas are told at once. At sea (`seas`, this sea's tier),
   *  every other sea, none while there is one, is told to let go of the player's ship parked there, as they sail it
   *  here now. */
  own(player: number, account: string, seas: number | null = null): void {
    if (seas !== null) {
      const word = JSON.stringify({ named: [], afloat: [account], seconds: Math.floor(Date.now() / 1000) });
      for (const sea of SEAS.filter((name) => name !== seaRoomName(seas)))
        void this.sea(sea)
          .ashoreWord(word)
          .catch(() => undefined);
      return;
    }
    this.players.add(player);
    this.name(Date.now());
  }

  left(player: number): void {
    this.players.delete(player);
  }

  /** Names the players again once `ASHORE_EVERY_MS` has passed since the last. */
  due(now: number): void {
    if (now - this.told >= ASHORE_EVERY_MS) this.name(now);
  }

  /** Tells each sea who stands here, and hands the room every ship the seas answer are parked here and every traffic
   *  ship they have taken: a sea that does not answer keeps its last answer for `ANSWER_KEPT_MS`, one not open has
   *  none. */
  private name(now: number): void {
    const place = this.place;
    if (!place) return;
    this.told = now;
    const lapsed = [...this.answers].filter(([, answer]) => now - answer.at > ANSWER_KEPT_MS);
    lapsed.forEach(([sea]) => this.answers.delete(sea));
    if (lapsed.length > 0) this.hand(place);
    const named = [...this.players].map(this.named).filter((each) => each !== '');
    const word = JSON.stringify({
      named: named.map((each) => JSON.parse(each) as unknown),
      ...place.island,
      seconds: Math.floor(now / 1000),
    });
    place.seas.forEach((sea, index) => {
      void this.sea(sea)
        .ashoreWord(word)
        .then((answer) => {
          const { ships, taken } = answer ? (JSON.parse(answer) as Answer) : { ships: [], taken: [] };
          const apart = ships.map((ship) => ({ ...ship, number: ship.number + index * SEA_APART }));
          this.answers.set(sea, { at: now, ships: apart, taken });
          this.hand(place);
        })
        .catch(() => undefined);
    });
  }

  /** Hands the room every ship and taken traffic id the seas' last answers hold, where its page draws them. */
  private hand(place: Place): void {
    if (!place.draws) return;
    const answers = [...this.answers.values()];
    const ships = answers.flatMap((answer) => answer.ships);
    this.give(JSON.stringify({ ships, taken: [...new Set(answers.flatMap((answer) => answer.taken))] }));
  }
}
