// The sea's word to the player, as the page tells it (crates/room/src/harbour.rs, flotsam.rs, battle.rs): who joins
// their fight, a captain who struck they may board and the boarding, what floats gathered and what it held, washing up
// at a port city, and their ship's repair by one. The sea decides all of it; the page shows its word and sends the
// player's asks.
import type { NavalEvent } from '../network/seaFight.ts';
import type { Point2 } from '../overworld/ground.ts';
import { TOLD } from '../network/seaHarbour.ts';
import { capital } from '../player/gear.ts';
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
 *  won deck), Respawn respawns, and Escape is the game's; every other is the fight's on foot, so the sea's own (a
 *  voyage, the pace, the map) wait. Answers whether it was taken here. */
export function deckKey(
  pressed: (id: 'use' | 'respawn') => boolean,
  escape: boolean,
  sea: Parameters<typeof fightAsk>[0] | null,
  respawn: () => void,
): boolean {
  if (!sea?.boarding.onDeck || escape) return false;
  if (pressed('use')) fightAsk(sea);
  else if (pressed('respawn')) respawn();
  return true;
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
    const [code, , first = 0, second = 0, , fourth = 0] = numbers;
    if (code === TOLD.WASHED_UP) {
      const why = second === 1 ? 'Your ship went down' : 'Beaten aboard the ship';
      // An island they found is told by its number after the rest; a port city by its place among the ports.
      const isle = (numbers[4] ?? 0) > 0;
      const place = isle ? 'an island you found' : (words.ports[first] ?? 'the nearest port city');
      lines.push(`${why}: ${washedUpWords(place, isle).replace(/^You/, 'you')}`);
    } else if (code === TOLD.HELD && numbers.slice(3).every((held) => held === 0)) {
      // What a piece held the feed tells, from the gear; one that gave nothing is said here.
      lines.push(`Gathered a ${words.kinds.get(first) ?? 'crate'}: nothing you had room for.`);
    } else if (code === TOLD.JOINED) {
      lines.push(first > 0 ? `Player ${first} joined the fight.` : `The ${shipName(second, fourth)} joined the fight.`);
    }
  }
  return lines;
}

/** The sea's rules SeaWord reads: its rules' facts and the port cities' roadsteads. */
export type SeaWordFacts = SeaFacts & { readonly roadsteads: readonly Point2[] };

/** A repair as a port's card and Manage offer it: its price in Aurem, and why it cannot be had now, if it cannot. */
export interface RepairOffer {
  readonly price: number;
  readonly why: string | null;
}

/** A ship's shares of hull, canvas and men. */
type Shares = { readonly hull: number; readonly sail: number; readonly crew: number };

/** What making a ship whole costs, as the room charges it (crates/room/src/harbour.rs `repair_price`): `perPercent`
 *  Aurem for each percent missing of hull, canvas and men added, a part of a percent counted whole. */
export function repairPrice(kept: Shares, perPercent: number): number {
  const missing = [kept.hull, kept.sail, kept.crew].reduce(
    (sum, share) => sum + 1 - Math.min(Math.max(share, 0), 1),
    0,
  );
  // A share read back from the character's ten-thousandths lands a hair past its percent, never a whole millionth.
  return Math.max(0, Math.ceil(missing * 100 - 1e-6)) * perPercent;
}

/** The repair offered a ship with `kept` hurts (none out of the sea room) to a player holding `aurem`. */
export function repairOffer(kept: Shares | null, aurem: number, perPercent: number): RepairOffer {
  if (!kept) return { price: 0, why: 'Repairs are made at sea, by a port city.' };
  const price = repairPrice(kept, perPercent);
  if (price === 0) return { price, why: 'The ship is whole.' };
  return { price, why: aurem < price ? `You hold ${aurem} Aurem of the ${price} it costs.` : null };
}

/** Where a port's repair is had and what it costs now: within `reachM` of one of the port cities' `roadsteads`. */
export interface PortRepairs {
  readonly offer: RepairOffer;
  readonly reachM: number;
  readonly roadsteads: readonly Point2[];
}

/** The sea's word to the player, frame by frame. */
export class SeaWord {
  /** Each piece of what floats laid for the player, by its number: what it looks like. */
  private readonly kinds = new Map<number, string>();
  private readonly ports: readonly PortCity[];
  private readonly facts: SeaWordFacts;
  /** The port city the player washed up at, by the sea's number, until they walk ashore there; or the found island
   *  they washed up on, by its number. */
  private washed: number | null = null;
  private washedOn: number | null = null;
  private said: { readonly line: string; readonly at: number }[] = [];

  /** `ports` the port cities in the sea's order; `facts` the sea's rules as its waters' table gives them. */
  constructor(ports: readonly PortCity[], facts: SeaWordFacts) {
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

  /** The repair offered from the room's word on the ship's kept hurts (none out of the sea room) to a player holding
   *  `aurem`, and where it is had. */
  repairs(room: SeaRoom | null, aurem: number): PortRepairs {
    const { repairAuremPerPercent, repairReachM, roadsteads } = this.facts;
    return { offer: repairOffer(room?.kept ?? null, aurem, repairAuremPerPercent), reachM: repairReachM, roadsteads };
  }

  /** The ship's kept hurts and repair as Manage's panel shows them, to a player holding `aurem`; none out of the sea
   *  room. */
  keptOf(room: SeaRoom | null, aurem: number): Kept | null {
    const kept = room?.kept;
    if (!kept) return null;
    const repair = this.repairWords(this.repairs(room, aurem).offer);
    return { hull: kept.hull, sail: kept.sail, crew: kept.crew, repair };
  }

  /** The repair's line for Manage's panel: its price and where it is had, or why it cannot be. */
  repairWords(offer: RepairOffer): string {
    if (offer.why) return offer.why;
    const reach = `${Number((this.facts.repairReachM / 1000).toFixed(1))} km`;
    return `Repair: ${offer.price} Aurem, lying at rest within ${reach} of a port city`;
  }
}
