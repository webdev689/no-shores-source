// What the sea's fights leave the player, as the page tells them (crates/room/src/harbour.rs, flotsam.rs, battle.rs):
// who joins their fight, a captain who struck they may board and the boarding, what floats gathered and what it held,
// washing up at a port city, and their ship's repair by one. The sea decides all of it; the page shows its word and
// sends the player's asks.
import type { NavalEvent } from '../network/seaFight.ts';
import type { FightView } from '../rules/fightRules.ts';
import { shipName } from '../ships/shipBars.ts';
import type { SeaRoom } from './seaRoom.ts';
import type { Kept } from './shipPanel.ts';

/** A player boards a captain who struck with their ship within this of hers, metres, both making less way than this,
 *  metres a second (crates/room/src/battle.rs `BOARD_REACH_M`, `BOARD_WAY_M_S`). */
export const BOARD_REACH_M = 30;
export const BOARD_WAY_M_S = 2;
/** The sea's own told codes (crates/room/src/harbour.rs). */
const WASHED_UP = 20;
const HELD = 21;
const JOINED = 22;
const RARITIES = ['Normal', 'Magic', 'Rare', 'Legendary', 'Atheric'] as const;
/** A captain's rank sails this hull (crates/naval/src/ranks.rs): a Minor and a Major the Sloop, an Elite the Schooner,
 *  a Miniboss the Brig and a Boss the Frigate. */
const HULL_OF_RANK = [0, 0, 0, 1, 2, 3] as const;
/** The port cities ships wash up at, as the sea keeps them (crates/world/src/ports.rs `MAIN_PORTS`). */
const MAIN_PORTS: readonly string[] = ['overlook', 'sunspire', 'rimeholt'];
/** How long the latest of these lines stands in the sea's status line, seconds. */
const LINE_S = 6;

/** A port city as the page knows it: its id (its social space is the node `<id>-social`), name and continent. */
export interface PortCity {
  readonly id: string;
  readonly name: string;
  readonly continent: string;
}

/** The port cities among `ports`, in their order, as the sea numbers them. */
export function portCities(ports: readonly PortCity[]): PortCity[] {
  return ports.filter((port) => MAIN_PORTS.includes(port.id));
}

/** Whether the player may board a captain of their fight: one who struck lies within `BOARD_REACH_M` of their ship,
 *  both making less way than `BOARD_WAY_M_S`. */
export function boardable(fight: FightView): boolean {
  const [x = 0, y = 0, , ahead = 0, abeam = 0] = fight.player.ship;
  if (fight.player.state !== 'afloat' || Math.hypot(ahead, abeam) >= BOARD_WAY_M_S) return false;
  return [fight.captain, ...(fight.others ?? [])].some((her) => {
    const [herX = 0, herY = 0, , herAhead = 0, herAbeam = 0] = her.ship;
    const near = Math.hypot(herX - x, herY - y) <= BOARD_REACH_M;
    return her.state === 'struck' && near && Math.hypot(herAhead, herAbeam) < BOARD_WAY_M_S;
  });
}

/** What E asks of the sea in a fight, and asks it: from her won deck, to go back aboard the player's own ship; off
 *  any deck, to board a captain who struck alongside; else nothing. */
export function fightAsk(sea: {
  readonly fight: { readonly view: FightView } | null;
  readonly boarding: { readonly onDeck: boolean; readonly won: boolean };
  readonly sighted: { ask(ask: 'board' | 'leave-deck'): void } | null;
}): 'board' | 'leave-deck' | null {
  const { boarding, fight } = sea;
  const ask = boarding.won ? 'leave-deck' : !boarding.onDeck && fight && boardable(fight.view) ? 'board' : null;
  if (ask) sea.sighted?.ask(ask);
  return ask;
}

/** A key pressed on her deck: E asks the sea (to leave her won deck), Enter respawns, and the menu's keys are the
 *  game's; every other is the fight's on foot, so the sea's own (a voyage, the pace, the map) wait. Answers whether
 *  it was taken here. */
export function deckKey(key: string, sea: Parameters<typeof fightAsk>[0] | null, respawn: () => void): boolean {
  if (!sea?.boarding.onDeck || key === 'm' || key === 'escape') return false;
  if (key === 'e') fightAsk(sea);
  else if (key === 'enter') respawn();
  return true;
}

/** What a gathered piece held, in words. */
function heldWords(rarity: number, ammoBox: number, ammoCrate: number): string {
  const parts = [
    rarity > 0 ? `a ${RARITIES[rarity - 1] ?? 'Normal'} Vestige` : null,
    ammoBox === 1 ? 'an Ammo box' : null,
    ammoCrate === 1 ? 'an Ammo crate' : null,
  ].filter((part) => part !== null);
  return parts.length > 0 ? parts.join(', ') : 'nothing you had room for';
}

/** The lines the sea's word since it was last taken says to the player: `kinds` each piece's look by its number,
 *  `ports` the port cities' names in the sea's order. */
export function linesOf(
  told: readonly (readonly number[])[],
  naval: readonly NavalEvent[],
  kinds: ReadonlyMap<number, string>,
  ports: readonly string[],
): string[] {
  const lines: string[] = [];
  for (const event of naval) {
    if (event.kind === 'Struck') lines.push('Her colours are down: come alongside and press E to board her.');
    if (event.kind === 'Boarding') lines.push('Boarders away: her crew stands to meet them.');
  }
  for (const numbers of told) {
    const [code, , first = 0, second = 0, third = 0, fourth = 0] = numbers;
    if (code === WASHED_UP) {
      const port = ports[first] ?? 'the nearest port city';
      const why = second === 1 ? 'Your ship went down' : 'Beaten aboard her';
      lines.push(`${why}: you washed up at ${port}, your ship moored at its roadstead.`);
    } else if (code === HELD) {
      lines.push(`Gathered a ${kinds.get(first) ?? 'crate'}: ${heldWords(second, third, fourth)}.`);
    } else if (code === JOINED) {
      const ship = shipName(second, HULL_OF_RANK[third] ?? 0);
      lines.push(first > 0 ? `Player ${first} joined the fight.` : `The ${ship} joined the fight.`);
    }
  }
  return lines;
}

/** Their ship's repair as Manage offers it: whether she is whole, and the seconds a repair under way has left. */
export interface RepairShown {
  readonly whole: boolean;
  readonly left: number;
}

/** The sea's word on what the fights leave the player, frame by frame. */
export class SeaAfter {
  /** Each piece of what floats laid for the player, by its number: what it looks like. */
  private readonly kinds = new Map<number, string>();
  private readonly ports: readonly PortCity[];
  /** The port city the player washed up at, by the sea's number, until they walk ashore there. */
  private washed: number | null = null;
  constructor(ports: readonly PortCity[]) {
    this.ports = ports;
  }

  /** The lines the room's word since the last frame says. */
  step(room: SeaRoom): string[] {
    for (const piece of room.flotsam) this.kinds.set(piece.id, piece.kind);
    const { naval, told } = room.takeTold();
    for (const event of naval) if (event.kind === 'Flotsam') this.kinds.set(event.id, event.kind_of);
    for (const numbers of told) if (numbers[0] === WASHED_UP) this.washed = numbers[2] ?? null;
    return linesOf(
      told,
      naval,
      this.kinds,
      this.ports.map((port) => port.name),
    );
  }

  /** The sea's status line at `now`: the latest line of the room's word while it stands, else `base`. */
  note(base: string, room: SeaRoom | null, now: number): string {
    const lines = room ? this.step(room) : [];
    const latest = lines.at(-1);
    if (latest) this.latest = { line: latest, at: now };
    return this.latest && now - this.latest.at < LINE_S ? this.latest.line : base;
  }

  private latest: { readonly line: string; readonly at: number } | null = null;

  /** Once the landmass holding the port city she washed up at is open, its social space to walk into, standing there
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
    const words = `Washed up at ${port.name}. Your ship lies at its moorings.`;
    return { node, washUp: { kind: 'wash-up', node: node.id, words } };
  }

  /** Her repair as Manage offers it, from the room's word on her kept hurts. */
  static repairOf(room: SeaRoom): RepairShown | null {
    const kept = room.kept;
    if (!kept) return null;
    return { whole: kept.hull >= 1 && kept.sail >= 1 && kept.crew >= 1, left: kept.repairLeft };
  }

  /** Her kept hurts and repair as Manage's panel shows them; none out of the sea room. */
  static keptOf(room: SeaRoom | null): Kept | null {
    const kept = room?.kept;
    if (!kept || !room) return null;
    return { hull: kept.hull, sail: kept.sail, crew: kept.crew, repair: SeaAfter.repairWords(SeaAfter.repairOf(room)) };
  }

  /** The repair's line for Manage's panel. */
  static repairWords(repair: RepairShown | null): string {
    if (!repair) return 'Repair her: once the sea has her';
    if (repair.left > 0) return `Repairing her: ${Math.ceil(repair.left)} s left`;
    return repair.whole ? 'She is whole' : 'Repair her: free, within 3 km of a port city’s roadstead, at rest';
  }
}
