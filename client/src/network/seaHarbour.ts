// What the sea's snapshot carries after its fights (crates/protocol/src/sea_snapshot.rs): each piece of what floats
// kept for a player, each player's ship's kept hurts with its repair's time left, what each player is told this tick
// beside their fight's view, each deck boarded with its deck room's own snapshot, the islands each player sees or
// has found, and with the chart, every hostile ship and standing island in the water the player's ship lies in.
import type { Snapshot } from '../../../generated/messages/ts/overlook/wire.ts';
import { PIECES } from './seaFight.ts';

/** The sea's own told words, by the code each line's first number holds (crates/room/src/harbour.rs): washed up at a
 *  port city, what a gathered piece held, who joined the fight, its ship given back where the room kept it, and how a
 *  travel by the held map went (crates/room/src/sea_travel.rs). */
export const TOLD = { WASHED_UP: 20, HELD: 21, JOINED: 22, MOORED: 23, TRAVELLED: 24 } as const;

/** A piece of what floats for one player: theirs, its number, where it floats and what it looks like. */
export interface SeenFlotsam {
  readonly player: number;
  readonly id: number;
  readonly at: readonly [number, number];
  readonly kind: (typeof PIECES)[number];
}

/** A player's ship's hurts as the sea keeps them: the shares of hull, canvas and men it has, and the seconds its
 *  repair has left (0 with none under way). */
export interface SeenKept {
  readonly player: number;
  readonly hull: number;
  readonly sail: number;
  readonly crew: number;
  readonly repairLeft: number;
}

/** A deck boarded: each boarder's number at sea with theirs on its deck, its hull, its deck room's snapshot's bytes (a
 *  room on land's, in its own frame), and the sea's ticks its won deck holds its boarders yet (null while its crew
 *  still fights). */
export interface SeenDeck {
  readonly aboard: readonly (readonly [number, number])[];
  readonly hull: number;
  readonly snapshot: Uint8Array;
  readonly holdLeft: number | null;
}

/** The isles' kinds by their number on the wire (isle crate's `Kind::number`). */
export const ISLE_KINDS = ['cove', 'ruin', 'quarry'] as const;

/** A sea island the player sees from their ship or has found: its number, its seed as a decimal (64 bits), where its
 *  middle is (world metres), its kind, the index of its water's continent in the layout, and whether they found it. */
export interface SeenIsle {
  readonly id: number;
  readonly seed: string;
  readonly at: readonly [number, number];
  readonly kind: (typeof ISLE_KINDS)[number];
  readonly continent: number;
  readonly found: boolean;
}

/** A friendly ship of the traffic the room keeps at sea, off its route: its traffic id, where it is, its heading
 *  (radians clockwise from north) and its hull (0 the Sloop to 3 the Frigate). */
export interface SeenFriendly {
  readonly traffic: number;
  readonly x: number;
  readonly y: number;
  readonly heading: number;
  readonly hull: number;
}

/** What a mark on the sea's chart is, by its number on the wire: a hostile ship, or an island of its kind. */
export const CHART_MARK_KINDS = ['hostile', ...ISLE_KINDS] as const;

/** A hostile ship or a standing island in the water the player's ship lies in: where it lies (world metres), and
 *  what it is. */
export interface SeenMark {
  readonly at: readonly [number, number];
  readonly kind: (typeof CHART_MARK_KINDS)[number];
}

/** A ship on the sea's chart: its player's number, where it lies (world metres), and its captain's name. */
export interface SeenCharted {
  readonly player: number;
  readonly at: readonly [number, number];
  readonly name: string;
}

export interface HarbourPart {
  readonly flotsam: readonly SeenFlotsam[];
  readonly kept: readonly SeenKept[];
  /** What each player is told this tick, in the naval crate's numbers or the sea's own (crates/room/src/harbour.rs). */
  readonly told: readonly { readonly player: number; readonly numbers: readonly number[] }[];
  readonly decks: readonly SeenDeck[];
  readonly islands: readonly SeenIsle[];
  /** Each traffic id the room has taken off its route, which the page draws no more, and those it keeps at sea. */
  readonly taken: readonly number[];
  readonly friendlies: readonly SeenFriendly[];
  /** Every ship in the sea, the player's own among them, about once a second: empty in the snapshots between. */
  readonly charted: readonly SeenCharted[];
  /** With the chart, every hostile ship and standing island in the water the player's ship lies in. */
  readonly chartMarks: readonly SeenMark[];
}

/** The sea's part of a snapshot: empty from any other room. */
export function harbourOf(snapshot: Snapshot): HarbourPart {
  const flotsam = Array.from({ length: snapshot.flotsamLength() }, (unused, index): SeenFlotsam => {
    const piece = snapshot.flotsam(index);
    if (!piece) throw new Error(`snapshot flotsam ${index} does not read`);
    const kind = PIECES[piece.kind()];
    if (!kind) throw new Error(`flotsam ${index} is of no kind`);
    return { player: piece.player(), id: piece.id(), at: [piece.x(), piece.y()], kind };
  });
  const kept = Array.from({ length: snapshot.keptLength() }, (unused, index): SeenKept => {
    const held = snapshot.kept(index);
    if (!held) throw new Error(`snapshot kept ${index} does not read`);
    const [hull, sail, crew, repairLeft] = [held.hull(), held.sail(), held.crew(), held.repairLeft()];
    return { player: held.player(), hull, sail, crew, repairLeft };
  });
  const told = Array.from({ length: snapshot.toldLength() }, (unused, index) => {
    const each = snapshot.told(index);
    if (!each) throw new Error(`snapshot told ${index} does not read`);
    return { player: each.player(), numbers: Array.from(each.numbersArray() ?? []) };
  });
  const decks = Array.from({ length: snapshot.decksLength() }, (unused, index): SeenDeck => {
    const deck = snapshot.decks(index);
    if (!deck) throw new Error(`snapshot deck ${index} does not read`);
    const [players, boarders] = [Array.from(deck.playersArray() ?? []), Array.from(deck.boardersArray() ?? [])];
    const aboard = players.map((player, index) => [player, boarders[index] ?? 0] as const);
    const holdLeft = deck.holdLeft() < 0 ? null : deck.holdLeft();
    return { aboard, hull: deck.hull(), snapshot: deck.snapshotArray() ?? new Uint8Array(), holdLeft };
  });
  const islands = Array.from({ length: snapshot.islandsLength() }, (unused, index): SeenIsle => {
    const isle = snapshot.islands(index);
    const kind = isle && ISLE_KINDS[isle.kind()];
    if (!isle || !kind) throw new Error(`snapshot island ${index} does not read`);
    const middle = [isle.x(), isle.y()] as const;
    return {
      id: isle.id(),
      seed: isle.seed().toString(),
      at: middle,
      kind,
      continent: isle.continent(),
      found: isle.found(),
    };
  });
  const taken = Array.from({ length: snapshot.takenLength() }, (unused, index) => Number(snapshot.taken(index) ?? 0));
  const friendlies = Array.from({ length: snapshot.friendliesLength() }, (unused, index): SeenFriendly => {
    const friend = snapshot.friendlies(index);
    if (!friend) throw new Error(`snapshot friendly ${index} does not read`);
    return {
      traffic: Number(friend.traffic()),
      x: friend.x(),
      y: friend.y(),
      heading: friend.heading(),
      hull: friend.hull(),
    };
  });
  const charted = Array.from({ length: snapshot.chartedLength() }, (unused, index): SeenCharted => {
    const ship = snapshot.charted(index);
    if (!ship) throw new Error(`snapshot charted ${index} does not read`);
    return { player: ship.player(), at: [ship.x(), ship.y()], name: ship.name() ?? '' };
  });
  const chartMarks = Array.from({ length: snapshot.chartMarksLength() }, (unused, index): SeenMark => {
    const mark = snapshot.chartMarks(index);
    const kind = mark && CHART_MARK_KINDS[mark.kind()];
    if (!mark || !kind) throw new Error(`snapshot chart mark ${index} does not read`);
    return { at: [mark.x(), mark.y()], kind };
  });
  return { flotsam, kept, told, decks, islands, taken, friendlies, charted, chartMarks };
}
