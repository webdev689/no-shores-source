// What the player has discovered, as the game marks it and this browser keeps it: the held map's fog of war.
import type { MapPlace } from '../heldmap/heldMap.ts';
import type { Point2 } from '../overworld/ground.ts';
import { chartAround, type Discovery, discoveryText, readDiscovery, sightIslands } from '../overworld/discovery.ts';
import { coastPoint } from '../overworld/islandView.ts';
import { PORT_SEEN_M } from './seaLaw.ts';
import type { WorldData } from './worldData.ts';

/** Where this browser keeps what the player has discovered, and how often it is kept once it changes, seconds: the
 *  whole chart is written each time, so not often, and as the page is hidden or goes. */
const DISCOVERY_KEY = 'noshores-discovery';
const KEEP_EVERY_S = 30;

/** What the player discovers as they play: kept by `keptDiscovered`, read by the held map. */
export class Discovered {
  readonly discovery: Discovery;
  /** Whether anything was discovered since it was last kept. */
  changed = false;
  private readonly world: WorldData;
  private readonly sails = new Map<string, Point2>();

  constructor(world: WorldData, discovery: Discovery) {
    this.world = world;
    this.discovery = discovery;
  }

  /** The player arrives knowing the island they stand on, its port, the place and the waters round its city. */
  arrived(continent: string, node: string): void {
    this.mark(this.discovery.islands, continent);
    this.nodes([node]);
    const city = this.world.cities.find((each) => each.continent === continent);
    if (!city) return;
    this.mark(this.discovery.ports, city.id);
    const charted = chartAround(this.discovery, city.centre);
    this.changed ||= charted;
  }

  /** What a lookout sees from the ship: the sea round it, any island's coast, a port's icon. */
  lookout(ship: Point2): void {
    // Each is worked out before it is folded in, so a change already made never skips it.
    const charted = chartAround(this.discovery, ship);
    const sighted = sightIslands(this.discovery, ship, this.world.continents).length > 0;
    this.changed ||= charted || sighted;
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

  /** What the held map shows of the places discovered: each port, at its city, and the nodes seen or landed at, a
   *  ship sailing for a node to its island's coast nearest it. */
  get places(): MapPlace[] {
    const { ports, nodes } = this.discovery;
    return [
      ...this.world.cities
        .filter((city) => ports.has(city.id))
        .map((city) => ({ id: `${city.id}-port`, name: city.name, kind: 'port', at: city.centre, sail: city.centre })),
      ...this.world.nodes
        .filter((node) => nodes.has(node.id))
        .map((node) => ({ id: node.id, name: node.name, kind: node.kind, at: node.centre, sail: this.sailFor(node) })),
    ];
  }

  /** Where a ship sails for a node: the nearest point of its island's coast, worked out once. */
  private sailFor(node: { readonly id: string; readonly continent: string; readonly centre: Point2 }): Point2 {
    let sail = this.sails.get(node.id);
    if (!sail) {
      const outline = this.world.continents.find((continent) => continent.id === node.continent)?.outline;
      sail = outline?.length ? coastPoint(node.centre, outline) : node.centre;
      this.sails.set(node.id, sail);
    }
    return sail;
  }

  private mark(known: Set<string>, id: string): void {
    if (known.has(id)) return;
    known.add(id);
    this.changed = true;
  }
}

/** What the player has discovered, as this browser kept it (nothing where it keeps nothing), kept again every half
 *  minute once it changes, and as the page is hidden or goes. */
export function keptDiscovered(world: WorldData): Discovered {
  let kept: Discovery;
  try {
    kept = readDiscovery(localStorage.getItem(DISCOVERY_KEY));
  } catch {
    kept = readDiscovery(null);
  }
  const discovered = new Discovered(world, kept);
  const keep = () => {
    if (!discovered.changed) return;
    discovered.changed = false;
    try {
      localStorage.setItem(DISCOVERY_KEY, discoveryText(discovered.discovery));
    } catch {
      // A browser that keeps nothing still plays; the map forgets on the next visit.
    }
  };
  setInterval(keep, KEEP_EVERY_S * 1000);
  addEventListener('pagehide', keep);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) keep();
  });
  return discovered;
}
