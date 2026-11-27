/**
 * A Breach between its two rooms' hosts. Its patrol zone's room stands its gate, where a company launched for a run
 * fights the Waking in view of the zone: a player joins it with `?breach=<run>`, and once the accounts say the run was
 * launched for them (`finding.ts`) the room holds them in that run's company. The run's room lets a character in only
 * once the zone's room says that run's gate has opened, and tells the zone how far its company has come, so the zone
 * sees who is inside. What each keeps, a run's checkpoint and a gate's runs, outlives an eviction, a restart or a
 * deploy in its object's storage.
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

/** The key a room's Breach keeps what outlives the room under in its object's storage; and how long a run keeps its
 *  checkpoint after it last moved, its gate's day, past which no one goes in. */
const KEPT = 'breach';
export const CHECKPOINT_KEPT_MS = 24 * 60 * 60_000;

/** Why a run turns away a character whose company's gate has not opened. */
export const GATE_SHUT = 'The Sunken Gate has not opened to your company.';

/** A patrol zone's room with a gate, as the run's host speaks to it: the run's own words, and the gate's answer; the
 *  zone named, as its room opens for the word if no one has joined it since an eviction or a deploy. */
export interface Zone {
  breachWord(kind: 'opened' | 'inside', text: string, zone: string): Promise<boolean>;
}

/** A Durable Object's storage, as a Breach keeps in it what outlives its room. */
export interface BreachStorage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: string): Promise<void>;
  setAlarm(at: number): Promise<void>;
}

/** What a host needs: its room, the zone's room by name, and whether the accounts launched a run for an account, within
 *  `within` ms or the day a found run is kept. */
export interface BreachDeps {
  /** The room's words a Breach asks of it, each guarded as every call into the room is (`worker.ts`). */
  readonly room: Pick<RoomDoor, 'breachCompany' | 'breachProgress' | 'breachKept' | 'breachRestore'>;
  readonly zone: (name: string) => Zone;
  readonly launched: (account: string, run: string, within?: number) => Promise<boolean>;
  /** Where what the room's Breach keeps outlives an eviction, a restart or a deploy (none keeps nothing). */
  readonly storage?: BreachStorage;
  /** Has the accounts forget a run whose gate shut again, so its company's next Launch starts a new one. */
  readonly forget?: (run: string) => Promise<unknown>;
  /** Waits `span` ms, as the accounts are given time to come back after a blip (a timer unless a test says). */
  readonly wait?: (span: number) => Promise<void>;
}

/** The room's words a Breach asks of it, each through `guarded`, which closes the room should the call trap, as
 *  every call into it does: a trap in a word asked as the accounts answer is never swallowed while the room runs on. */
export function breachRoom(room: RoomDoor, guarded: <T>(call: () => T, fallback: T) => T): BreachDeps['room'] {
  return {
    breachCompany: (player, word) => guarded(() => room.breachCompany(player, word), false),
    breachProgress: () => guarded(() => room.breachProgress(), 'null'),
    breachKept: () => guarded(() => room.breachKept(), 'null'),
    breachRestore: (kept) => guarded(() => room.breachRestore(kept), false),
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
  /** In a run, whether anyone was let in: its gate may open to a joiner refused for another reason. */
  private entered = false;
  private told = 0;
  private toldEncounter: number | null = null;
  /** In a zone, each player's run until the accounts answer; in a run, each player's name as the keeper gives it. */
  private readonly asked = new Map<number, string>();
  private readonly names = new Map<number, string>();
  /** In a zone, the players the accounts said were launched as they came, held in their company without asking again. */
  private readonly launched = new Set<number>();
  /** What the room's Breach keeps, as its storage last took it (`breachKept`). */
  private kept = 'null';

  constructor(name: string, deps: BreachDeps) {
    this.name = name;
    this.deps = deps;
    this.run = breachRun(name);
  }

  /** In a run: whether its gate has opened, asked of its zone until it says so, and again once its word is
   *  GATE_TRUSTED_MS old, as the gate shuts on a clear or at its day's end. */
  async gateOpen(now = Date.now()): Promise<boolean> {
    if (this.run && (!this.opened || now - this.openedAsked >= GATE_TRUSTED_MS)) {
      this.opened = await this.deps.zone(this.run.zone).breachWord('opened', this.name, this.run.zone);
      this.openedAsked = now;
    }
    return this.opened;
  }

  /** Gives the room, as it opens, what its Breach kept before an eviction, a restart or a deploy: a run's checkpoint,
   *  a gate's runs. A storage that does not answer leaves it as it opened. */
  async restore(): Promise<void> {
    const kept = await this.deps.storage?.get<string>(KEPT).catch(() => undefined);
    if (kept !== undefined) this.deps.room.breachRestore(kept);
    this.kept = this.deps.room.breachKept();
  }

  /** Stores what the room's Breach keeps once it changed: a run's checkpoint, let go a day after it last moved (its
   *  host's alarm), and a gate's runs, each it has shut again since told to the accounts to forget. Never `null`,
   *  which a room that trapped answers. */
  store(now: number): void {
    const kept = this.deps.room.breachKept();
    if (kept === this.kept || kept === 'null') return;
    const spent = (text: string) => Object.keys((JSON.parse(text) as { spent?: object } | null)?.spent ?? {});
    const shut = spent(kept).filter((run) => !spent(this.kept).includes(run));
    this.kept = kept;
    void this.deps.storage?.put(KEPT, kept).catch(() => undefined);
    if (this.run) void this.deps.storage?.setAlarm(now + CHECKPOINT_KEPT_MS).catch(() => undefined);
    for (const run of shut) void this.deps.forget?.(run).catch(() => false);
  }

  /** The other room's word heard at the Unix ms `now` (`breachHeard`), and what it changed stored. */
  heard(room: RoomDoor, kind: 'opened' | 'inside', text: string, now: number): boolean {
    const heard = breachHeard(room, kind, text, Math.floor(now / 60_000));
    this.store(now);
    return heard;
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

  /** A player's character is kept for `account`: in a run, one let in; in a zone, held in the company of the run
   *  they came for once the accounts say it was launched for them that day, so one back from the run after the arrival
   *  window is held again; asked twice, ASK_AGAIN_MS apart, as a blip at the accounts would leave them out of their
   *  company. */
  owned(player: number, account: string): void {
    if (this.run) return void (this.entered = true);
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

  /** Each second's look: what its Breach keeps stored as it changes; and in a run whose gate opened, its progress
   *  told to its zone every INSIDE_EVERY_MS, and at once as its company reaches a new encounter or clears the Breach,
   *  so a company that leaves at once is still heard; by the name of its first player in, or NAMELESS; a run no one was
   *  let into tells its zone nothing. */
  tick(now: number): void {
    this.store(now);
    if (!this.run || !this.opened || !this.entered) return;
    const progress = JSON.parse(this.deps.room.breachProgress()) as { tier: number; encounter: number } | null;
    if (!progress || (progress.encounter === this.toldEncounter && now - this.told < INSIDE_EVERY_MS)) return;
    const name = [...this.names.entries()].sort(([one], [other]) => one - other)[0]?.[1] ?? NAMELESS;
    [this.told, this.toldEncounter] = [now, progress.encounter];
    const word = JSON.stringify({ run: this.name, tier: progress.tier, name, encounter: progress.encounter });
    void this.deps
      .zone(this.run.zone)
      .breachWord('inside', word, this.run.zone)
      .catch(() => false);
  }
}

/** A zone's or a run's room taking a Breach's word from the other (`Zone`): a run's gate opened, or how far it came;
 *  given the Unix minute first, as an empty zone's room does not tick and a gate's day is judged by its clock. */
export function breachHeard(room: RoomDoor, kind: 'opened' | 'inside', text: string, minute: number): boolean {
  room.minute(minute);
  return kind === 'opened' ? room.breachOpened(text) : room.breachInside(text);
}

/** A room's opening, its Breach (`breach`, once made) given back what it kept as the room opens: whether it opened.
 *  One that did not open is let go (`failed`), as nothing opened is lost by asking again. */
export async function restoring(
  opening: Promise<boolean>,
  breach: () => Breach | null,
  failed: () => void,
): Promise<boolean> {
  const opened = await opening.catch(() => false);
  if (opened) await breach()?.restore();
  else failed();
  return opened;
}

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
