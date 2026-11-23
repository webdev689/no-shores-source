/**
 * The host's side of a guild's outpost's room (`node-<site>--guild-<key>`). It stands the guild's plot as blocks, as
 * the page draws it (`outpostPlaces.ts` `plotBoxes`), and stands it anew each time the plot is read again: on a
 * player's word that it changed (at most once a second, which the room judges) and after every delivery the accounts
 * used. Each tick it takes the errands the room holds for its players' asks, asks the accounts, and gives each answer
 * back, so the room gives back what was not moved or used. Each errand has an id of its own, under which the accounts
 * keep their answer in the same write as the errand; one they throw on is asked again under it, so one that went
 * through answers as it did and is never done or given back twice. Only one they throw on every time is given back
 * whole. A leaving player's last save waits for their errands in flight (`settled`).
 */

import manifest from '../content/modules/modules.json' with { type: 'json' };
import type { Characters } from './accounts/characters.ts';
import { bannerFrom } from '../client/src/game/guild/bannerLaw.ts';
import type { Stuff } from '../client/src/game/guild/outpostLaw.ts';
import { gateOf, gateTier } from '../client/src/game/guild/delveRoom.ts';
import type { Plot } from '../client/src/game/guild/outpostLaw.ts';
import { type Box, type Ground, placeOf, plotBoxes, socketOf } from '../client/src/game/guild/outpostPlaces.ts';
import type { Errand, RoomDoor } from './roomDoor.ts';

/** What the host asks the accounts for an outpost. */
export type OutpostAccounts = Pick<Characters, 'outpost' | 'deposit' | 'deliver' | 'takeStores' | 'soundHorn'>;
type OutpostDoor = Pick<
  RoomDoor,
  'outpostErrands' | 'outpostAnswered' | 'outpostStood' | 'outpostGate' | 'standBlock' | 'takeBlock'
>;

/** The staff a banner with none hangs from. */
const DRIFTWOOD = 'driftwood';
/** How long an errand the accounts threw on waits before each try again, under its one id. */
const AGAIN_WAITS_MS = [250, 1_000, 4_000];
/** How long a leaving player's last save waits for their errands at most: past it, it is made all the same. */
export const SETTLE_MOST_MS = 30_000;

/** An outpost's ground as the node's baked file has it (`crates/bake` `OutpostGround`); null for a file without one. */
export function outpostGround(nodeText: string): (Ground & { readonly muster: readonly [number, number] }) | null {
  const part = (
    JSON.parse(nodeText) as { outpost?: { plot: [number, number]; level: number; muster: [number, number] } }
  ).outpost;
  return part ? { plot: part.plot, level: part.level, muster: part.muster } : null;
}

/** Where one out of the guild dungeon stands: the foot of the Delve Gate's steps, its module's `door` socket, and the
 *  way that socket faces turned with the gate, x east and y south, radians clockwise from north; null where no gate
 *  stands at a tier. */
export function gateDoor(plot: Plot, ground: Ground, staff: string): readonly [number, number, number] | null {
  const gate = gateTier(plot) === null ? null : gateOf(plot);
  if (!gate) return null;
  const placed = placeOf(gate, ground, staff);
  const listed = manifest.modules.find((module) => module.name === placed.module) as
    | { readonly sockets?: readonly { readonly name: string; readonly facing?: readonly number[] }[] }
    | undefined;
  const [east = 0, south = 1] = listed?.sockets?.find((socket) => socket.name === 'door')?.facing ?? [];
  const [x, y] = socketOf(gate, ground, staff, 'door');
  return [x, y, Math.atan2(east, -south) + placed.turn];
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
    const gate = outpost ? gateDoor(outpost.plot, this.ground, staff) : null;
    this.guarded(() => this.door.outpostGate(gate), false);
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

  /** What the accounts answer an errand: how many they moved, used or gave, or the horn's tier; null when they threw
   *  on every try. */
  private answer(errand: Errand): Promise<number | null> {
    const { account, amount = 0 } = errand;
    const stuff = (errand.stuff ?? 'timber') satisfies Stuff;
    const rid = `${this.room}:${this.began}:${errand.player}:${errand.id}`;
    switch (errand.kind) {
      case 'deposit':
        return this.retried(async () =>
          (await this.accounts.deposit(account, amount, rid)) === 'refused' ? 0 : amount,
        );
      case 'deliver':
        return this.retried(() =>
          this.accounts.deliver(account, this.room, { id: errand.structure ?? 0, stuff, amount }, rid),
        );
      case 'take':
        return this.retried(() => this.accounts.takeStores(account, this.room, stuff, amount, rid));
      case 'horn':
        return this.retried(() => this.accounts.soundHorn(account, this.room, rid));
      default:
        return Promise.resolve(null);
    }
  }

  /** An errand asked again under its one id while the accounts throw: answered once, or null after every try. */
  private async retried(ask: () => Promise<number>): Promise<number | null> {
    for (const millis of [0, ...AGAIN_WAITS_MS]) {
      if (millis > 0) await new Promise((done) => setTimeout(done, millis));
      const answered = await ask().catch(() => null);
      if (answered !== null) return answered;
    }
    return null;
  }

  /** Once a leaving player's errands are answered, those the room holds meanwhile taken too, or SETTLE_MOST_MS on. */
  async settled(player: number, wait = (millis: number) => new Promise((done) => setTimeout(done, millis))) {
    const late = wait(SETTLE_MOST_MS).then(() => true);
    for (;;) {
      this.tick();
      const flying = [...(this.flying.get(player) ?? [])];
      if (flying.length === 0 || (await Promise.race([Promise.all(flying).then(() => false), late]))) return;
    }
  }
}
