/** The difficulties a voyage sets out at, by the gear crate's numbers. */
const SEAS = ['normal', 'elite', 'abyss'];
/** A patrol's dungeons, by their numbers: `dungeon-0` to `dungeon-2`. */
const DUNGEON = /^dungeon-([0-2])$/;

/** A node's room by the name after `node-`: `<id>` at Normal, `<id>--elite` or `<id>--abyss`; a patrol's dungeon's
 *  room with `--dungeon-<number>` after that. Null for any other spelling, so each node and each dungeon has one room
 *  at each difficulty and no one opens a fresh copy of it to gather or loot again. */
export function nodeRoom(
  name: string,
): { readonly id: string; readonly seas: number; readonly dungeon: number | null } | null {
  const parts = name.split('--');
  // A dungeon's ending only after `--`: a node may itself be called `dungeon-0`.
  const number = parts.length > 1 ? DUNGEON.exec(parts.at(-1) ?? '')?.[1] : undefined;
  if (number !== undefined) parts.pop();
  const [id = '', seas, ...more] = parts;
  const difficulty = seas === undefined ? 0 : SEAS.indexOf(seas);
  if (id === '' || more.length > 0 || difficulty < 0 || seas === SEAS[0]) return null;
  return { id, seas: difficulty, dungeon: number === undefined ? null : Number(number) };
}

/** The tiers' old names in a node's room, by their names now. */
const OLD_TIERS = new Map([
  ['rough', 'elite'],
  ['storm', 'abyss'],
]);

/** A room's one name: a node's tier suffix spelled the old way (`--rough`, `--storm`) as it is spelled now, any other
 *  name as it is. */
export function canonicalRoom(name: string): string {
  if (!name.startsWith('node-')) return name;
  const [node = '', tier = '', ...rest] = name.split('--');
  const now = OLD_TIERS.get(tier);
  // A page loaded before the rename still builds the old names: it joins the room it meant, and the welcome's new
  // protocol hash makes it load again.
  return now === undefined ? name : [node, now, ...rest].join('--');
}
