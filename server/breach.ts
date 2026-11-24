/**
 * A Breach between its two rooms' hosts. Its patrol zone's room stands its gate, where a company launched for a run
 * fights the Waking in view of the zone: a player joins it with `?breach=<run>`, and once the accounts say the run was
 * launched for them (`finding.ts`) the room holds them in that run's company. The run's room lets a character in only
 * once the zone's room says that run's gate has opened, and tells the zone how far its company has come, so the zone
 * sees who is inside.
 */

import type { Keeper } from './keeping.ts';
import { breachRun } from './roomNames.ts';
import type { RoomDoor } from './roomDoor.ts';

/** How often a run tells its gate's zone how far its company has come; the zone forgets one silent for a minute. */
const INSIDE_EVERY_MS = 10_000;
/** How long a run trusts its zone's word that its gate opened before it asks again, as the gate shuts once its company
 *  clears the Breach or its day is out. */
const GATE_TRUSTED_MS = 60_000;
/** How long after its launch a run's company may come to its gate from anywhere, as the Launch takes them there. */
export const LAUNCH_ARRIVES_MS = 30 * 60_000;
/** How long after a blip at the accounts a launched player's run is asked of them again. */
export const ASK_AGAIN_MS = 2_000;
/** The name a company is shown by in its zone when no player of it has a username yet. */
const NAMELESS = 'A company';

/** Why a run turns away a character whose company's gate has not opened. */
export const GATE_SHUT = 'The Sunken Gate has not opened to your company.';

/** A patrol zone's room with a gate, as the run's host speaks to it: the run's own words, and the gate's answer. */
export interface Zone {
  breachWord(kind: 'opened' | 'inside', text: string): Promise<boolean>;
}

/** What a host needs: its room, the zone's room by name, and whether the accounts launched a run for an account, within
 *  `within` ms or the day a found run is kept. */
export interface BreachDeps {
  /** The room's two words a Breach asks of it, each guarded as every call into the room is (`worker.ts`). */
  readonly room: Pick<RoomDoor, 'breachCompany' | 'breachProgress'>;
  readonly zone: (name: string) => Zone;
  readonly launched: (account: string, run: string, within?: number) => Promise<boolean>;
  /** Waits `span` ms, as the accounts are given time to come back after a blip (a timer unless a test says). */
  readonly wait?: (span: number) => Promise<void>;
}

/** The room's words a Breach asks of it, each through `guarded`, which closes the room should the call trap, as
 *  every call into it does: a trap in a word asked as the accounts answer is never swallowed while the room runs on. */
export function breachRoom(room: RoomDoor, guarded: <T>(call: () => T, fallback: T) => T): BreachDeps['room'] {
  return {
    breachCompany: (player, word) => guarded(() => room.breachCompany(player, word), false),
    breachProgress: () => guarded(() => room.breachProgress(), 'null'),
  };
}

/** The run a join into a patrol's room comes launched for, `?breach=<room>`: null for none, or a name that is no
 *  Breach's run of that zone. */
export function breachAsked(request: Request, zone: string): string | null {
  const run = new URL(request.url).searchParams.get('breach');
  return run !== null && breachRun(run)?.zone === zone ? run : null;
}

/** A Breach's words in one host: in a run, its gate's answer and its company's progress; in a zone, the runs each
 *  player joined for. */
export class Breach {
  private readonly name: string;
  private readonly deps: BreachDeps;
  private readonly run: ReturnType<typeof breachRun>;
  private opened = false;
  private openedAsked = -Infinity;
  private told = 0;
  private toldEncounter: number | null = null;
  /** In a zone, each player's run until the accounts answer; in a run, each player's name as the keeper gives it. */
  private readonly asked = new Map<number, string>();
  private readonly names = new Map<number, string>();
  /** In a zone, the players the accounts said were launched as they came, held in their company without asking again. */
  private readonly launched = new Set<number>();

  constructor(name: string, deps: BreachDeps) {
    this.name = name;
    this.deps = deps;
    this.run = breachRun(name);
  }

  /** In a run: whether its gate has opened, asked of its zone until it says so, and again once its word is
   *  GATE_TRUSTED_MS old, as the gate shuts on a clear or at its day's end. */
  async gateOpen(now = Date.now()): Promise<boolean> {
    if (this.run && (!this.opened || now - this.openedAsked >= GATE_TRUSTED_MS)) {
      this.opened = await this.deps.zone(this.run.zone).breachWord('opened', this.name);
      this.openedAsked = now;
    }
    return this.opened;
  }

  /** Keeps the keeper's ways in: in a run, its gate's word; anywhere, a player launched for a run of this zone. */
  keep(keeper: Keeper): void {
    if (this.run) keeper.behindGate(async () => ((await this.gateOpen()) ? '' : GATE_SHUT));
    keeper.arrivingLaunched((player, account) => this.launchedHere(player, account));
  }

  /** A player joined the zone for `run`, held until their account is known. */
  joined(player: number, run: string | null): void {
    if (run !== null) this.asked.set(player, run);
  }

  /** Whether a player joined the zone for a run the accounts say was launched for `account` within LAUNCH_ARRIVES_MS,
   *  so they may arrive from anywhere. */
  async launchedHere(player: number, account: string): Promise<boolean> {
    const run = this.asked.get(player);
    const launched = run !== undefined && (await this.deps.launched(account, run, LAUNCH_ARRIVES_MS));
    if (launched) this.launched.add(player);
    return launched;
  }

  /** A player's character is kept for `account`: in a zone, held in the company of the run they came for once the
   *  accounts say it was launched for them that day, so one back from the run after the arrival window is held again;
   *  asked twice, ASK_AGAIN_MS apart, as a blip at the accounts would leave them out of their company. */
  owned(player: number, account: string): void {
    const run = this.asked.get(player);
    const tier = run === undefined ? undefined : breachRun(run)?.tier;
    if (run === undefined || tier === undefined) return;
    this.asked.delete(player);
    const hold = () => this.deps.room.breachCompany(player, JSON.stringify({ run, tier }));
    // One the keeper let in as launched is held at once; one who came by a way leading here is asked of the accounts.
    if (this.launched.delete(player)) return void hold();
    const ask = () => this.deps.launched(account, run);
    const wait = this.deps.wait ?? ((span: number) => new Promise<void>((done) => setTimeout(done, span)));
    void ask()
      .catch(() => wait(ASK_AGAIN_MS).then(ask))
      .then((launched) => launched && hold())
      .catch(() => false);
  }

  named(player: number, name: string): void {
    this.names.set(player, name);
  }

  left(player: number): void {
    this.asked.delete(player);
    this.names.delete(player);
    this.launched.delete(player);
  }

  /** Each second's look: in a run whose gate opened, its progress told to its zone every INSIDE_EVERY_MS, and at once
   *  as its company reaches a new encounter or clears the Breach, so a company that leaves at once is still heard; by
   *  the name of its first player in, or NAMELESS; a run no one was let into tells its zone nothing. */
  tick(now: number): void {
    if (!this.run || !this.opened) return;
    const progress = JSON.parse(this.deps.room.breachProgress()) as { tier: number; encounter: number } | null;
    if (!progress || (progress.encounter === this.toldEncounter && now - this.told < INSIDE_EVERY_MS)) return;
    const name = [...this.names.entries()].sort(([one], [other]) => one - other)[0]?.[1] ?? NAMELESS;
    [this.told, this.toldEncounter] = [now, progress.encounter];
    const word = JSON.stringify({ run: this.name, tier: progress.tier, name, encounter: progress.encounter });
    void this.deps
      .zone(this.run.zone)
      .breachWord('inside', word)
      .catch(() => false);
  }
}

/** A zone's or a run's room taking a Breach's word from the other (`Zone`): a run's gate opened, or how far it came. */
export const breachHeard = (room: RoomDoor, kind: 'opened' | 'inside', text: string): boolean =>
  kind === 'opened' ? room.breachOpened(text) : room.breachInside(text);

/** What a host's keeper does with its room (`door`), its Breach told of each character it keeps (once kept) and of
 *  each name it gives. */
export function toldBreach<
  Door extends { own(player: number, account: string): boolean; name(player: number, name: string): boolean },
>(breach: () => Breach | null, door: Door): Door {
  const own = (player: number, account: string) => {
    const owned = door.own(player, account);
    if (owned) breach()?.owned(player, account);
    return owned;
  };
  const name = (player: number, named: string) => {
    breach()?.named(player, named);
    return door.name(player, named);
  };
  return { ...door, own, name };
}
