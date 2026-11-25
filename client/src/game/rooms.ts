import { AccountLink, type Kept, LIVE_ACCOUNTS } from '../network/accounts.ts';
import { LIVE_ROOMS } from '../network/roomAddress.ts';
import type { Difficulty } from '../heldmap/heldMap.ts';
import { BREACH_TIERS } from '../../../server/roomNames.ts';

/**
 * Where the game's rooms are, from its page's `?room=`: none without it (the game plays offline, the rooms' worker
 * running each room); a whole `ws://` or `wss://` address names a server (`?room=ws://127.0.0.1:8787` under `npm run server`),
 * anything else the deployed rooms. The answer names each room's address: `node-<id>` for a node, `sea` for the sea.
 */
export function roomsFrom(given: string | null): ((name: string) => string) | null {
  if (given === null) return null;
  const server = /^wss?:\/\//.test(given) ? given.replace(/\/room(\/.*)?$/, '').replace(/\/+$/, '') : LIVE_ROOMS;
  return (name) => `${server}/room/${name}`;
}

/** Whether an address is this machine's own, where only its player runs servers. */
const LOOPBACK = /^(?:https?|wss?):\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?(?:\/|$)/;

/** Where the game's accounts are, from its page's `?room=` and `?accounts=`. The deployed rooms keep characters on the
 *  deployed accounts; a room server on this machine keeps them on accounts named on this machine
 *  (`?accounts=http://127.0.0.1:8788` under `npm run accounts`). A session goes nowhere else, so a crafted link
 *  cannot send it to another's room or accounts: offline, or with a room server or accounts elsewhere, none are kept. */
export function accountsFrom(rooms: string | null, given: string | null): string | null {
  if (rooms === null) return null;
  const named = /^wss?:\/\//.test(rooms);
  if (named && !LOOPBACK.test(rooms)) return null;
  if (given !== null && LOOPBACK.test(given)) return given;
  return named ? null : LIVE_ACCOUNTS;
}

/** The page's account, from its address: the link to the accounts its `?room=` and `?accounts=` name (null for none),
 *  and a way to the session's token the rooms keep the player's character by, as it stands once the player is signed
 *  in or made a guest. A Discord sign-in comes back with a code in the address's fragment, which is taken and cleared
 *  at once; the tab's own nonce (in `passing`) redeems it. */
export function accountOf(
  page: Location,
  kept: Kept,
  passing: Kept,
): { link: AccountLink | null; session: () => Promise<string | null> } {
  const asking = new URLSearchParams(page.search);
  const where = accountsFrom(asking.get('room'), asking.get('accounts'));
  if (where === null) return { link: null, session: () => Promise.resolve(null) };
  const link = new AccountLink(where, kept, undefined, passing);
  if (link.takeFrom(page.hash)) history.replaceState(null, '', `${page.pathname}${page.search}`);
  // The token is read as each room connects, so a sign-in made after startup (at the story's helm) is the one used.
  const first = link.session();
  return { link, session: () => first.then(() => link.token) };
}

/** The difficulty a node's room stands at on a voyage's: a social space is one for everyone, and an outpost site its
 *  guild's, at Normal whatever it is; a patrol, mission, dungeon or boss stands at the voyage's own. */
export function roomSeas(node: { readonly kind: string }, difficulty: Difficulty): Difficulty {
  return node.kind === 'social' || node.kind === 'outpost' ? 'normal' : difficulty;
}

/** A node's room's name: at a voyage's harder difficulty its own room (`node-<id>--elite`), as `roomSeas` stands it; an
 *  outpost site is the room of the player's guild's outpost there (`node-<id>--guild-<key>`), or the wild site for one
 *  in no guild. */
export function nodeRoom(
  node: { readonly id: string; readonly kind: string },
  difficulty: Difficulty,
  guild: string | null = null,
): string {
  if (node.kind === 'outpost') return guild ? `node-${node.id}--guild-${guild}` : `node-${node.id}`;
  const seas = roomSeas(node, difficulty);
  return seas === 'normal' ? `node-${node.id}` : `node-${node.id}--${seas}`;
}

/** The sea's room a voyage at `difficulty` sails in: `sea` at Normal, else `sea--elite` or `sea--abyss`. */
export function seaRoomName(difficulty: Difficulty): string {
  return difficulty === 'normal' ? 'sea' : `sea--${difficulty}`;
}

/** A patrol's dungeon's room's name before any run: `node-<id>--dungeon-<number>`, the one shared room at Normal, or
 *  `node-<id>--elite--dungeon-<number>`, whose runs (`runOf`) are its rooms at Elite and Abyss. */
export function dungeonRoom(patrol: { readonly id: string }, difficulty: Difficulty, number: number): string {
  const seas = difficulty === 'normal' ? '' : `--${difficulty}`;
  return `node-${patrol.id}${seas}--dungeon-${number}`;
}

/** Other names for Elite and Abyss, which a place the accounts kept may still carry. */
const OLD_NAMES: Readonly<Record<string, Difficulty>> = { rough: 'elite', storm: 'abyss' };

/** The node and difficulty a node's room is for (`node-<id>`, `node-<id>--elite`, a guild's outpost's
 *  `node-<id>--guild-<key>` at Normal), the patrol's dungeon it is
 *  (`--dungeon-<number>` after those, never a node's own name), a playlist's run's foes' level (`--playlist-<level>`),
 *  a Breach's run's tier (`--breach-<tier>` after its gate's patrol zone alone, 0 Normal, 1 Hard), and its run's
 *  instance (`--run-<instance>` last); null for any other room. */
export function nodeOfRoom(room: string): {
  readonly id: string;
  readonly seas: Difficulty;
  readonly dungeon: number | null;
  readonly run: string | null;
  readonly playlist: number | null;
  /** A guild's outpost's key: its room, or the guild dungeon's run behind its Delve Gate. */
  readonly guild: string | null;
  /** A Breach's run's tier: 0 Normal, 1 Hard. */
  readonly breach: number | null;
} | null {
  const found =
    /^node-([a-z0-9]+(?:-[a-z0-9]+)*)(?:--guild-([0-9a-f]{32}))?(?:--(elite|abyss|rough|storm))?(?:--dungeon-([0-2]))?(?:--playlist-([1-9][0-9]?)|--(sea)|--breach-(normal|hard))?(?:--run-([a-z0-9]{8}))?$/.exec(
      room,
    );
  if (!found?.[1]) return null;
  const [, id, guild, named, number, listed, atSea, tier, run] = found;
  const dungeon = number === undefined ? null : Number(number);
  const seas = named === undefined ? 'normal' : (OLD_NAMES[named] ?? (named as Difficulty));
  const playlist = listed === undefined ? null : Number(listed);
  // A run started from the Playlist is an Elite Dungeon's alone, at Elite or Abyss, as the rooms read it.
  const marked = playlist !== null || atSea !== undefined;
  if (marked && (dungeon !== null || run === undefined || seas === 'normal')) return null;
  // A guild's outpost is a bare node's; its dungeon a run at a tier, never a patrol's dungeon, a playlist's or a
  // Breach's.
  const guilded = dungeon !== null || marked || tier !== undefined || (named !== undefined && run === undefined);
  if (guild !== undefined && guilded) return null;
  // A Breach's run names its gate's zone and its tier alone, and is only ever a run (server/roomNames.ts).
  const breach = tier === undefined ? null : BREACH_TIERS.indexOf(tier as (typeof BREACH_TIERS)[number]);
  if (breach !== null && (named !== undefined || dungeon !== null || run === undefined)) return null;
  return { id, seas, dungeon, run: run ?? null, playlist, guild: guild ?? null, breach };
}

// A run's instance is drawn as the server's Find a Company draws one, and a run started at sea read, by one rule; a
// passage zone's room is named, and a full one's refusal said, as the servers name and say them.
export {
  PASSAGE_COPIES,
  PASSAGE_FULL,
  passageRoom,
  passageRoomName,
  runInstance,
  startedAtSea,
} from '../../../server/roomNames.ts';
export { NO_WAY_HERE } from '../../../server/arrival.ts';

/** A run's room: the dungeon's room's name, then its instance. */
export function runOf(base: string, instance: string): string {
  return `${base}--run-${instance}`;
}

/** The run of `base` a company member is in, of the places the company's members play in; null for none. */
export function sharedRun(base: string, places: readonly (string | null)[]): string | null {
  const ofBase = (place: string | null): place is string =>
    place !== null && place.startsWith(`${base}--run-`) && /^[a-z0-9]{8}$/.test(place.slice(`${base}--run-`.length));
  return places.find(ofBase) ?? null;
}

/** Where the page's company's members play, from a fresh Roster: none alone, offline, or when the accounts do not
 *  answer. */
export async function companyPlaces(link: AccountLink | null): Promise<string[]> {
  const roster = await link?.roster().catch(() => null);
  if (!roster || typeof roster === 'string') return [];
  return (roster.company?.members ?? []).flatMap((member) => (member.place === null ? [] : [member.place]));
}
