/** The difficulties a voyage sets out at, by the gear crate's numbers. */
const SEAS = ['normal', 'elite', 'abyss'];
/** A patrol's dungeons, by their numbers: `dungeon-0` to `dungeon-2`. */
const DUNGEON = /^dungeon-([0-2])$/;
/** A run's instance: eight lowercase letters or digits, after `--run-` at a room name's end. */
export const RUN_ENDING = /--run-[a-z0-9]{8}$/;
const RUN = /^run-([a-z0-9]{8})$/;

/** A node's room by the name after `node-`: `<id>` at Normal, `<id>--elite` or `<id>--abyss`; a patrol's dungeon's
 *  room with `--dungeon-<number>` after that; and a run with `--run-<instance>` last. A patrol's dungeon is one shared
 *  room at Normal and only a run at Elite or Abyss. Null for any other spelling, so no one opens a fresh copy of a
 *  shared room to gather or loot again, nor a shared copy of a private run. */
export function nodeRoom(name: string): {
  readonly id: string;
  readonly seas: number;
  readonly dungeon: number | null;
  readonly run: string | null;
} | null {
  const parts = name.split('--');
  // A run's and a dungeon's endings only after `--`: a node may itself be called `dungeon-0`.
  const last = parts.length > 1 ? (parts.at(-1) ?? '') : '';
  if (last.startsWith('run-') && !RUN.test(last)) return null;
  const run = RUN.exec(last)?.[1] ?? null;
  if (run !== null) parts.pop();
  const number = parts.length > 1 ? DUNGEON.exec(parts.at(-1) ?? '')?.[1] : undefined;
  if (number !== undefined) parts.pop();
  const [id = '', seas, ...more] = parts;
  const difficulty = seas === undefined ? 0 : SEAS.indexOf(seas);
  if (id === '' || more.length > 0 || difficulty < 0 || seas === SEAS[0]) return null;
  if (number !== undefined && (difficulty === 0) !== (run === null)) return null;
  return { id, seas: difficulty, dungeon: number === undefined ? null : Number(number), run };
}

/** A sea island's dungeon's room: its continent's layout id, its style's key, its seed as 8 lowercase hex digits,
 *  then at Elite or Abyss its tier and its run's instance. Shared at Normal, a run at the harder two. */
const SEA_DUNGEON = new RegExp(
  '^sea-dungeon-(continent-[1-9])-(crypt|halls|cells|sanctum|caverns|mines)-([0-9a-f]{8})' +
    '(?:--(elite|abyss)--run-([a-z0-9]{8}))?$',
);

/** A sea island's dungeon's room by its whole name (`sea-dungeon-...`); null for any other spelling. */
export function seaDungeonRoom(name: string): {
  readonly continent: string;
  readonly style: string;
  readonly seed: number;
  readonly seas: number;
  readonly run: string | null;
} | null {
  const [, continent = '', style = '', seed = '', tier, run] = SEA_DUNGEON.exec(name) ?? [];
  if (seed === '') return null;
  return {
    continent,
    style,
    seed: Number.parseInt(seed, 16),
    seas: tier === undefined ? 0 : SEAS.indexOf(tier),
    run: run ?? null,
  };
}

/** The ask `open_run` opens a dungeon's room from, by its name and the Unix minute it opens: null for a name that is
 *  no run or sea island's dungeon (a patrol's shared Normal dungeon opens from its patrol's file). */
export function runAsk(room: string, minute: number): string | null {
  const sea = seaDungeonRoom(room);
  if (sea) {
    const { seed, style, continent } = sea;
    return JSON.stringify({ dungeon: { seed, style, continent }, tier: sea.seas, minute });
  }
  const named = room.startsWith('node-') ? nodeRoom(room.slice('node-'.length)) : null;
  if (!named || named.run === null) return null;
  const dungeon = named.dungeon === null ? { place: named.id } : { patrol: named.id, number: named.dungeon };
  return JSON.stringify({ dungeon, tier: named.seas, minute });
}

/** Whether a room is a run, kept to the company that entered it. */
export function privateRun(room: string): boolean {
  return RUN_ENDING.test(room);
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
