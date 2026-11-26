/**
 * A developer's test room's players (`testRoom` in `roomNames.ts`): a test run, or the zone copy whose Breach's gate
 * opens one. It keeps no character and claims none: as each socket sends its session's token, the accounts are asked
 * only whether it is a developer's (`CharacterKeeper.developer`). A developer plays the test character the room gives
 * every player who joins it (`room::test_room`), owned by their account and named by its username; anyone else is
 * sent away. A Breach's test run lets a developer in only once its zone copy says its gate opened, as a run does.
 */

import { GATE_SHUT } from './breach.ts';
import { ACCOUNTS_TROUBLE, SIGN_IN_FOR_RUN, TOKEN_WAIT_MS } from './keeping.ts';

/** Why a test room sends away a player whose account is no developer's. */
export const DEVELOPERS_ONLY = 'Test runs are for developers.';

/** What a test room asks of the accounts: whose a session's token is, if a developer's, and their username. */
export interface Developers {
  developer(token: string): Promise<{ readonly account: string; readonly name: string | null } | null>;
}

/** What a test room's host does with its room and its sockets. */
export interface TestDeps {
  readonly accounts: Developers;
  /** The room's own and name, as the host's keeper would call them (`toldBreach` tells its Breach of each). */
  readonly room: { own(player: number, account: string): boolean; name(player: number, name: string): boolean };
  /** Sends a player away and takes them out of the room at once: with `why`, told; without, their account joined
   *  again by another socket; joining again may find them back if `rejoinable`. */
  readonly away: (player: number, why?: string, rejoinable?: boolean) => void;
  /** In a Breach's test run, whether its zone copy's gate opened to it (`Breach.gateOpen`); elsewhere always. */
  readonly gateOpen?: () => Promise<boolean>;
  /** Waits `span` ms (a timer unless a test says). */
  readonly wait?: (span: number) => Promise<void>;
}

/** A test room's sign-ins, in the shape of the keeper's (`Keeper`) where the host calls either. */
export class TestRun {
  private readonly deps: TestDeps;
  /** Each player let in, by their account. */
  private readonly held = new Map<number, string>();
  /** Whether a Breach's test run's gate opened: its zone copy is forgotten a minute after its tester walks through,
   *  so the run takes its word once and keeps it while it lives. */
  private gateOpened = false;

  constructor(deps: TestDeps) {
    this.deps = deps;
  }

  /** A player's session's token: a developer's plays, their older socket here (a rejoin, a second tab) sent away
   *  first; anyone else is sent away, and one the accounts do not answer for may join again. */
  async signIn(player: number, token: string, _now: () => number, here: () => boolean): Promise<boolean> {
    const developer = await this.deps.accounts.developer(token).catch(() => undefined);
    const gateOpen = this.deps.gateOpen ?? (() => Promise.resolve(true));
    if (developer && !this.gateOpened) this.gateOpened = await gateOpen().catch(() => false);
    const open = this.gateOpened;
    if (!here()) return false;
    if (developer === undefined) return this.lost(player, ACCOUNTS_TROUBLE, true);
    if (developer === null) return this.lost(player, DEVELOPERS_ONLY, false);
    if (!open) return this.lost(player, GATE_SHUT, false);
    for (const [other, account] of this.held)
      if (account === developer.account) {
        this.held.delete(other);
        this.deps.away(other);
      }
    if (!this.deps.room.own(player, developer.account)) return this.lost(player, ACCOUNTS_TROUBLE, true);
    if (developer.name !== null) this.deps.room.name(player, developer.name);
    this.held.set(player, developer.account);
    return true;
  }

  /** Sends away a player whose token has not come in time, as a run does. */
  async tokenDue(player: number, signed: () => boolean, here: () => boolean): Promise<void> {
    const wait = this.deps.wait ?? ((span: number) => new Promise<void>((done) => setTimeout(done, span)));
    await wait(TOKEN_WAIT_MS);
    if (here() && !signed()) this.deps.away(player, SIGN_IN_FOR_RUN, false);
  }

  /** A player left: nothing is saved, as nothing of a test room is kept. */
  leave(player: number): Promise<void> {
    this.held.delete(player);
    return Promise.resolve();
  }

  private lost(player: number, why: string, rejoinable: boolean): false {
    this.deps.away(player, why, rejoinable);
    return false;
  }
}
