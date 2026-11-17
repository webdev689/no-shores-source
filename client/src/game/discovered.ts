// What the player has discovered, as the game marks it and this browser keeps it: the held map's fog of war.
import type { MapPlace } from '../heldmap/heldMap.ts';
import type { Point2 } from '../overworld/ground.ts';
import { chartAround, type Discovery, discoveryText, readDiscovery, sightIslands } from '../overworld/discovery.ts';
import { PORT_SEEN_M } from './seaLaw.ts';
import type { WorldData } from './worldData.ts';

/** Where this browser keeps what the player has discovered, and how often it is kept once it changes, seconds. */
const DISCOVERY_KEY = 'overlook-discovery';
const KEEP_EVERY_S = 5;

export class Discovered {
  readonly discovery: Discovery;
  private readonly world: WorldData;
  private changed = false;

  /** What this browser kept, kept again every few seconds once it changes and as the page goes. */
  constructor(world: WorldData) {
    this.world = world;
    this.discovery = kept();
    setInterval(() => this.keep(), KEEP_EVERY_S * 1000);
    addEventListener('pagehide', () => this.keep());
  }

  /** The player arrives knowing the island they stand on, its port, the place and the waters round its city. */
  arrived(continent: string, node: string): void {
    const { islands, ports } = this.discovery;
    this.mark(islands, continent);
    this.nodes([node]);
    const city = this.world.cities.find((each) => each.continent === continent);
    if (!city) return;
    this.mark(ports, city.id);
    this.changed ||= chartAround(this.discovery, city.centre);
  }

  /** What a lookout sees from the ship: the sea round it, any island's coast, a port's icon. */
  lookout(ship: Point2): void {
    this.changed ||= chartAround(this.discovery, ship);
    this.changed ||= sightIslands(this.discovery, ship, this.world.continents).length > 0;
    for (const city of this.world.cities)
      if (Math.hypot(city.centre[0] - ship[0], city.centre[1] - ship[1]) <= PORT_SEEN_M)
        this.mark(this.discovery.ports, city.id);
  }

  /** Nodes seen over an island's side, or landed at. */
  nodes(ids: readonly string[]): void {
    for (const id of ids) this.mark(this.discovery.nodes, id);
  }

  /** The islands discovered, a bit each by their place among the layout's continents. */
  get knownIslands(): number {
    return this.world.continents.reduce(
      (bits, continent, index) => (this.discovery.islands.has(continent.id) ? bits | (1 << index) : bits),
      0,
    );
  }

  /** What the held map shows of the places discovered: each port, at its city, and the nodes seen or landed at. */
  get places(): MapPlace[] {
    const { ports, nodes } = this.discovery;
    return [
      ...this.world.cities
        .filter((city) => ports.has(city.id))
        .map((city) => ({ id: `${city.id}-port`, name: city.name, kind: 'port', at: city.centre })),
      ...this.world.nodes
        .filter((node) => nodes.has(node.id))
        .map((node) => ({ id: node.id, name: node.name, kind: node.kind, at: node.centre })),
    ];
  }

  private mark(known: Set<string>, id: string): void {
    if (known.has(id)) return;
    known.add(id);
    this.changed = true;
  }

  private keep(): void {
    if (!this.changed) return;
    this.changed = false;
    try {
      localStorage.setItem(DISCOVERY_KEY, discoveryText(this.discovery));
    } catch {
      // A browser that keeps nothing still plays; the map forgets on the next visit.
    }
  }
}

/** What the player has discovered, as this browser kept it; nothing where it keeps nothing. */
function kept(): Discovery {
  try {
    return readDiscovery(localStorage.getItem(DISCOVERY_KEY));
  } catch {
    return readDiscovery(null);
  }
}
