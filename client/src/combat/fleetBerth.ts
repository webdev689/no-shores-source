import { fleetAddress } from '../network/roomAddress.ts';
import { RoomConnection } from '../network/roomConnection.ts';
import { type FleetRules, startFleetRules } from '../rules/fleetRules.ts';
import { FleetSession } from './fleetSession.ts';

/** The room's rules from the `room.wasm` a page serves under `base`, compiled. */
export async function fleetRulesAt(base: string): Promise<FleetRules> {
  const bytes = await (await fetch(`${base}room.wasm`)).arrayBuffer();
  return startFleetRules(await WebAssembly.compile(bytes));
}

/**
 * A page's way into a fleet room, with `?room=` in its address: the room's address, its rules compiled once, and the
 * Sloop's session there and its socket while it is at sea.
 */
export class FleetBerth {
  readonly url: string;
  private readonly load: () => Promise<FleetRules>;
  private rules: Promise<FleetRules> | null = null;
  private connection: RoomConnection | null = null;
  /** The join under way: one let go before the room answers is dropped, its socket closed once it opens. */
  private joining: object | null = null;

  private constructor(url: string, load: () => Promise<FleetRules>) {
    this.url = url;
    this.load = load;
  }

  /** The berth the page's address asks for, or null; its rules loaded by `load` when it first joins. */
  static fromPage(search: string, load: () => Promise<FleetRules>): FleetBerth | null {
    const url = fleetAddress(new URLSearchParams(search).get('room'));
    return url === null ? null : new FleetBerth(url, load);
  }

  /** The room's rules, compiled once; rules that would not load are asked for again on the next join. */
  private rulesOf(): Promise<FleetRules> {
    if (this.rules) return this.rules;
    const compiling = this.load();
    this.rules = compiling;
    compiling.catch(() => {
      if (this.rules === compiling) this.rules = null;
    });
    return compiling;
  }

  /** Joins the fleet with the Sloop put to sea at (x, y) heading `heading`: its session once the room has welcomed
   *  it, or `fail` with why not. */
  join(
    start: readonly [number, number, number],
    joined: (session: FleetSession) => void,
    fail: (error: unknown) => void,
  ): void {
    if (this.joining || this.connection) return;
    const attempt = {};
    this.joining = attempt;
    let session: FleetSession | null = null;
    const opened = RoomConnection.open(this.url, (snapshot) => session?.receive(snapshot, performance.now() / 1000));
    Promise.all([this.rulesOf(), opened])
      .then(([rules, connection]) => {
        if (this.joining !== attempt) {
          connection.close();
          return;
        }
        this.joining = null;
        this.connection = connection;
        session = new FleetSession(connection, rules, start);
        joined(session);
      })
      .catch((error: unknown) => {
        // A socket that opened while the rules failed holds a place in the room: it is closed.
        opened.then(
          (connection) => connection.close(),
          () => undefined,
        );
        if (this.joining !== attempt) return;
        this.joining = null;
        fail(error);
      });
  }

  /** Brings it in, or lets go of its join: it leaves the fleet. */
  leave(): void {
    this.joining = null;
    this.connection?.close();
    this.connection = null;
  }
}
