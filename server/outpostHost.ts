/**
 * The host's side of a guild's outpost's room (`node-<site>--guild-<key>`): it stands the guild's plot as blocks, as
 * the page draws it (`outpostPlaces.ts` `plotBoxes`), anew each time the plot is read again, and runs the errands the
 * room holds for its players' asks with the accounts. A deposit or delivery goes only once the character it was taken
 * from is saved, so no claim elsewhere finds it whole, and a take's gift is saved at once. The accounts keep each
 * errand's answer under its own id, so one they throw on is asked again under it and is never done or given back
 * twice. A leaving player's last save waits a while for their errands (`settled`); the room keeps a later answer.
 */

import manifest from '../content/modules/modules.json' with { type: 'json' };
import type { Characters } from './accounts/characters.ts';
import { keptBanner } from './accounts/guildFace.ts';
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

/** How long an errand the accounts threw on waits before each try again, under its one id: about five minutes in all,
 *  past which they are taken to have never done it. */
export const AGAIN_WAITS_MS = [250, 1_000, 4_000, ...Array<number>(30).fill(10_000)];
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
    { readonly sockets?: readonly { readonly name: string; readonly facing?: readonly number[] }[] } | undefined;
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
  /** Saves a player's character as the room holds it now; whether the save holds. */
  private readonly saved: (player: number) => Promise<boolean>;
  /** When this host began, which makes its deposits' ids its own though the room's count starts again. */
  private readonly began: number;
  private readonly waits: readonly number[];

  constructor(
    door: OutpostDoor,
    accounts: OutpostAccounts,
    room: string,
    ground: Ground,
    guarded: <T>(call: () => T, fallback: T) => T,
    saved: (player: number) => Promise<boolean>,
    began = Date.now(),
    waits: readonly number[] = AGAIN_WAITS_MS,
  ) {
    this.door = door;
    this.accounts = accounts;
    this.room = room;
    this.ground = ground;
    this.guarded = guarded;
    this.saved = saved;
    this.began = began;
    this.waits = waits;
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
    const staff = outpost ? keptBanner(outpost.banner, outpost.name).staff : '';
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
      const flight = this.run(errand);
      const flying = this.flying.get(errand.player) ?? new Set();
      flying.add(flight);
      this.flying.set(errand.player, flying);
      void flight.finally(() => {
        flying.delete(flight);
        if (flying.size === 0 && this.flying.get(errand.player) === flying) this.flying.delete(errand.player);
      });
    }
  }

  /** Runs an errand and gives its answer to the room. What the room took is saved before it is asked; unsaved, it is
   *  surely not taken, and given back whole. */
  private async run(errand: Errand): Promise<void> {
    const takes = errand.kind === 'deposit' || errand.kind === 'deliver';
    const answer = takes && !(await this.saved(errand.player)) ? null : await this.answer(errand);
    this.guarded(() => this.door.outpostAnswered(errand.id, answer), false);
    if (errand.kind === 'take' && (answer ?? 0) > 0) await this.saved(errand.player);
    if (errand.kind === 'deliver' && (answer ?? 0) > 0) void this.read();
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
    for (const millis of [0, ...this.waits]) {
      if (millis > 0) await new Promise((done) => setTimeout(done, millis));
      const answered = await ask().catch(() => null);
      if (answered !== null) return answered;
    }
    return null;
  }

  /** Once a leaving player's errands are answered, those the room holds meanwhile taken too, or `most` on; its timer
   *  runs only while one is in flight. */
  async settled(player: number, most = SETTLE_MOST_MS): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let late: Promise<boolean> | null = null;
    try {
      for (;;) {
        this.tick();
        const flying = [...(this.flying.get(player) ?? [])];
        if (flying.length === 0) return;
        late ??= new Promise((done) => (timer = setTimeout(() => done(true), most)));
        if (await Promise.race([Promise.all(flying).then(() => false), late])) return;
      }
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
}
