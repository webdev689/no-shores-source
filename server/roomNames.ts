import { weekOf } from '../client/src/game/guild/guildLaw.ts';

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
/** A Breach's tiers, by the gear crate's numbers, and a Breach's run's mark before its instance: `breach-hard`. */
export const BREACH_TIERS = ['normal', 'hard'] as const;
const BREACH = /^breach-(normal|hard)$/;

/** The mark of an Elite Dungeon's run started at sea, before its instance: `--sea`, after the week's tier from the
 *  Playlist, or after the node's id alone at Normal. */
const STARTED_AT_SEA = 'sea';
const SEA_STARTED = /--sea--run-[a-z0-9]{8}$/;

/** A test run's instance, after `--test-` where its real run's is after `--run-`; and the patrol zones whose Breach's
 *  gate a test copies, each zone copy named by the instance of the test run it opens (`gear::breach::DROWNED_VALE`). */
const TEST = /^test-([a-z0-9]{8})$/;
const BREACH_GATES = ['gullwing-vale'];

/** A node's room by the name after `node-`: `<id>` at Normal, `<id>--elite` or `<id>--abyss`; a patrol's dungeon's
 *  room with `--dungeon-<number>` after that; and a run with `--run-<instance>` last. A patrol's dungeon is one shared
 *  room at Normal and only a run at Elite or Abyss. A playlist's run of an Elite Dungeon at Elite or Abyss names its
 *  foes' level before its instance, `--playlist-<level>`, and an Elite Dungeon's run started at sea `--sea`. A
 *  Breach's run names its gate's patrol zone and its tier before its instance, `--breach-<tier>`. Null for any other
 *  spelling, so no one opens a fresh copy of a shared room to gather or loot again, nor a shared copy of a private run.
 *  A guild's outpost's room is a bare node's with `--guild-<key>` last, and `guild` its key; its guild dungeon's run
 *  that with its tier at Elite or Abyss after it, then `--run-<instance>` (`delveRoom.ts`). */
export function nodeRoom(name: string): {
  readonly id: string;
  readonly seas: number;
  readonly dungeon: number | null;
  readonly run: string | null;
  readonly playlist: number | null;
  readonly guild: string | null;
  readonly breach: number | null;
  readonly test?: true;
} | null {
  const parts = name.split('--');
  if (parts.length > 1 && parts.at(-1)?.startsWith('test-') === true) return testNode(parts);
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
    return { id, seas: tier, dungeon: null, run, playlist: null, guild: key, breach: null };
  }
  if (last.startsWith('run-') && !RUN.test(last)) return null;
  const run = RUN.exec(last)?.[1] ?? null;
  if (run !== null) parts.pop();
  const tier = run !== null && parts.length === 2 ? BREACH.exec(parts.at(-1) ?? '')?.[1] : undefined;
  if (tier !== undefined) parts.pop();
  const breach = tier === undefined ? null : BREACH_TIERS.indexOf(tier as (typeof BREACH_TIERS)[number]);
  const listed = run !== null && parts.length > 2 ? PLAYLIST.exec(parts.at(-1) ?? '')?.[1] : undefined;
  if (listed !== undefined) parts.pop();
  // After the node's id alone: a node may itself be called `sea`.
  const atSea = listed === undefined && run !== null && parts.length > 1 && parts.at(-1) === STARTED_AT_SEA;
  if (atSea) parts.pop();
  const marked = listed !== undefined || atSea;
  const number = !marked && parts.length > 1 ? DUNGEON.exec(parts.at(-1) ?? '')?.[1] : undefined;
  if (number !== undefined) parts.pop();
  const [id = '', seas, ...more] = parts;
  const difficulty = seas === undefined ? 0 : SEAS.indexOf(seas);
  if (id === '' || more.length > 0 || difficulty < 0 || seas === SEAS[0]) return null;
  if (number !== undefined && (difficulty === 0) !== (run === null)) return null;
  const playlist = listed === undefined ? null : Number(listed);
  return {
    id,
    seas: difficulty,
    dungeon: number === undefined ? null : Number(number),
    run,
    playlist,
    guild: null,
    breach,
  };
}

/** A test room's node by its name's parts (`testRoom`): a Breach's gate's zone copy, or a test run named as its real
 *  run is but for its last part. A run marked `--sea`, a patrol's dungeon's, a guild's and one at Normal have no test. */
function testNode(parts: string[]): ReturnType<typeof nodeRoom> {
  const instance = TEST.exec(parts.pop() ?? '')?.[1];
  const [id = ''] = parts;
  if (instance === undefined) return null;
  if (parts.length === 1)
    return BREACH_GATES.includes(id)
      ? { id, seas: 0, dungeon: null, run: null, playlist: null, guild: null, breach: null, test: true }
      : null;
  const real = parts.at(-1) === STARTED_AT_SEA ? null : nodeRoom([...parts, `run-${instance}`].join('--'));
  const fits = real && real.dungeon === null && real.guild === null && (real.seas > 0 || real.breach !== null);
  return fits ? { ...real, test: true } : null;
}

/** Whether a room is a test room, for developers alone: a test run (`--test-<instance>` where its real run is
 *  `--run-<instance>`), or the zone copy whose Breach's gate a Breach's test run opens from. */
export function testRoom(room: string): boolean {
  return room.startsWith('node-') && nodeRoom(room.slice('node-'.length))?.test === true;
}

/** Whether a node's run was started at sea: a playlist's run, or an Elite Dungeon's marked `--sea` (the week's from
 *  the Playlist, or one at Normal). Such a run is entered from the sea and left back to it, never by its dungeon's
 *  door, so it carries no one across the sea. */
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
  if (!named || named.run === null || named.guild !== null || named.breach !== null) return null;
  const dungeon = named.dungeon === null ? { place: named.id } : { patrol: named.id, number: named.dungeon };
  const playlist = named.playlist === null ? {} : { playlist: named.playlist };
  return JSON.stringify({ dungeon, tier: named.seas, minute, ...playlist });
}

/** A passage zone's room: its island's continent's id, its web's week (`gear::clock::week_of`), its zone's number in
 *  the web, then `--<copy>` (2 to `PASSAGE_COPIES`) for a public room opened when the ones before it were full, or a
 *  company's route's `--run-<instance>`. Numbers are spelled without leading zeros, so each room has one name. */
const PASSAGE = /^passage-(continent-[1-9])-w([1-9][0-9]{0,5})-z(0|[1-9][0-9]{0,2})(?:--([2-9])|--run-([a-z0-9]{8}))?$/;

/** The most public copies of a passage zone's room, the first among them: the page tries each in turn, and no other
 *  copy opens. The name's pattern spells one digit, so it holds to 9. */
export const PASSAGE_COPIES = 9;

/** The most players a public passage zone's room holds; the next joins the next copy (`--2`, `--3`). */
export const PASSAGE_MOST = 8;

/** A passage zone's room by its whole name (`passage-...`): its island, week and zone, its copy (1 for the first
 *  public room) and its route's instance (null for a public room). Null for any other spelling, so each room has one
 *  name and no other spelling opens a fresh room, nor a public copy of a route. */
export function passageRoom(name: string | null): {
  readonly island: string;
  readonly week: number;
  readonly zone: number;
  readonly copy: number;
  readonly run: string | null;
} | null {
  const [, island = '', week = '', zone = '', copy, run] = PASSAGE.exec(name ?? '') ?? [];
  if (island === '') return null;
  return {
    island,
    week: Number(week),
    zone: Number(zone),
    copy: copy === undefined ? 1 : Number(copy),
    run: run ?? null,
  };
}

/** A passage zone's room's name: the first public room, a later copy, or a company's route by its instance. */
export function passageRoomName(island: string, week: number, zone: number, after: number | string = 1): string {
  const ending = typeof after === 'string' ? `--run-${after}` : after > 1 ? `--${after}` : '';
  return `passage-${island}-w${week}-z${zone}${ending}`;
}

/** The ask `open_passage` opens a passage zone's room from, at the Unix minute `minute`, or why it opens none: a name
 *  that is no passage's, last week's (whose ways lead elsewhere now, so its zone is never laid), or any other week but
 *  this one. */
export function passageAsk(name: string, minute: number): { readonly ask: string } | { readonly why: string } {
  const named = passageRoom(name);
  if (!named) return { why: 'No such passage.' };
  const week = weekOf(minute * 60_000);
  if (named.week === week - 1) return { why: 'The passage has shifted' };
  if (named.week !== week) return { why: "That week's passages are gone." };
  const route = named.run === null ? 'public' : 'company';
  return { ask: JSON.stringify({ island: named.island, week: named.week, zone: named.zone, route, minute }) };
}

/** The ask `open_breach` opens a Breach's run from, by its name and the Unix minute it opens: its gate's patrol zone
 *  and its tier. Null for a name that is no Breach's run. */
export function breachAsk(room: string, minute: number): string | null {
  const named = room.startsWith('node-') ? nodeRoom(room.slice('node-'.length)) : null;
  return !named || named.breach === null ? null : JSON.stringify({ zone: named.id, tier: named.breach, minute });
}

/** The Breach's run a name is, by its gate's patrol zone's room and its tier: null for any other name. A test run's
 *  zone is its own copy, named by its instance. */
export function breachRun(room: string): { readonly zone: string; readonly tier: number } | null {
  const named = room.startsWith('node-') ? nodeRoom(room.slice('node-'.length)) : null;
  if (!named || named.breach === null) return null;
  return { zone: named.test ? `node-${named.id}--test-${named.run ?? ''}` : `node-${named.id}`, tier: named.breach };
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

/** Whether a room is a run, kept to the company that entered it, or a test room, kept to developers. */
export function privateRun(room: string): boolean {
  return RUN_ENDING.test(room) || testRoom(room);
}

/** The start of a Test Ground room's name, `test-<name>`: the Test Ground opens by no other. */
export const TEST_GROUND = 'test-';

/** The most a run holds, as an Elite Dungeon's run is for; a Breach's run holds a whole company's most
 *  (`accounts/companies.ts`), as `gear::breach::COMPANY_MOST`. */
export const RUN_MOST = 4;
export const BREACH_MOST = 8;

/** The most accounts a run holds: a Breach's eight (and its test's zone copy's), any other's four. */
export function runMost(room: string): number {
  const zoneCopy = testRoom(room) && nodeRoom(room.slice('node-'.length))?.run === null;
  return breachRun(room) === null && !zoneCopy ? RUN_MOST : BREACH_MOST;
}

/** The most sockets a room holds: a guard against one client opening sockets without end, since every snapshot
 *  carries every player to every socket. A room on land holds fewer players than 64; the sea counts on it. A run
 *  holds twice a company, signed in or not: a member's rejoin may come before the room sees their old socket close,
 *  and a socket that never signs in is kept up to five seconds (`TOKEN_WAIT_MS`). */
export function socketsMost(room: string): number {
  if (privateRun(room)) return runMost(room) * 2;
  return passageRoom(room) ? PASSAGE_MOST * 2 : 64;
}

/** Why a run sends away a player whose account would make it more than its most accounts (`runMost`), counting
 *  theirs, or a public passage zone's room more than PASSAGE_MOST; null for a room with room, or one that is
 *  neither. */
export function runFull(room: string, accounts: number): string | null {
  if (privateRun(room)) return accounts > runMost(room) ? 'This run is full.' : null;
  return passageRoom(room) && accounts > PASSAGE_MOST ? PASSAGE_FULL : null;
}

/** Why a public passage zone's room sends away a ninth account: the page joins the next copy on it. */
export const PASSAGE_FULL = 'This passage is full.';

/** Why a room at its most sockets or players turns a socket away: a passage zone's says it is full, so the page tries
 *  its next copy. */
export function roomFull(room: string): string {
  return passageRoom(room) ? PASSAGE_FULL : 'the room is full';
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

/** A sea island's room by the name after `isle-`: `<its number>-<its seed, 16 hex digits>`, so an island the sea
 *  rolls after a restart, whose number an older one held, never opens that older one's room; and `--elite` or
 *  `--abyss` after it for the tier the voyage landed at, as a node's room has. Null for any other spelling. */
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

/** The sea's room by its name, answering its difficulty: `sea`, at Normal, the one sea every voyage sails for now;
 *  null for any other name, `sea--elite` and `sea--abyss` among them, so no room opens at the sea's other tiers. An
 *  island landed at Elite or Abyss, and its dungeon, are the one sea's (`seaIsland.ts`). */
export function seaRoom(name: string): number | null {
  return name === seaRoomName(0) ? 0 : null;
}
