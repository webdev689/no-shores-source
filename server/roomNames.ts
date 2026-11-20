/** The difficulties a voyage sets out at, by the gear crate's numbers. */
const SEAS = ['normal', 'elite', 'abyss'];

/** A node's room by the name after `node-`: `<id>` at Normal, `<id>--elite` or `<id>--abyss`; null for any other
 *  spelling, so each node has one room at each difficulty and no one opens a fresh copy of it to gather or loot again. */
export function nodeRoom(name: string): { readonly id: string; readonly seas: number } | null {
  const [id = '', seas, ...more] = name.split('--');
  const difficulty = seas === undefined ? 0 : SEAS.indexOf(seas);
  if (id === '' || more.length > 0 || difficulty < 0 || seas === SEAS[0]) return null;
  return { id, seas: difficulty };
}

/** A sea island's room by the name after `isle-`: `<its number>-<its seed, 16 hex digits>`, so an island the sea rolls
 *  after a restart, whose number an older one held, never opens that older one's room. Null for any other spelling. */
export function isleRoom(name: string): { readonly id: number; readonly seed: string } | null {
  const found = /^([1-9][0-9]{0,9})-([0-9a-f]{16})$/.exec(name);
  if (!found?.[1] || !found[2]) return null;
  const id = Number(found[1]);
  return id <= 0xffff_ffff ? { id, seed: BigInt(`0x${found[2]}`).toString() } : null;
}
