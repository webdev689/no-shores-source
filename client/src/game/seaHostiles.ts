// The hostile ships the sea's view tells of, and the water the ship is in: a mark for each hostile ship within its own
// sight of the player's ship, by its faction's emblem, its rank's colour, its name as its plate gives it, its level and
// its distance; the words on the voyage's line when one is first sighted or the ship sails into another's hold of the
// sea; and the water's name, band and holder for the sea's status line.
import { sweptBoxes } from '../editor/shipClear.ts';
import type { SeenHostile } from '../network/messages.ts';
import type { Point2, Vec3 } from '../overworld/ground.ts';
import type { Mark } from '../overworld/overworldMarks.ts';
import type { Pick as Picked } from '../overworld/overworldPick.ts';
import { HOLDER_WORDS as MAP_HOLDER_WORDS } from '../heldmap/watersWash.ts';
import { emblemSvg, markPicture } from '../plus/emblems.ts';
import { rankMark } from '../rules/roster.ts';
import type { WaterHolder, WatersRules, WatersTable } from '../rules/watersRules.ts';
import { rankColour, shipName, sightedWords } from '../ships/shipBars.ts';
import { distanceText } from '../plus/compass.ts';
import { SKY_NOW } from '../sky/skyDriver.ts';
import { factionSide } from '../ships/dress.ts';
import { lanternsLit } from '../ships/lanterns.ts';
import { hullOfCaptain } from '../ships/hulls.ts';

/** The least distance a hostile ship is sighted from, metres (crates/room/src/sighting.rs), read for a room that sends
 *  none. */
export const SIGHT_LEAST_M = 5_000;
/** A hostile ship's mark stands this far over the water, metres: over its masthead. */
const HOSTILE_RISE_M = 20;
/** Its mark's id: `hostile-` and its number in the room. */
export const HOSTILE_PREFIX = 'hostile-';

/** The distance a ship is sighted from: by night only as far as her lanterns show her (`sight`), and a Grey Tithe
 *  ship sails dark. */
export function sightOf(
  hostile: Pick<SeenHostile, 'sight' | 'faction'>,
  sight: (rangeM: number, lit: boolean) => number = SKY_NOW.current.sight,
): number {
  const byDay = hostile.sight !== undefined && hostile.sight > 0 ? hostile.sight : SIGHT_LEAST_M;
  return sight(byDay, lanternsLit({ side: factionSide(hostile.faction) }));
}

const apart = (hostile: SeenHostile, ship: Point2) => Math.hypot(hostile.x - ship[0], hostile.y - ship[1]);

/** The hostile ships within their own sight of the player's ship at `ship`. */
export function sightedHostiles(hostiles: readonly SeenHostile[], ship: Point2): SeenHostile[] {
  return hostiles.filter((hostile) => apart(hostile, ship) <= sightOf(hostile));
}

/** The hostile ship whose hull or rig, drawn `scale` times its size as hull `shown` draws it, a ray from `eye` along
 *  the unit `direction` meets first, and how far along it: a click on the ship itself is a click on its mark, whether
 *  or not it is sighted (by night a dark one drawn past its sight is still one to click). Its box is its hull's and its
 *  sails' as far as they swing (`sweptBoxes`), turned to its heading; none met, null. */
export function hostileUnder(
  eye: Vec3,
  direction: Vec3,
  hostiles: readonly SeenHostile[],
  scale: number,
  shown: (hull: number) => number = (hull) => hull,
): { readonly id: string; readonly distance: number } | null {
  let met: { readonly id: string; readonly distance: number } | null = null;
  for (const hostile of hostiles) {
    const boxes = sweptBoxes(shown(hullOfCaptain(hostile)));
    const low = [0, 1, 2].map((axis) => Math.min(...boxes.map((box) => box[0][axis] ?? 0)) * scale);
    const high = [0, 1, 2].map((axis) => Math.max(...boxes.map((box) => box[1][axis] ?? 0)) * scale);
    const [forward, starboard] = [
      [Math.sin(hostile.heading), -Math.cos(hostile.heading)],
      [Math.cos(hostile.heading), Math.sin(hostile.heading)],
    ] as const;
    const [east, south] = [eye[0] - hostile.x, eye[1] - hostile.y];
    const from = [east * forward[0] + south * forward[1], east * starboard[0] + south * starboard[1], eye[2]];
    const way = [
      direction[0] * forward[0] + direction[1] * forward[1],
      direction[0] * starboard[0] + direction[1] * starboard[1],
      direction[2],
    ];
    // The ray's stretch inside each pair of the box's faces, and inside all three at once.
    let [enter, leave] = [0, Infinity];
    for (let axis = 0; axis < 3; axis++) {
      const [start, step] = [from[axis] ?? 0, way[axis] ?? 0];
      const [lowest, highest] = [low[axis] ?? 0, high[axis] ?? 0];
      if (Math.abs(step) < 1e-12) {
        if (start < lowest || start > highest) leave = -1;
        continue;
      }
      const [one, other] = [(lowest - start) / step, (highest - start) / step];
      [enter, leave] = [Math.max(enter, Math.min(one, other)), Math.min(leave, Math.max(one, other))];
    }
    if (enter <= leave && (!met || enter < met.distance))
      met = { id: `${HOSTILE_PREFIX}${hostile.id}`, distance: enter };
  }
  return met;
}

/** What a click at sea met: `picked` (a mark, else the land or the sea under it), or a hostile ship standing nearer
 *  along its `ray` than what it met, as that ship's mark; the ships drawn `scale` times their size in the hulls `shown`
 *  draws them as. */
export function orHostile(
  picked: Picked,
  ray: { readonly eye: Vec3; readonly direction: Vec3 },
  hostiles: readonly SeenHostile[],
  scale: number,
  shown: (hull: number) => number,
): Picked {
  if (picked.kind === 'mark') return picked;
  const hostile = hostileUnder(ray.eye, ray.direction, hostiles, scale, shown);
  const met = (point: readonly number[]) => Math.hypot(...point.map((value, axis) => value - (ray.eye[axis] ?? 0)));
  const behind = picked.kind === 'none' ? Infinity : met(picked.point);
  return hostile && hostile.distance < behind ? { kind: 'mark', id: hostile.id } : picked;
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
  /** The id of the continent whose water it is, as the sea room names the water a ship lies in. */
  readonly island: string;
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
      island: water.id,
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
