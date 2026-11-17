import { fleetAddress } from '../network/roomAddress.ts';
import { RoomConnection } from '../network/roomConnection.ts';
import { type FleetRules, startFleetRules } from '../rules/fleetRules.ts';
import { FleetSession } from './fleetSession.ts';

/** The room's rules, compiled once for a page that sails in a fleet. */
async function fleetRulesOf(): Promise<FleetRules> {
  const bytes = await (await fetch(`${import.meta.env.BASE_URL}room.wasm`)).arrayBuffer();
  return startFleetRules(await WebAssembly.compile(bytes));
}

/**
 * A page's way into a fleet room, with `?room=` in its address: the room's address, its rules compiled once, and the
 * Sloop's session there and its socket while she is at sea.
 */
export class FleetBerth {
  readonly url: string;
  private rules: Promise<FleetRules> | null = null;
  private connection: RoomConnection | null = null;
  private joining = false;

  private constructor(url: string) {
    this.url = url;
  }

  /** The berth the page's address asks for, or null. */
  static fromPage(search: string): FleetBerth | null {
    const url = fleetAddress(new URLSearchParams(search).get('room'));
    return url === null ? null : new FleetBerth(url);
  }

  /** Joins the fleet with the Sloop put to sea at (x, y) heading `heading`: her session once the room has welcomed
   *  her, or `fail` with why not. */
  join(
    start: readonly [number, number, number],
    joined: (session: FleetSession) => void,
    fail: (error: unknown) => void,
  ): void {
    if (this.joining || this.connection) return;
    this.joining = true;
    this.rules ??= fleetRulesOf();
    let session: FleetSession | null = null;
    const opened = RoomConnection.open(this.url, (snapshot) => session?.receive(snapshot, performance.now() / 1000));
    Promise.all([this.rules, opened])
      .then(([rules, connection]) => {
        this.joining = false;
        this.connection = connection;
        session = new FleetSession(connection, rules, start);
        joined(session);
      })
      .catch((error: unknown) => {
        this.joining = false;
        fail(error);
      });
  }

  /** Brings her in: she leaves the fleet. */
  leave(): void {
    this.connection?.close();
    this.connection = null;
  }
}
