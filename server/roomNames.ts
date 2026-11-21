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

/** A sea island's room by the name after `isle-`: `<its number>-<its seed, 16 hex digits>`, and `--elite` or
 *  `--abyss` after it for an island of that sea's room, so an island the sea rolls after a restart, whose number an
 *  older one held, never opens that older one's room. Null for any other spelling. */
export function isleRoom(name: string): { readonly id: number; readonly seed: string; readonly seas: number } | null {
  const [island = '', seas, ...more] = name.split('--');
  const difficulty = seas === undefined ? 0 : SEAS.indexOf(seas);
  const found = /^([1-9][0-9]{0,9})-([0-9a-f]{16})$/.exec(island);
  if (!found?.[1] || !found[2] || more.length > 0 || difficulty < 0 || seas === SEAS[0]) return null;
  const id = Number(found[1]);
  return id <= 0xffff_ffff ? { id, seed: BigInt(`0x${found[2]}`).toString(), seas: difficulty } : null;
}

/** The sea's room's name at a difficulty (0 Normal, 1 Elite, 2 Abyss), as `seaRoom` reads it. */
export function seaRoomName(seas: number): string {
  return seas > 0 && seas < SEAS.length ? `sea--${SEAS[seas] ?? ''}` : 'sea';
}

/** The sea's room by its name: `sea` at Normal, `sea--elite` or `sea--abyss`, answering its difficulty; null for any
 *  other name. */
export function seaRoom(name: string): number | null {
  const [sea, seas, ...more] = name.split('--');
  const difficulty = seas === undefined ? 0 : SEAS.indexOf(seas);
  if (sea !== 'sea' || more.length > 0 || difficulty < 0 || seas === SEAS[0]) return null;
  return difficulty;
}
