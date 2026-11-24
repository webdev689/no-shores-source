/**
 * A Breach between its two rooms' hosts. Its patrol zone's room stands its gate, where a company launched for a run
 * fights the Waking in view of the zone: a player joins it with `?breach=<run>`, and once the accounts say the run was
 * launched for them (`finding.ts`) the room holds them in that run's company. The run's room lets a character in only
 * once the zone's room says that run's gate has opened, and tells the zone how far its company has come, so the zone
 * sees who is inside.
 */

import { breachRun } from './roomNames.ts';
import type { RoomDoor } from './roomDoor.ts';

/** How often a run tells its gate's zone how far its company has come; the zone forgets one silent for a minute. */
const INSIDE_EVERY_MS = 10_000;

/** Why a run turns away a character whose company's gate has not opened. */
export const GATE_SHUT = 'The Sunken Gate has not opened to your company.';

/** A patrol zone's room with a gate, as the run's host speaks to it: the run's own words, and the gate's answer. */
export interface Zone {
  breachOpened(run: string): Promise<boolean>;
  breachInside(word: string): Promise<boolean>;
}

/** What a host needs: its room, the zone's room by name, and whether the accounts launched a run for an account. */
export interface BreachDeps {
  readonly room: RoomDoor;
  readonly zone: (name: string) => Zone;
  readonly launched: (account: string, run: string) => Promise<boolean>;
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
  private told = 0;
  /** In a zone, each player's run until the accounts answer; in a run, each player's name as the keeper gives it. */
  private readonly asked = new Map<number, string>();
  private readonly names = new Map<number, string>();

  constructor(name: string, deps: BreachDeps) {
    this.name = name;
    this.deps = deps;
    this.run = breachRun(name);
  }

  /** In a run: whether its gate has opened, asked of its zone until it says so once. */
  async gateOpen(): Promise<boolean> {
    if (this.run && !this.opened) this.opened = await this.deps.zone(this.run.zone).breachOpened(this.name);
    return this.opened;
  }

  /** A player joined the zone for `run`, held until their account is known. */
  joined(player: number, run: string | null): void {
    if (run !== null) this.asked.set(player, run);
  }

  /** Whether a player joined the zone for a run the accounts say was launched for `account`. */
  async launchedHere(player: number, account: string): Promise<boolean> {
    const run = this.asked.get(player);
    return run !== undefined && (await this.deps.launched(account, run));
  }

  /** A player's character is kept for `account`: in a zone, held in the company of the run they came for once the
   *  accounts say it was launched for them. */
  owned(player: number, account: string): void {
    const run = this.asked.get(player);
    const tier = run === undefined ? undefined : breachRun(run)?.tier;
    if (run === undefined || tier === undefined) return;
    this.asked.delete(player);
    void this.deps
      .launched(account, run)
      .then((launched) => launched && this.deps.room.breachCompany(player, JSON.stringify({ run, tier })))
      .catch(() => false);
  }

  named(player: number, name: string): void {
    this.names.set(player, name);
  }

  left(player: number): void {
    this.asked.delete(player);
    this.names.delete(player);
  }

  /** Each second's look: in a run, its progress told to its zone every INSIDE_EVERY_MS, by its first player's name. */
  tick(now: number): void {
    if (!this.run || now - this.told < INSIDE_EVERY_MS) return;
    const progress = JSON.parse(this.deps.room.breachProgress()) as { tier: number; encounter: number } | null;
    const name = [...this.names.entries()].sort(([one], [other]) => one - other)[0]?.[1];
    if (!progress || name === undefined) return;
    this.told = now;
    const word = JSON.stringify({ run: this.name, tier: progress.tier, name, encounter: progress.encounter });
    void this.deps
      .zone(this.run.zone)
      .breachInside(word)
      .catch(() => false);
  }
}
