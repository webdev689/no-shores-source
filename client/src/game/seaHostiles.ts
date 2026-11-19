// The hostile ships the sea's view tells of, and the water the ship is in: a mark for each hostile ship within her own
// sight of the player's ship, by her faction's emblem, her rank's colour, her name as her plate gives it, her level and
// her distance; the words on the voyage's line when one is first sighted or the ship sails into other waters; and
// the water's name, band and holder for the sea's status line.
import type { SeenPirate } from '../network/messages.ts';
import type { Point2 } from '../overworld/ground.ts';
import type { Mark } from '../overworld/overworldMarks.ts';
import { emblemUrl, markPicture } from '../plus/emblems.ts';
import { rankMark } from '../rules/roster.ts';
import type { WaterHolder, WatersRules, WatersTable } from '../rules/watersRules.ts';
import { rankColour, shipName } from '../ships/shipBars.ts';
import { distanceText } from './hudLaw.ts';

/** The least distance a hostile ship is sighted from, metres (crates/room/src/sighting.rs), read for a room that sends
 *  none. */
export const SIGHT_LEAST_M = 5_000;
/** A hostile ship's mark stands this far over the water, metres: over her masthead. */
const HOSTILE_RISE_M = 20;
/** Her mark's id: `hostile-` and her number in the room. */
export const HOSTILE_PREFIX = 'hostile-';

/** The distance a ship is sighted from. */
export function sightOf(pirate: Pick<SeenPirate, 'sight'>): number {
  return pirate.sight !== undefined && pirate.sight > 0 ? pirate.sight : SIGHT_LEAST_M;
}

const apart = (pirate: SeenPirate, ship: Point2) => Math.hypot(pirate.x - ship[0], pirate.y - ship[1]);

/** The hostile ships within their own sight of the player's ship at `ship`. */
export function sightedHostiles(pirates: readonly SeenPirate[], ship: Point2): SeenPirate[] {
  return pirates.filter((pirate) => apart(pirate, ship) <= sightOf(pirate));
}

/** Her name as her plate gives it: her faction's, on her hull. */
export function hostileName(pirate: SeenPirate): string {
  return shipName(pirate.faction, pirate.hull ?? 0);
}

/** How her mark looks: her faction's emblem, her rank's colour, and the plates' mark of a Miniboss. */
export interface HostileLook {
  readonly emblem: string | null;
  readonly colour: string;
  readonly badge: string | null;
}

export function hostileLook(pirate: SeenPirate): HostileLook {
  const mark = rankMark(pirate.rank);
  return {
    emblem: emblemUrl(pirate.faction),
    colour: rankColour(pirate.rank),
    badge: mark === 'miniboss' ? markPicture(mark).url : null,
  };
}

/** Her mark's note: her level, where the room sends one, and her distance. */
export function hostileNote(pirate: SeenPirate, metres: number): string {
  const level = pirate.level ?? 0;
  return level > 0 ? `Level ${level} · ${distanceText(metres)}` : distanceText(metres);
}

/** Each sighted ship as a mark to lay, held at the picture's edge when off it. */
export function hostileMarks(pirates: readonly SeenPirate[], ship: Point2): Mark[] {
  // The marks are laid as a port's are; the hostile kind is the display's own.
  return sightedHostiles(pirates, ship).map((pirate) => ({
    id: `${HOSTILE_PREFIX}${pirate.id}`,
    kind: 'port',
    name: hostileName(pirate),
    at: [pirate.x, pirate.y, HOSTILE_RISE_M],
    edge: true,
  }));
}

/** The water the ship is in, as the page names it: its name, its holder (contested on the seam) and its band. */
export interface WaterNamed {
  readonly name: string | null;
  readonly holder: WaterHolder;
  readonly levels: readonly [number, number] | null;
}

/** The water at a point, named, from the opened waters' rules and their table; null on land. */
export function waterNamer(rules: WatersRules, table: WatersTable): (point: Point2) => WaterNamed | null {
  return (point) => {
    const here = rules.waterAt(point);
    const water = here && table.waters[here.continent];
    return water ? { name: water.name, holder: here.holder, levels: water.levels } : null;
  };
}

const HOLDER_WORDS: Readonly<Record<WaterHolder, string>> = {
  'home': 'Overlook’s home waters',
  'contested': 'contested',
  'grey-tithe': 'Grey Tithe',
  'pirates': 'Pirates',
};

/** The water as the status line names it: "The Fen Deeps, levels 22-26, Grey Tithe"; home waters by their holder
 *  alone. */
export function waterWords(water: WaterNamed): string {
  const name = water.name ?? 'Open sea';
  if (water.holder === 'home') return `${name}, ${HOLDER_WORDS.home}`;
  const band = water.levels ? `, levels ${water.levels[0]}-${water.levels[1]}` : '';
  return `${name}${band}, ${HOLDER_WORDS[water.holder]}`;
}

/** How long the voyage's line holds what the watch said, seconds. */
export const SAID_S = 6;

/** What the voyage's line says as the ship goes on: each hostile ship when first sighted, the nearest first, and the
 *  water when she enters another, each held `SAID_S`. */
export class SeaWatch {
  private readonly seen = new Set<number>();
  private water: string | null = null;
  private said: { readonly words: string; age: number } | null = null;

  /** Steps `seconds` on: `pirates` round the ship at `ship`, in `water`. */
  step(seconds: number, pirates: readonly SeenPirate[], ship: Point2, water: WaterNamed | null): void {
    if (this.said) this.said.age += seconds;
    const sighted = sightedHostiles(pirates, ship);
    const present = new Set(pirates.map((pirate) => pirate.id));
    for (const id of this.seen) if (!present.has(id)) this.seen.delete(id);
    const fresh = sighted.filter((pirate) => !this.seen.has(pirate.id));
    fresh.forEach((pirate) => this.seen.add(pirate.id));
    const nearest = fresh.sort((one, other) => apart(one, ship) - apart(other, ship))[0];
    const words = water && waterWords(water);
    const entered = words !== null && this.water !== null && words !== this.water;
    if (words !== null) this.water = words;
    if (nearest)
      this.said = { words: `A ${hostileName(nearest)} sighted, ${distanceText(apart(nearest, ship))} off.`, age: 0 };
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
