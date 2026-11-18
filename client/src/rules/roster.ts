import { startRoomDoor } from '../../../server/roomDoor.ts';

/** An enemy type as the rules' roster has it: its number, the name over its bar, its faction's number and name, where
 *  it is met (land or deck), its role's number, the ranks it comes in (their numbers, its plainest first), and the
 *  forge layers in its right and left hands (null for none). */
export interface FoeType {
  readonly type: number;
  readonly name: string;
  readonly faction: number;
  readonly factionName: string;
  readonly domain: string;
  readonly role: number;
  readonly ranks: readonly number[];
  readonly right: string | null;
  readonly left: string | null;
}

/** The ranks' names by their numbers, 1 Minor to 5 Boss. */
export const RANK_NAMES: readonly string[] = ['', 'Minor', 'Major', 'Elite', 'Miniboss', 'Boss'];
export const BOSS_RANK = 5;

/** The colour a rank's bar is drawn in, for foes and ships alike: a Minor's red, a Major's orange, an Elite's, a
 *  Miniboss's and a Boss's yellow. */
export type RankBand = 'red' | 'orange' | 'yellow';
export function rankBand(rank: number): RankBand {
  return rank <= 1 ? 'red' : rank === 2 ? 'orange' : 'yellow';
}

/** The mark beside an Elite's or a Miniboss's name, which tells the two apart where their bars share a yellow; none
 *  for the other ranks. */
export function rankMark(rank: number): 'elite' | 'miniboss' | null {
  return rank === 3 ? 'elite' : rank === 4 ? 'miniboss' : null;
}

interface RosterRow {
  readonly type: number;
  readonly name: string;
  readonly faction: number;
  readonly faction_name: string;
  readonly domain: string;
  readonly role: number;
  readonly ranks: readonly number[];
  readonly right: string;
  readonly left: string;
}

/** The roster's JSON as the room door gives it (`RoomDoor.roster`), as types. */
export function rosterFrom(text: string): FoeType[] {
  return (JSON.parse(text) as readonly RosterRow[]).map((row) => ({
    type: row.type,
    name: row.name,
    faction: row.faction,
    factionName: row.faction_name,
    domain: row.domain,
    role: row.role,
    ranks: row.ranks,
    right: row.right || null,
    left: row.left || null,
  }));
}

/** The roster, read through a door of its own on the compiled `room-wasm` module: the rules' own, never a copy. */
export const rosterOf = (module: WebAssembly.Module): FoeType[] => rosterFrom(startRoomDoor(module).roster());

/** Each faction with types, as `[number, name]`, in the roster's order. */
export function factionsOf(roster: readonly FoeType[]): [number, string][] {
  const factions = new Map(roster.map((type) => [type.faction, type.factionName]));
  return [...factions];
}

/** The ranks a type may be asked for, as `[number, name]` options, its plainest first. */
export function rankChoices(type: FoeType): [string, string][] {
  return type.ranks.map((rank) => [String(rank), RANK_NAMES[rank] ?? `Rank ${rank}`]);
}
