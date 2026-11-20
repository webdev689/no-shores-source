// What the sea's snapshot carries after its fights (crates/protocol/src/sea_snapshot.rs): each piece of what floats
// kept for a player, each player's ship's kept hurts with her repair's time left, what each player is told this tick
// beside their fight's view, each deck boarded with her deck room's own snapshot, and the islands each player sees or
// has found.
import type { Snapshot } from '../../../generated/messages/ts/overlook/wire.ts';
import { PIECES } from './seaFight.ts';

/** A piece of what floats for one player: theirs, its number, where it floats and what it looks like. */
export interface SeenFlotsam {
  readonly player: number;
  readonly id: number;
  readonly at: readonly [number, number];
  readonly kind: (typeof PIECES)[number];
}

/** A player's ship's hurts as the sea keeps them: the shares of hull, canvas and men she has, and the seconds her
 *  repair has left (0 with none under way). */
export interface SeenKept {
  readonly player: number;
  readonly hull: number;
  readonly sail: number;
  readonly crew: number;
  readonly repairLeft: number;
}

/** A deck boarded: each boarder's number at sea with theirs on her deck, her hull, her deck room's snapshot's bytes (a
 *  room on land's, in her own frame), and the sea's ticks her won deck holds her boarders yet (null while her crew
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

export interface HarbourPart {
  readonly flotsam: readonly SeenFlotsam[];
  readonly kept: readonly SeenKept[];
  /** What each player is told this tick, in the naval crate's numbers or the sea's own (crates/room/src/harbour.rs). */
  readonly told: readonly { readonly player: number; readonly numbers: readonly number[] }[];
  readonly decks: readonly SeenDeck[];
  readonly islands: readonly SeenIsle[];
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
  return { flotsam, kept, told, decks, islands };
}
