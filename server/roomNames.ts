/** The difficulties a voyage sets out at, by the gear crate's numbers. */
const SEAS = ['normal', 'elite', 'abyss'];
/** A patrol's dungeons, by their numbers: `dungeon-0` to `dungeon-2`. */
const DUNGEON = /^dungeon-([0-2])$/;
/** A run's instance: eight lowercase letters or digits, after `--run-` at a room name's end. */
export const RUN_ENDING = /--run-[a-z0-9]{8}$/;
const RUN = /^run-([a-z0-9]{8})$/;
/** A guild's outpost's room's ending: the guild's key, its id's 32 lowercase hex digits (`guildKey`). */
const GUILD = /^guild-([0-9a-f]{32})$/;
/** A playlist's run's foes' level, before its instance: `playlist-12`. */
const PLAYLIST = /^playlist-([1-9][0-9]?)$/;

/** The mark of the week's Elite Dungeon's run started at sea from the Playlist, before its instance: `--sea`. */
const STARTED_AT_SEA = 'sea';
const SEA_STARTED = /--sea--run-[a-z0-9]{8}$/;

/** A node's room by the name after `node-`: `<id>` at Normal, `<id>--elite` or `<id>--abyss`; a patrol's dungeon's
 *  room with `--dungeon-<number>` after that; and a run with `--run-<instance>` last. A patrol's dungeon is one shared
 *  room at Normal and only a run at Elite or Abyss. A playlist's run of an Elite Dungeon at Elite or Abyss names its
 *  foes' level before its instance, `--playlist-<level>`, and the week's run started from the Playlist `--sea`. Null
 *  for any other spelling, so no one opens a fresh copy of a shared room to gather or loot again, nor a shared copy of
 *  a private run. A guild's outpost's room is a bare node's with `--guild-<key>` last, and `guild` its key; its guild
 *  dungeon's run that with its tier at Elite or Abyss after it, then `--run-<instance>` (`delveRoom.ts`). */
export function nodeRoom(name: string): {
  readonly id: string;
  readonly seas: number;
  readonly dungeon: number | null;
  readonly run: string | null;
  readonly playlist: number | null;
  readonly guild: string | null;
} | null {
  const parts = name.split('--');
  // A run's and a dungeon's endings only after `--`: a node may itself be called `dungeon-0`.
  const last = parts.length > 1 ? (parts.at(-1) ?? '') : '';
  const guilded = parts[1]?.startsWith('guild-') === true;
  if (guilded || last.startsWith('guild-')) {
    const [id = '', guild = '', ...after] = parts;
    const key = GUILD.exec(guild)?.[1];
    const run = RUN.exec(after.at(-1) ?? '')?.[1] ?? null;
    const tier = after.length === 2 ? SEAS.indexOf(after[0] ?? '') : 0;
    // On a bare node alone; its run names only its tier at Elite or Abyss and its instance after it.
    const fits = after.length === 0 || (run !== null && (after.length === 1 || (after.length === 2 && tier > 0)));
    if (key === undefined || id === '' || !fits) return null;
    return { id, seas: tier, dungeon: null, run, playlist: null, guild: key };
  }
  if (last.startsWith('run-') && !RUN.test(last)) return null;
  const run = RUN.exec(last)?.[1] ?? null;
  if (run !== null) parts.pop();
  const listed = run !== null && parts.length > 2 ? PLAYLIST.exec(parts.at(-1) ?? '')?.[1] : undefined;
  if (listed !== undefined) parts.pop();
  const atSea = listed === undefined && run !== null && parts.length > 2 && parts.at(-1) === STARTED_AT_SEA;
  if (atSea) parts.pop();
  const marked = listed !== undefined || atSea;
  const number = !marked && parts.length > 1 ? DUNGEON.exec(parts.at(-1) ?? '')?.[1] : undefined;
  if (number !== undefined) parts.pop();
  const [id = '', seas, ...more] = parts;
  const difficulty = seas === undefined ? 0 : SEAS.indexOf(seas);
  if (id === '' || more.length > 0 || difficulty < 0 || seas === SEAS[0]) return null;
  if (number !== undefined && (difficulty === 0) !== (run === null)) return null;
  const playlist = listed === undefined ? null : Number(listed);
  return { id, seas: difficulty, dungeon: number === undefined ? null : Number(number), run, playlist, guild: null };
}

/** Whether a node's run was started at sea from the Playlist: a playlist's run, or the week's marked `--sea`. Such a
 *  run is entered from the sea and left back to it, never by its dungeon's door, so it carries no one across the sea. */
export function startedAtSea(room: string): boolean {
  const named = room.startsWith('node-') ? nodeRoom(room.slice('node-'.length)) : null;
  return named !== null && (named.playlist !== null || SEA_STARTED.test(room));
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
 *  no run or sea island's dungeon (a patrol's shared Normal dungeon opens from its patrol's file), and for a guild
 *  dungeon's run, whose ask needs its outpost read first (`delveHost.ts`). */
export function runAsk(room: string, minute: number): string | null {
  const sea = seaDungeonRoom(room);
  if (sea) {
    const { seed, style, continent } = sea;
    return JSON.stringify({ dungeon: { seed, style, continent }, tier: sea.seas, minute });
  }
  const named = room.startsWith('node-') ? nodeRoom(room.slice('node-'.length)) : null;
  if (!named || named.run === null || named.guild !== null) return null;
  const dungeon = named.dungeon === null ? { place: named.id } : { patrol: named.id, number: named.dungeon };
  const playlist = named.playlist === null ? {} : { playlist: named.playlist };
  return JSON.stringify({ dungeon, tier: named.seas, minute, ...playlist });
}

/** The letters a run's instance is drawn from: 36, so each of its 8 random bytes is taken modulo 36. */
const INSTANCE = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** A new run's instance: eight lowercase letters or digits, drawn at random so no one outside the company finds it. */
export function runInstance(
  random: (bytes: Uint8Array<ArrayBuffer>) => Uint8Array = (bytes) => crypto.getRandomValues(bytes),
): string {
  return Array.from(random(new Uint8Array(8)), (byte) => INSTANCE[byte % INSTANCE.length]).join('');
}

/** How many of a guild dungeon's run's instance's letters name the week it is laid for, in base 36. */
const DELVE_WEEK_LETTERS = 3;

/** A guild dungeon's run's instance: the week it is laid for, then the rest of the random `instance`. A companion who
 *  joins after the week turns lays the run's own week from it, as the room does, not the new week's. */
export function delveInstance(week: number, instance: string): string {
  const named = week.toString(36).padStart(DELVE_WEEK_LETTERS, '0').slice(-DELVE_WEEK_LETTERS);
  return `${named}${instance.slice(DELVE_WEEK_LETTERS)}`;
}

/** The week a guild dungeon's run is laid for, read from its instance. */
export function delveWeek(instance: string): number {
  return Number.parseInt(instance.slice(0, DELVE_WEEK_LETTERS), 36);
}

/** Whether a room is a run, kept to the company that entered it. */
export function privateRun(room: string): boolean {
  return RUN_ENDING.test(room);
}

/** The start of a Test Ground room's name, `test-<name>`: the Test Ground opens by no other. */
export const TEST_GROUND = 'test-';

/** The most a run holds: a company's most (`accounts/companies.ts`), as an Elite Dungeon's run is for. */
export const RUN_MOST = 4;

/** The most sockets a room holds: a guard against one client opening sockets without end, since every snapshot
 *  carries every player to every socket. A room on land holds fewer players than 64; the sea counts on it. A run
 *  holds twice a company, signed in or not: a member's rejoin may come before the room sees their old socket close,
 *  and a socket that never signs in is kept up to five seconds (`TOKEN_WAIT_MS`). */
export function socketsMost(room: string): number {
  return privateRun(room) ? RUN_MOST * 2 : 64;
}

/** Why a run sends away a player whose account would make it more than RUN_MOST accounts, counting theirs; null for
 *  a run with room, or a room that is no run. */
export function runFull(room: string, accounts: number): string | null {
  return privateRun(room) && accounts > RUN_MOST ? 'This run is full.' : null;
}

/** The other names a tier answers to in a node's room (`rough` for Elite, `storm` for Abyss), each by its own. */
const TIER_ALIASES = new Map([
  ['rough', 'elite'],
  ['storm', 'abyss'],
]);

/** A room's one name: a node's tier suffix in its other spelling (`--rough`, `--storm`) as the tier's own, any other
 *  name as it is. */
export function canonicalRoom(name: string): string {
  if (!name.startsWith('node-')) return name;
  const [node = '', tier = '', ...rest] = name.split('--');
  const own = TIER_ALIASES.get(tier);
  // A page built for the other names joins the room it means, and the welcome's protocol hash makes it load again.
  return own === undefined ? name : [node, own, ...rest].join('--');
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
