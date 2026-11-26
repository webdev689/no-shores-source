// The hostile ships the sea's view tells of, and the water the ship is in: a mark for each hostile ship within its own
// sight of the player's ship, by its faction's emblem, its rank's colour, its name as its plate gives it, its level and
// its distance; the words on the voyage's line when one is first sighted or the ship sails into another's hold of the
// sea; and the water's name, band and holder for the sea's status line.
import type { SeenHostile } from '../network/messages.ts';
import type { Point2 } from '../overworld/ground.ts';
import type { Mark } from '../overworld/overworldMarks.ts';
import { HOLDER_WORDS as MAP_HOLDER_WORDS } from '../heldmap/watersWash.ts';
import { emblemSvg, markPicture } from '../plus/emblems.ts';
import { rankMark } from '../rules/roster.ts';
import type { WaterHolder, WatersRules, WatersTable } from '../rules/watersRules.ts';
import { rankColour, shipName, sightedWords } from '../ships/shipBars.ts';
import { distanceText } from '../plus/compass.ts';

/** The least distance a hostile ship is sighted from, metres (crates/room/src/sighting.rs), read for a room that sends
 *  none. */
export const SIGHT_LEAST_M = 5_000;
/** A hostile ship's mark stands this far over the water, metres: over its masthead. */
const HOSTILE_RISE_M = 20;
/** Its mark's id: `hostile-` and its number in the room. */
export const HOSTILE_PREFIX = 'hostile-';

/** The distance a ship is sighted from. */
export function sightOf(hostile: Pick<SeenHostile, 'sight'>): number {
  return hostile.sight !== undefined && hostile.sight > 0 ? hostile.sight : SIGHT_LEAST_M;
}

const apart = (hostile: SeenHostile, ship: Point2) => Math.hypot(hostile.x - ship[0], hostile.y - ship[1]);

/** The hostile ships within their own sight of the player's ship at `ship`. */
export function sightedHostiles(hostiles: readonly SeenHostile[], ship: Point2): SeenHostile[] {
  return hostiles.filter((hostile) => apart(hostile, ship) <= sightOf(hostile));
}

/** Its name as its plate gives it: its faction's, on its hull. */
export function hostileName(hostile: SeenHostile): string {
  return shipName(hostile.faction, hostile.hull ?? 0);
}

/** How its mark looks: its faction's emblem, its rank's colour, and the plates' mark of a Miniboss. */
export interface HostileLook {
  readonly emblem: string | null;
  readonly colour: string;
  readonly badge: string | null;
}

export function hostileLook(hostile: SeenHostile): HostileLook {
  const mark = rankMark(hostile.rank);
  return {
    emblem: emblemSvg(hostile.faction),
    colour: rankColour(hostile.rank),
    badge: mark === 'miniboss' ? markPicture(mark).svg : null,
  };
}

/** Its mark's note: its level, where the room sends one, and its distance. */
export function hostileNote(hostile: SeenHostile, metres: number): string {
  const level = hostile.level ?? 0;
  return level > 0 ? `Level ${level} · ${distanceText(metres)}` : distanceText(metres);
}

/** Each sighted ship as a mark to lay, held at the picture's edge when off it. */
export function hostileMarks(hostiles: readonly SeenHostile[], ship: Point2): Mark[] {
  // The marks are laid as a port's are; the hostile kind is the display's own.
  return sightedHostiles(hostiles, ship).map((hostile) => ({
    id: `${HOSTILE_PREFIX}${hostile.id}`,
    kind: 'port',
    name: hostileName(hostile),
    at: [hostile.x, hostile.y, HOSTILE_RISE_M],
    edge: true,
  }));
}

/** The water the ship is in, as the page names it: its name, its holder and its band. */
export interface WaterNamed {
  readonly name: string | null;
  readonly holder: WaterHolder;
  readonly levels: readonly [number, number] | null;
}

/** The water at a point, named, from the opened waters' rules and their table; null on land. Who holds the sea there
 *  is a second search of the coasts, made only when read: the place's line reads the name alone every frame. */
export function waterNamer(rules: WatersRules, table: WatersTable): (point: Point2) => WaterNamed | null {
  return (point) => {
    const here = rules.waterAt(point);
    const water = here && table.waters[here.continent];
    if (!here || !water) return null;
    return {
      name: water.name,
      levels: water.levels,
      get holder(): WaterHolder {
        return here.holder;
      },
    };
  };
}

/** Each holder's word, as the held map's key names it. */
const HOLDER_WORDS = new Map(MAP_HOLDER_WORDS);

/** The water as the status line names it: "The Fen Deeps, levels 22-26, Grey Tithe"; home waters by their holder
 *  alone. */
export function waterWords(water: WaterNamed): string {
  const name = water.name ?? 'Open sea';
  if (water.holder === 'home') return `${name}, Overlook’s home waters`;
  const band = water.levels ? `, levels ${water.levels[0]}-${water.levels[1]}` : '';
  return `${name}${band}, ${HOLDER_WORDS.get(water.holder) ?? water.holder}`;
}

/** How long the voyage's line holds what the watch said, seconds. */
export const SAID_S = 6;

/** What the voyage's line says as the ship goes on: each hostile ship when first sighted, the nearest first, and the
 *  water when it enters another, each held `SAID_S`. */
export class SeaWatch {
  private readonly seen = new Set<number>();
  private water: string | null = null;
  private said: { readonly words: string; age: number } | null = null;

  /** Steps `seconds` on: `hostiles` round the ship at `ship`, in `water`. */
  step(seconds: number, hostiles: readonly SeenHostile[], ship: Point2, water: WaterNamed | null): void {
    if (this.said) this.said.age += seconds;
    const sighted = sightedHostiles(hostiles, ship);
    const present = new Set(hostiles.map((hostile) => hostile.id));
    for (const id of this.seen) if (!present.has(id)) this.seen.delete(id);
    const fresh = sighted.filter((hostile) => !this.seen.has(hostile.id));
    fresh.forEach((hostile) => this.seen.add(hostile.id));
    const nearest = fresh.sort((one, other) => apart(one, ship) - apart(other, ship))[0];
    const words = water && waterWords(water);
    const entered = words !== null && this.water !== null && words !== this.water;
    if (words !== null) this.water = words;
    if (nearest) this.said = { words: sightedWords(hostileName(nearest), apart(nearest, ship)), age: 0 };
    else if (entered) this.said = { words: `Entering ${words}.`, age: 0 };
  }

  /** What the line says now, or null once it has been held its while. */
  get words(): string | null {
    return this.said && this.said.age < SAID_S ? this.said.words : null;
  }

  /** The water the ship was last in, as the status line names it. */
  get waterWords(): string | null {
    return this.water;
  }
}
