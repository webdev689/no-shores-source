// The sea's word to the player, as the page tells it (crates/room/src/harbour.rs, flotsam.rs, battle.rs): who joins
// their fight, a captain who struck they may board and the boarding, what floats gathered and what it held, washing up
// at a port city, and their ship's repair by one. The sea decides all of it; the page shows its word and sends the
// player's asks.
import type { NavalEvent } from '../network/seaFight.ts';
import { TOLD } from '../network/seaHarbour.ts';
import { RARITIES, capital } from '../player/gear.ts';
import type { SeaFacts } from '../rules/watersRules.ts';
import { shipName } from '../ships/shipBars.ts';
import { boundWord } from './controls.ts';
import type { SeaRoom } from './seaRoom.ts';
import type { Kept } from './shipPanel.ts';
import type { PortCity } from './worldData.ts';

/** How long each of these lines stands as a notice, seconds. */
const LINE_S = 6;
/** The flotsam pieces whose kinds are kept, the latest seen: far more than a sea's room holds at once. */
export const KINDS_KEPT = 512;

/** What E asks of the sea in a fight, and asks it: from a won deck, to go back aboard the player's own ship; off
 *  any deck, to board a captain who struck alongside, as the sea says they may; else nothing. */
export function fightAsk(sea: {
  readonly boarding: { readonly onDeck: boolean; readonly won: boolean };
  readonly sighted: { readonly mayBoard: boolean; ask(ask: 'board' | 'leave-deck'): void } | null;
}): 'board' | 'leave-deck' | null {
  const { boarding, sighted } = sea;
  const ask = boarding.won ? 'leave-deck' : !boarding.onDeck && sighted?.mayBoard ? 'board' : null;
  if (ask) sighted?.ask(ask);
  return ask;
}

/** A control pressed on a struck ship's deck (`pressed` says which; `escape` for Escape): Use asks the sea (to leave the
 *  won deck), Respawn respawns, and the menu and Escape are the game's; every other is the fight's on foot, so the
 *  sea's own (a voyage, the pace, the map) wait. Answers whether it was taken here. */
export function deckKey(
  pressed: (id: 'use' | 'respawn' | 'menu') => boolean,
  escape: boolean,
  sea: Parameters<typeof fightAsk>[0] | null,
  respawn: () => void,
): boolean {
  if (!sea?.boarding.onDeck || pressed('menu') || escape) return false;
  if (pressed('use')) fightAsk(sea);
  else if (pressed('respawn')) respawn();
  return true;
}

/** A word with its article: "an" before a vowel. */
const withArticle = (word: string): string => `${/^[AEIOU]/i.test(word) ? 'an' : 'a'} ${word}`;

/** What a gathered piece held, in words. */
function heldWords(rarity: number, ammoBox: number, ammoCrate: number): string {
  const parts = [
    rarity > 0 ? withArticle(`${RARITIES[rarity - 1]?.name ?? 'Normal'} Vestige`) : null,
    ammoBox === 1 ? 'an Ammo box' : null,
    ammoCrate === 1 ? 'an Ammo crate' : null,
  ].filter((part) => part !== null);
  return parts.length > 0 ? parts.join(', ') : 'nothing you had room for';
}

/** Washing up at `port`, or at an island the player found (`isle`), said one way wherever it is said. */
export function washedUpWords(port: string, isle = false): string {
  if (isle) return `You washed up at ${port}; your ship lies off it, unrepaired.`;
  return `You washed up at ${port}; your ship lies at its roadstead.`;
}

/** What the lines are told with: each piece's look by its number, the port cities' names in the sea's order, and a
 *  ship of the fight's name by the number its events give it (null for one not in it). */
export interface WordsOf {
  readonly kinds: ReadonlyMap<number, string>;
  readonly ports: readonly string[];
  readonly nameOf: (ship: number) => string | null;
}

/** The lines the sea's word since it was last taken says to the player. */
export function linesOf(told: readonly (readonly number[])[], naval: readonly NavalEvent[], words: WordsOf): string[] {
  const lines: string[] = [];
  const whose = (ship: number) => {
    const name = words.nameOf(ship);
    return name ? `the ${name}’s` : 'its';
  };
  for (const event of naval) {
    if (event.kind === 'Struck')
      lines.push(
        capital(`${whose(event.ship)} colours are down: come alongside and press ${boundWord('use')} to board it.`),
      );
    if (event.kind === 'Boarding') lines.push(`Boarders away: ${whose(event.ship)} crew stands to meet them.`);
  }
  for (const numbers of told) {
    const [code, , first = 0, second = 0, third = 0, fourth = 0] = numbers;
    if (code === TOLD.WASHED_UP) {
      const why = second === 1 ? 'Your ship went down' : 'Beaten aboard the ship';
      // An island they found is told by its number after the rest; a port city by its place among the ports.
      const isle = (numbers[4] ?? 0) > 0;
      const place = isle ? 'an island you found' : (words.ports[first] ?? 'the nearest port city');
      lines.push(`${why}: ${washedUpWords(place, isle).replace(/^You/, 'you')}`);
    } else if (code === TOLD.HELD) {
      lines.push(`Gathered a ${words.kinds.get(first) ?? 'crate'}: ${heldWords(second, third, fourth)}.`);
    } else if (code === TOLD.JOINED) {
      lines.push(first > 0 ? `Player ${first} joined the fight.` : `The ${shipName(second, fourth)} joined the fight.`);
    }
  }
  return lines;
}

/** Their ship's repair as Manage offers it: whether it is whole, and the seconds a repair under way has left. */
export interface RepairShown {
  readonly whole: boolean;
  readonly left: number;
}

/** The sea's word to the player, frame by frame. */
export class SeaWord {
  /** Each piece of what floats laid for the player, by its number: what it looks like. */
  private readonly kinds = new Map<number, string>();
  private readonly ports: readonly PortCity[];
  private readonly facts: SeaFacts;
  /** The port city the player washed up at, by the sea's number, until they walk ashore there; or the found island
   *  they washed up on, by its number. */
  private washed: number | null = null;
  private washedOn: number | null = null;
  private said: { readonly line: string; readonly at: number }[] = [];

  /** `ports` the port cities in the sea's order; `facts` the sea's rules as its waters' table gives them. */
  constructor(ports: readonly PortCity[], facts: SeaFacts) {
    [this.ports, this.facts] = [ports, facts];
  }

  /** The lines the room's word since the last frame says. */
  step(room: SeaRoom): string[] {
    for (const piece of room.flotsam) this.kinds.set(piece.id, piece.kind);
    const { naval, told } = room.takeTold();
    for (const event of naval) if (event.kind === 'Flotsam') this.kinds.set(event.id, event.kind_of);
    // A piece's kind is kept past its gathering, for the word on it that comes after; only the latest are kept.
    for (const oldest of this.kinds.keys()) {
      if (this.kinds.size <= KINDS_KEPT) break;
      this.kinds.delete(oldest);
    }
    for (const numbers of told) {
      if (numbers[0] !== TOLD.WASHED_UP) continue;
      const isle = numbers[4] ?? 0;
      [this.washed, this.washedOn] = isle > 0 ? [null, isle] : [numbers[2] ?? null, null];
    }
    const ports = this.ports.map((port) => port.name);
    return linesOf(told, naval, { kinds: this.kinds, ports, nameOf: (ship) => room.shipNamed(ship) });
  }

  /** The notices of the room's word standing at `now`, the newest last: each line for `LINE_S`. */
  notices(room: SeaRoom | null, now: number): string[] {
    const fresh = (room ? this.step(room) : []).map((line) => ({ line, at: now }));
    // A line said again stands newest, once, as the fight's messages keep theirs.
    const again = new Set(fresh.map((each) => each.line));
    this.said = [...this.said.filter((each) => !again.has(each.line)), ...fresh].filter(
      (each) => now - each.at < LINE_S,
    );
    return this.said.map((each) => each.line);
  }

  /** Once the landmass holding the port city the player washed up at is open, its social space to walk into, standing there
   *  as on arriving, and the veil's words saying why; taken once. */
  ashore<Node extends { readonly id: string }>(landmass: {
    readonly id: string;
    readonly nodes: readonly Node[];
  }): { readonly node: Node; readonly washUp: { kind: 'wash-up'; node: string; words: string } } | null {
    const port = this.washed === null ? undefined : this.ports[this.washed];
    if (!port || port.continent !== landmass.id) return null;
    const node = landmass.nodes.find((each) => each.id === `${port.id}-social`);
    if (!node) return null;
    this.washed = null;
    return { node, washUp: { kind: 'wash-up', node: node.id, words: washedUpWords(port.name) } };
  }

  /** The found island the player washed up on, by its number, taken once. */
  takeWashedIsle(): number | null {
    const isle = this.washedOn;
    this.washedOn = null;
    return isle;
  }

  /** The found island the room last washed the player up on, until it is taken. */
  get washedIsle(): number | null {
    return this.washedOn;
  }

  /** The ship's repair as Manage offers it, from the room's word on its kept hurts. */
  static repairOf(room: SeaRoom): RepairShown | null {
    const kept = room.kept;
    if (!kept) return null;
    return { whole: kept.hull >= 1 && kept.sail >= 1 && kept.crew >= 1, left: kept.repairLeft };
  }

  /** The ship's kept hurts and repair as Manage's panel shows them; none out of the sea room. */
  keptOf(room: SeaRoom | null): Kept | null {
    const kept = room?.kept;
    if (!kept || !room) return null;
    return { hull: kept.hull, sail: kept.sail, crew: kept.crew, repair: this.repairWords(SeaWord.repairOf(room)) };
  }

  /** The repair's line for Manage's panel. */
  repairWords(repair: RepairShown | null): string {
    if (!repair) return 'Repairs are made at sea, by a port city';
    if (repair.left > 0) return `Repairing it: ${Math.ceil(repair.left)} s left`;
    const reach = `${Number((this.facts.repairReachM / 1000).toFixed(1))} km`;
    return repair.whole ? 'The ship is whole' : `Repair: free, lying at rest within ${reach} of a port city`;
  }
}
