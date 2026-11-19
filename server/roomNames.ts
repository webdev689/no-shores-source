/** The seas a voyage sets out at, by the gear crate's numbers. */
const SEAS = ['calm', 'rough', 'storm'];
/** A patrol's dungeons, by their numbers: `dungeon-0` to `dungeon-2`. */
const DUNGEON = /^dungeon-([0-2])$/;

/** A node's room by the name after `node-`: `<id>` at calm seas, `<id>--rough` or `<id>--storm`; a patrol's dungeon's
 *  room with `--dungeon-<number>` after that. Null for any other spelling, so each node and each dungeon has one room
 *  at each sea and no one opens a fresh copy of it to gather or loot again. */
export function nodeRoom(
  name: string,
): { readonly id: string; readonly seas: number; readonly dungeon: number | null } | null {
  const parts = name.split('--');
  const number = DUNGEON.exec(parts.at(-1) ?? '')?.[1];
  if (number !== undefined) parts.pop();
  const [id = '', seas, ...more] = parts;
  const difficulty = seas === undefined ? 0 : SEAS.indexOf(seas);
  if (id === '' || more.length > 0 || difficulty < 0 || seas === SEAS[0]) return null;
  return { id, seas: difficulty, dungeon: number === undefined ? null : Number(number) };
}
