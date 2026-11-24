/**
 * The host's side of a guild's outpost's room (`node-<site>--guild-<key>`): it stands the guild's plot as blocks, as
 * the page draws it (`outpostPlaces.ts` `plotBoxes`), anew each time the plot read again differs from what stands (read
 * every half minute besides, so a plot changed or abandoned from anywhere stands here soon after), and runs the errands
 * the room holds for its players' asks with the accounts. A deposit, delivery or take goes only once the character,
 * carrying the errand, is saved, so a claim elsewhere finds it carried and settles it there; a take's gift is saved at
 * once. The accounts keep each errand's answer under its own id, so one they throw on is asked again under it until
 * they answer, and is never done or given back twice. A leaving player's last save waits a while for their errands
 * (`settled`); an answer after it goes to the room that holds the character next (`keeping.ts`).
 */

import manifest from '../content/modules/modules.json' with { type: 'json' };
import type { Characters } from './accounts/characters.ts';
import { keptBanner } from './accounts/guildFace.ts';
import { LIMITED } from './accounts/outpostStores.ts';
import type { Stuff } from '../client/src/game/guild/outpostLaw.ts';
import { gateOf, gateTier } from '../client/src/game/guild/delveRoom.ts';
import type { Plot } from '../client/src/game/guild/outpostLaw.ts';
import { type Box, type Ground, placeOf, plotBoxes, socketOf } from '../client/src/game/guild/outpostPlaces.ts';
import type { Errand, RoomDoor } from './roomDoor.ts';

/** What the host asks the accounts for an outpost. */
export type OutpostAccounts = Pick<Characters, 'outpost' | 'deposit' | 'deliver' | 'takeStores' | 'soundHorn'>;
/** An errand that takes from or gives to the character, as the room writes it, or as its character carries it. */
type Taking = Pick<Errand, 'rid' | 'account' | 'kind' | 'amount' | 'structure' | 'stuff'>;
type OutpostDoor = Pick<
  RoomDoor,
  'outpostErrands' | 'outpostAnswered' | 'outpostStood' | 'outpostGate' | 'outpostParting' | 'standBlock' | 'takeBlock'
>;

/** How long an errand the accounts threw on waits before each try again, under its one id, the last wait again for as
 *  long as the room lives: only an answer says whether they did it, so none is ever taken to be undone. */
export const AGAIN_WAITS_MS = [250, 1_000, 4_000, 10_000];
/** How often the host reads the plot again unasked. */
export const READ_EVERY_MS = 30_000;
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

/** What the accounts answer an errand that takes or gives, asked under its id, at the room its id begins with: how
 *  many they moved, used or gave, or `LIMITED`; they answer as they did each time. Throws when they cannot be reached. */
export async function askedAgain(
  accounts: Pick<OutpostAccounts, 'deposit' | 'deliver' | 'takeStores'>,
  errand: Taking,
): Promise<number> {
  const { account, amount = 0, rid } = errand;
  const room = rid.split(':')[0] ?? '';
  const stuff = (errand.stuff ?? 'timber') satisfies Stuff;
  if (errand.kind === 'deliver')
    return accounts.deliver(account, room, { id: errand.structure ?? 0, stuff, amount }, rid);
  if (errand.kind === 'take') return accounts.takeStores(account, room, stuff, amount, rid);
  const moved = await accounts.deposit(account, amount, rid);
  return moved === 'refused' ? 0 : moved === 'limited' ? LIMITED : amount;
}

/** The errand a kept character's body carries, as the room writes errands (`gear::errand::Carried`); null for none,
 *  for one already answered, and for a body that is no character. */
export function carriedOf(account: string, body: string): Taking | null {
  type Stuffed = { readonly stuff: { readonly ship?: Stuff }; readonly amount: number };
  let carried: {
    rid?: unknown;
    answer?: unknown;
    what?: { deposit?: number; deliver?: Stuffed & { structure: number }; take?: Stuffed };
  };
  try {
    carried = (JSON.parse(body) as { errand?: typeof carried }).errand ?? {};
  } catch {
    return null;
  }
  const { rid, what } = carried;
  if (typeof rid !== 'string' || carried.answer !== undefined || !what) return null;
  if (typeof what.deposit === 'number') return { rid, account, kind: 'deposit', amount: what.deposit };
  const given = what.deliver ?? what.take;
  if (!given) return null;
  const stuff = given.stuff.ship ?? 'island';
  const kind = what.deliver ? 'deliver' : 'take';
  return { rid, account, kind, amount: given.amount, stuff, structure: what.deliver?.structure };
}

export class OutpostHost {
  /** The blocks the plot stands as now, and the read they stand from with its gate; null before any stood. */
  private stood: Box[] = [];
  private standing: string | null = null;
  /** The read under way, and whether another was asked meanwhile. */
  private reading: Promise<void> | null = null;
  private again = false;
  /** When the plot was last read; null before its first read, which the room's opening asks. */
  private readAt: number | null = null;
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
  private readonly waits: readonly number[];

  constructor(
    door: OutpostDoor,
    accounts: OutpostAccounts,
    room: string,
    ground: Ground,
    guarded: <T>(call: () => T, fallback: T) => T,
    saved: (player: number) => Promise<boolean>,
    waits: readonly number[] = AGAIN_WAITS_MS,
  ) {
    this.door = door;
    this.accounts = accounts;
    this.room = room;
    this.ground = ground;
    this.guarded = guarded;
    this.saved = saved;
    this.waits = waits;
  }

  /** Reads the plot and stands it anew; one read at a time, and one asked during it reads once more after. */
  read(now = Date.now()): Promise<void> {
    this.readAt = now;
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

  /** Stands the plot as the accounts keep it now, taking what was stood before, when it differs from what stands:
   *  each stand makes every page in the room read the plot again. Nothing changes if they cannot say. */
  private async stand(): Promise<void> {
    const outpost = await this.accounts.outpost(this.room);
    const staff = outpost ? keptBanner(outpost.banner, outpost.name).staff : '';
    const gate = outpost ? gateDoor(outpost.plot, this.ground, staff) : null;
    const standing = JSON.stringify([outpost, gate]);
    if (standing === this.standing) return;
    this.standing = standing;
    const boxes = outpost ? plotBoxes(outpost.plot, this.ground, staff) : [];
    for (const box of this.stood) this.guarded(() => this.door.takeBlock(box), false);
    for (const box of boxes) this.guarded(() => this.door.standBlock(box), false);
    this.stood = boxes;
    this.guarded(() => this.door.outpostGate(gate), false);
    this.guarded(() => this.door.outpostStood(), false);
  }

  /** Reads the plot again once it was last read a while ago, and takes the errands the room holds and runs each: a
   *  plot to read again is read, the rest asked of the accounts. */
  tick(now = Date.now()): void {
    if (this.readAt !== null && now - this.readAt >= READ_EVERY_MS) void this.read(now);
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

  /** Runs an errand and gives its answer to the room. What the room took, and the errand the character carries, are
   *  saved before it is asked; unsaved, it is surely not asked, and given back whole. */
  private async run(errand: Errand): Promise<void> {
    const takes = errand.kind === 'deposit' || errand.kind === 'deliver' || errand.kind === 'take';
    const answer = takes && !(await this.saved(errand.player)) ? null : await this.answer(errand);
    this.guarded(() => this.door.outpostAnswered(errand.id, answer), false);
    if (errand.kind === 'take' && (answer ?? 0) > 0) await this.saved(errand.player);
    if (errand.kind === 'deliver' && (answer ?? 0) > 0) void this.read();
  }

  /** What the accounts answer an errand: how many they moved, used or gave, or the horn's tier; null for no errand
   *  they answer. */
  private answer(errand: Errand): Promise<number | null> {
    if (errand.kind === 'horn')
      return this.retried(() => this.accounts.soundHorn(errand.account, this.room, errand.rid));
    return errand.kind === 'changed' ? Promise.resolve(null) : this.retried(() => askedAgain(this.accounts, errand));
  }

  /** An errand asked again under its one id while the accounts throw, until they answer. */
  private async retried(ask: () => Promise<number>): Promise<number> {
    for (let tries = 0; ; tries++) {
      const millis = tries === 0 ? 0 : (this.waits[Math.min(tries, this.waits.length) - 1] ?? 0);
      if (millis > 0) await new Promise((done) => setTimeout(done, millis));
      const answered = await ask().catch(() => null);
      if (answered !== null) return answered;
    }
  }

  /** Once a leaving player's errands are answered, those the room holds meanwhile taken too, or `most` on; its timer
   *  runs only while one is in flight. Their account joining again meanwhile is the room's from then on, and is given
   *  each answer. */
  async settled(player: number, most = SETTLE_MOST_MS): Promise<void> {
    this.guarded(() => this.door.outpostParting(player), false);
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
