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
