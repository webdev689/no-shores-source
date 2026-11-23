// The keeper's tests' room and accounts: a room on land whose characters are plain strings, and a database with one
// guest's session, on a clock the test moves.
import { handle } from './accounts/accounts.ts';
import { characters } from './accounts/characters.ts';
import { sqliteForTests } from './accounts/sqliteForTests.ts';
import type { KeptRoom } from './keeping.ts';

/** A room on land whose players' characters are plain strings; `{` starts one it can read. Its gate shuts as `gate`
 *  says, open to all unless told. */
export function roomOf(
  gate: (kept: string | null) => string = () => '',
): KeptRoom & { readonly held: Map<number, string>; readonly named: Map<number, string> } {
  const held = new Map<number, string>();
  const named = new Map<number, string>();
  return {
    held,
    named,
    character: (player) => held.get(player) ?? null,
    restoreCharacter: (player, kept) => kept.startsWith('{') && held.has(player) && Boolean(held.set(player, kept)),
    own: (player) => held.has(player),
    name: (player, name) => held.has(player) && Boolean(named.set(player, name)),
    shut: (_player, kept) => gate(kept),
  };
}

export async function world() {
  const database = sqliteForTests();
  const clock = { now: 5_000_000 };
  const kept = characters(
    database,
    () => clock.now,
    () => Promise.resolve(),
  );
  const guest = await handle(new Request('https://a.test/v1/guest', { method: 'POST' }), {
    database,
    now: () => clock.now,
    discord: null,
    pages: [],
  });
  const { token } = (await guest.json()) as { token: string };
  return { database, clock, kept, token };
}
