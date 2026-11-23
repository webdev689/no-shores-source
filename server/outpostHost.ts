/**
 * The host's side of a guild's outpost's room (`node-<site>--guild-<key>`). It stands the guild's plot as blocks, as
 * the page draws it (`outpostPlaces.ts` `plotBoxes`), and stands it anew each time the plot is read again: on a
 * player's word that it changed (at most once a second, which the room judges) and after every delivery the accounts
 * used. Each tick it takes the errands the room holds for its players' asks, asks the accounts, and gives each answer
 * back, so the room gives back what was not moved or used. An errand the accounts throw on is given back whole; a
 * deposit is asked again first, under the same id, so one that went through is never given back too. A leaving
 * player's last save waits for their errands in flight (`settled`).
 */

import type { Characters } from './accounts/characters.ts';
import { bannerFrom } from '../client/src/game/guild/bannerLaw.ts';
import type { Stuff } from '../client/src/game/guild/outpostLaw.ts';
import { type Box, type Ground, plotBoxes } from '../client/src/game/guild/outpostPlaces.ts';
import type { Errand, RoomDoor } from './roomDoor.ts';

/** What the host asks the accounts for an outpost. */
export type OutpostAccounts = Pick<Characters, 'outpost' | 'deposit' | 'deliver' | 'takeStores' | 'soundHorn'>;
type OutpostDoor = Pick<RoomDoor, 'outpostErrands' | 'outpostAnswered' | 'outpostStood' | 'standBlock' | 'takeBlock'>;

/** The staff a banner with none hangs from. */
const DRIFTWOOD = 'driftwood';
/** How many times a deposit the accounts threw on is asked, under its one id. */
const DEPOSIT_TRIES = 3;
/** How long a leaving player's last save waits for their errands at most: past it, it is made all the same. */
export const SETTLE_MOST_MS = 30_000;

/** An outpost's ground as the node's baked file has it (`crates/bake` `OutpostGround`); null for a file without one. */
export function outpostGround(nodeText: string): (Ground & { readonly muster: readonly [number, number] }) | null {
  const part = (
    JSON.parse(nodeText) as { outpost?: { plot: [number, number]; level: number; muster: [number, number] } }
  ).outpost;
  return part ? { plot: part.plot, level: part.level, muster: part.muster } : null;
}

export class OutpostHost {
  /** The blocks the plot stands as now. */
  private stood: Box[] = [];
  /** The read under way, and whether another was asked meanwhile. */
  private reading: Promise<void> | null = null;
  private again = false;
  /** Each player's errands with the accounts. */
  private readonly flying = new Map<number, Set<Promise<void>>>();

  private readonly door: OutpostDoor;
  private readonly accounts: OutpostAccounts;
  private readonly room: string;
  private readonly ground: Ground;
  /** Runs a call into the room, catching a fault in it. */
  private readonly guarded: <T>(call: () => T, fallback: T) => T;
  /** When this host began, which makes its deposits' ids its own though the room's count starts again. */
  private readonly began: number;

  constructor(
    door: OutpostDoor,
    accounts: OutpostAccounts,
    room: string,
    ground: Ground,
    guarded: <T>(call: () => T, fallback: T) => T,
    began = Date.now(),
  ) {
    this.door = door;
    this.accounts = accounts;
    this.room = room;
    this.ground = ground;
    this.guarded = guarded;
    this.began = began;
  }

  /** Reads the plot and stands it anew; one read at a time, and one asked during it reads once more after. */
  read(): Promise<void> {
    if (this.reading) {
      this.again = true;
      return this.reading;
    }
    this.reading = (async () => {
      do {
        this.again = false;
        await this.stand().catch((error: unknown) => console.error('outpost read:', error));
      } while (this.again);
      this.reading = null;
    })();
    return this.reading;
  }

  /** Stands the plot as the accounts keep it now, taking what was stood before; nothing changes if they cannot say. */
  private async stand(): Promise<void> {
    const outpost = await this.accounts.outpost(this.room);
    const staff = outpost ? (bannerFrom(JSON.parse(outpost.banner))?.staff ?? DRIFTWOOD) : DRIFTWOOD;
    const boxes = outpost ? plotBoxes(outpost.plot, this.ground, staff) : [];
    for (const box of this.stood) this.guarded(() => this.door.takeBlock(box), false);
    for (const box of boxes) this.guarded(() => this.door.standBlock(box), false);
    this.stood = boxes;
    this.guarded(() => this.door.outpostStood(), false);
  }

  /** Takes the errands the room holds and runs each: a plot to read again is read, the rest asked of the accounts. */
  tick(): void {
    for (const errand of this.guarded(() => this.door.outpostErrands(), [])) {
      if (errand.kind === 'changed') {
        void this.read();
        continue;
      }
      const flight = this.answer(errand).then((answer) => {
        this.guarded(() => this.door.outpostAnswered(errand.id, answer), false);
        if (errand.kind === 'deliver' && (answer ?? 0) > 0) void this.read();
      });
      const flying = this.flying.get(errand.player) ?? new Set();
      flying.add(flight);
      this.flying.set(errand.player, flying);
      void flight.finally(() => {
        flying.delete(flight);
        if (flying.size === 0 && this.flying.get(errand.player) === flying) this.flying.delete(errand.player);
      });
    }
  }

  /** What the accounts answer an errand: how many they moved, used or gave, or the horn's tier; null when they threw. */
  private async answer(errand: Errand): Promise<number | null> {
    const { account, amount = 0 } = errand;
    const stuff = (errand.stuff ?? 'timber') satisfies Stuff;
    try {
      switch (errand.kind) {
        case 'deposit':
          return await this.deposit(account, amount, `${this.room}:${this.began}:${errand.player}:${errand.id}`);
        case 'deliver':
          return await this.accounts.deliver(account, this.room, { id: errand.structure ?? 0, stuff, amount });
        case 'take':
          return await this.accounts.takeStores(account, this.room, stuff, amount);
        case 'horn':
          return await this.accounts.soundHorn(account, this.room);
        default:
          return null;
      }
    } catch {
      return null;
    }
  }

  /** A deposit, asked again under its one id while the accounts throw: all of it moved, or none. */
  private async deposit(account: string, amount: number, rid: string): Promise<number | null> {
    for (let tried = 1; ; tried++) {
      try {
        return (await this.accounts.deposit(account, amount, rid)) === 'refused' ? 0 : amount;
      } catch (error) {
        if (tried >= DEPOSIT_TRIES) throw error;
      }
    }
  }

  /** Once a leaving player's errands are answered (those the room still holds taken first), or SETTLE_MOST_MS on. */
  async settled(player: number, wait = (millis: number) => new Promise((done) => setTimeout(done, millis))) {
    this.tick();
    const flying = [...(this.flying.get(player) ?? [])];
    if (flying.length > 0) await Promise.race([Promise.all(flying), wait(SETTLE_MOST_MS)]);
  }
}
