// Who a ship's people are, dressed from the rules' roster: a captain's hands are its faction's deck types for its rank,
// the crew boarders meet on its deck (crates/foes/src/crews.rs `deck_crew`), and its captain wears the faction's own
// captain's look; a player's Sloop and a merchantman carry plain hands and a plainly dressed master. Everyone aboard a
// ship that is only sailing keeps their weapons sheathed.
import { type Dress, plainDress } from '../player/dressing.ts';
import { foeDress } from '../player/foeDress.ts';
import type { FoeType } from '../rules/roster.ts';
import { HAND_LOOKS } from './crew.ts';

/** A ship's people: the one at its wheel (none for a faction with no deck) and its hands' dresses, worn in turn. */
export interface Company {
  readonly captain: Dress | null;
  readonly hands: readonly Dress[];
}

/** The roster's roles and ranks by number (crates/foes/src/roles.rs, ranks.rs). */
const BRUTE = 3;
const CAPTAIN = 5;
const [MINOR, MAJOR, ELITE, MINIBOSS, BOSS] = [1, 2, 3, 4, 5] as const;

/** A faction's deck types by what each is aboard: its plain hands in the roster's order (its skirmisher, its swordsman,
 *  its shot), its heavy, its mate and its Boss, if any; none for a faction with no deck. */
interface FactionDeck {
  readonly plain: readonly FoeType[];
  readonly heavy: FoeType | null;
  readonly mate: FoeType | null;
  readonly boss: FoeType | null;
}

function deckOf(roster: readonly FoeType[], faction: number): FactionDeck | null {
  const deck = roster.filter((type) => type.faction === faction && type.domain === 'deck');
  const plain = deck.filter((type) => type.ranks.includes(MINOR));
  if (faction <= 0 || plain.length === 0) return null;
  return {
    plain,
    heavy: deck.find((type) => type.role === BRUTE) ?? null,
    mate: deck.find((type) => type.role === CAPTAIN && type.ranks.includes(MINIBOSS)) ?? null,
    boss: deck.find((type) => type.ranks.includes(BOSS)) ?? null,
  };
}

/** The deck crew of a captain of `faction` at `rank`, as its boarders meet it: its lead first where it has one, then
 *  its plain hands in turn. A Minor's three hands; a Major's heavy and three; an Elite's heavy and four; a Miniboss's
 *  mate and five; a Boss's own Boss and six. None for a faction with no deck, or a Boss with no Boss of its own. */
export function deckCrew(roster: readonly FoeType[], faction: number, rank: number): FoeType[] {
  const deck = deckOf(roster, faction);
  if (!deck) return [];
  const lead =
    rank === MAJOR || rank === ELITE ? deck.heavy : rank === MINIBOSS ? deck.mate : rank >= BOSS ? deck.boss : null;
  if (rank >= BOSS && !lead) return [];
  const hands = rank <= MAJOR ? 3 : rank === ELITE ? 4 : rank === MINIBOSS ? 5 : 6;
  const plain = Array.from({ length: hands }, (_unused, nth) => deck.plain[nth % deck.plain.length]);
  return [lead, ...plain].filter((type): type is FoeType => !!type);
}

/** The type a captain of `faction` at `rank` stands at the wheel as: a Boss its faction's own Boss (Captain Brannoc
 *  Thule for the Grey Tithe), every other rank, and a Boss whose faction has none, its faction's mate (the
 *  Tithe-Mate); none for a faction with no deck. */
export function captainType(roster: readonly FoeType[], faction: number, rank: number): FoeType | null {
  const deck = deckOf(roster, faction);
  return (rank >= BOSS ? deck?.boss : null) ?? deck?.mate ?? null;
}

/** A type's dress with its weapons sheathed. */
function sheathed(type: FoeType): Dress | null {
  const dress = foeDress(type);
  return dress && { ...dress, outfit: { ...dress.outfit, drawn: false } };
}

/** The plain master at a player's or a merchantman's wheel, dressed as the player's own helmsman. */
const MASTER = plainDress('human', 0.55);
/** Plain hands, as the player's own stand-ins look. */
const PLAIN_HANDS = HAND_LOOKS.map(([race, tone]) => plainDress(race, tone));

/** The people of a ship of `faction` (0 a player's or a merchantman's) at `rank`: a captain's at its wheel in its
 *  captain's look and its hands its deck crew's other members (cut to the plain hands where it has no other), each
 *  in its type's dress; a faction with no deck, plain. */
export function companyOf(roster: readonly FoeType[], faction: number, rank: number): Company {
  const deck = deckOf(roster, faction);
  const captain = captainType(roster, faction, rank);
  if (!deck || !captain) return { captain: MASTER, hands: PLAIN_HANDS };
  const crew = deckCrew(roster, faction, rank).filter((type) => type !== captain);
  const hands = (crew.length > 0 ? crew : deck.plain).flatMap((type) => sheathed(type) ?? []);
  return { captain: sheathed(captain), hands: hands.length > 0 ? hands : PLAIN_HANDS };
}
