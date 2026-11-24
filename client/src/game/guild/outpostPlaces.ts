import manifest from '../../../../content/modules/modules.json' with { type: 'json' };
import { CELL_M, DECOR_TURNS, type Decor, PLOT_M, type Plot, type Standing, footprint, kindOf } from './outpostLaw.ts';

/**
 * Where everything on an outpost's plot stands in its room, as the page draws it, the page's own body walks against
 * it, and the rooms stand it as blocks: one reckoning for all three, so a wall is where it is drawn. A plot lies
 * square to the world round its middle, which the bake gives with the level ground under it (the node's `outpost`
 * part). A structure is the module of its kind and tier, a scaffold while it is being built, and a standard the
 * module of its guild's staff; each stands at the middle of its cells, turned a quarter at a time. A module's frame is
 * x east, y south, z up from the middle of its foot, as `city/modules.ts` reads it, its front to the south: unturned,
 * a structure faces south, and each quarter turns it clockwise.
 */

/** The ground an outpost's plot stands on: its middle and the height of its level ground. */
export interface Ground {
  readonly plot: readonly [number, number];
  readonly level: number;
}

/** Something stood on a plot: its module's name, the middle of its foot, and its turn in radians clockwise from
 *  north. */
export interface Placed {
  readonly module: string;
  readonly at: readonly [number, number, number];
  readonly turn: number;
}

/** A box a body runs into: west, north, east, south, its top and its underside, as the rooms' blocks are. */
export interface Box {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly top: number;
  readonly bottom: number;
}

type Listed = {
  readonly name: string;
  readonly parts?: readonly (readonly number[])[];
  readonly sockets?: readonly { readonly name: string; readonly at: readonly number[] }[];
};
/** The manifest's modules by name, looked up for every structure each frame. */
const MODULES = new Map(
  (manifest as unknown as { readonly modules: readonly Listed[] }).modules.map((module) => [module.name, module]),
);

/** A structure with no module in the manifest stands as its cells less this each side, so high: it still walls. */
const BARE_INSET_M = 0.2;
const BARE_HEIGHT_M = 3;
/** Parts lower than this over the ground are stepped over, as the cities' are. */
const LEAST_HEIGHT_M = 0.3;

/** The scaffold of a footprint, by its cells across and down as built (unturned). */
function scaffoldOf(cells: readonly number[]): string {
  const [across = 1, down = 1] = cells;
  return across === down ? `outpost-scaffold-${across}` : `outpost-scaffold-${across}x${down}`;
}

/** The module a structure stands as: its scaffold while a tier is being built, its staff's standard, or its kind's
 *  module at its tier. */
export function moduleOf(standing: Standing, staff: string): string {
  const kind = kindOf(standing.kind);
  if (!kind) return '';
  if (standing.building > 0) return scaffoldOf(kind.cells);
  if (kind.id === 'standard') return `outpost-standard-${staff}`;
  return `outpost-${kind.id}-${Math.max(1, standing.tier)}`;
}

/** The north-west corner of a plot on its ground. */
const cornerOf = (ground: Ground) => [ground.plot[0] - PLOT_M / 2, ground.plot[1] - PLOT_M / 2] as const;

/** Where a structure stands: the middle of its cells, turned its quarters. */
export function placeOf(standing: Standing, ground: Ground, staff: string): Placed {
  const kind = kindOf(standing.kind);
  const [across, down] = kind ? footprint(kind, standing.turn) : [1, 1];
  const [west, north] = cornerOf(ground);
  return {
    module: moduleOf(standing, staff),
    at: [west + (standing.x + across / 2) * CELL_M, north + (standing.y + down / 2) * CELL_M, ground.level],
    turn: (standing.turn * Math.PI) / 2,
  };
}

/** Where a piece of decoration stands: at its metres from the plot's corner, turned its steps. */
export function decorPlaceOf(decor: Decor, ground: Ground): Placed {
  const [west, north] = cornerOf(ground);
  return {
    module: decor.piece,
    at: [west + decor.x, north + decor.y, ground.level],
    turn: (decor.turn * 2 * Math.PI) / DECOR_TURNS,
  };
}

/** A point in a module's frame turned a whole number of quarters clockwise (x east, y south). */
function quartered(x: number, y: number, quarters: number): readonly [number, number] {
  switch (((quarters % 4) + 4) % 4) {
    case 1:
      return [-y, x];
    case 2:
      return [-x, -y];
    case 3:
      return [y, -x];
    default:
      return [x, y];
  }
}

/** A point in a module's frame turned `turn` radians clockwise (x east, y south). */
function turned(x: number, y: number, turn: number): readonly [number, number] {
  const [cos, sin] = [Math.cos(turn), Math.sin(turn)];
  return [x * cos - y * sin, x * sin + y * cos];
}

/** A part of a module (west, north, bottom, east, south, top) cut into pieces at most `step` metres across. */
function sliced(part: readonly number[], step: number): (readonly number[])[] {
  const [west = 0, north = 0, bottom = 0, east = 0, south = 0, top = 0] = part;
  const pieces = (length: number) => Math.max(1, Math.ceil(length / step - 1e-9));
  const [across, down] = [pieces(east - west), pieces(south - north)];
  const [wide, deep] = [(east - west) / across, (south - north) / down];
  return Array.from({ length: across * down }, (unused, index) => {
    const [left, upper] = [west + (index % across) * wide, north + Math.floor(index / across) * deep];
    return [left, upper, bottom, left + wide, upper + deep, top];
  });
}

/** How wide the pieces a part turned off the quarters is walled as are, metres: the box round each, turned, stands
 *  about a fifth of this past what is drawn. */
const SLICE_M = 1;

/** A module's solid parts as boxes in the world, each the box round its corners turned `turn` radians clockwise; a
 *  part turned off the quarters is walled as pieces of it, so the boxes keep to what is drawn. A structure whose
 *  module the manifest lacks stands as `bare` (west, north, east, south in its own frame) when given. */
function boxesAt(placed: Placed, turn: number, bare?: readonly number[]): Box[] {
  const parts =
    MODULES.get(placed.module)?.parts ??
    (bare ? [[bare[0] ?? 0, bare[1] ?? 0, 0, bare[2] ?? 0, bare[3] ?? 0, BARE_HEIGHT_M]] : []);
  const quarters = (turn * 2) / Math.PI;
  const square = Math.abs(quarters - Math.round(quarters)) < 1e-9;
  const turnedAt = (x: number, y: number) => (square ? quartered(x, y, Math.round(quarters)) : turned(x, y, turn));
  const [x, y, z] = placed.at;
  return parts
    .filter((part) => (part[5] ?? 0) >= LEAST_HEIGHT_M)
    .flatMap((part) => (square ? [part] : sliced(part, SLICE_M)))
    .map(([west = 0, north = 0, bottom = 0, east = 0, south = 0, top = 0]) => {
      const corners = [turnedAt(west, north), turnedAt(east, north), turnedAt(east, south), turnedAt(west, south)];
      const [across, down] = [corners.map(([atX]) => atX), corners.map(([, atY]) => atY)];
      return {
        minX: x + Math.min(...across),
        minY: y + Math.min(...down),
        maxX: x + Math.max(...across),
        maxY: y + Math.max(...down),
        top: z + top,
        bottom: z + bottom,
      };
    });
}

/** Every box a body runs into on a plot: each structure's module's parts, and each piece of decoration's turned by
 *  its own angle, so a piece turned off the quarters walls where it is drawn. */
export function plotBoxes(plot: Plot, ground: Ground, staff: string): Box[] {
  const structures = plot.structures.flatMap((standing) => {
    const kind = kindOf(standing.kind);
    const [across = 1, down = 1] = kind?.cells ?? [];
    const half = [(across * CELL_M) / 2 - BARE_INSET_M, (down * CELL_M) / 2 - BARE_INSET_M];
    const bare = [-(half[0] ?? 0), -(half[1] ?? 0), half[0] ?? 0, half[1] ?? 0];
    return boxesAt(placeOf(standing, ground, staff), (standing.turn * Math.PI) / 2, bare);
  });
  const decor = plot.decor.flatMap((each) => {
    const placed = decorPlaceOf(each, ground);
    return boxesAt(placed, placed.turn);
  });
  return [...structures, ...decor];
}

/** A socket of a structure's module in the world (where a player stands to use it), or 1 m before the middle of its
 *  front edge where its module has none so named. */
export function socketOf(standing: Standing, ground: Ground, staff: string, name: string): readonly [number, number] {
  const placed = placeOf(standing, ground, staff);
  const socket = MODULES.get(placed.module)?.sockets?.find((each) => each.name === name)?.at;
  const [down = 1] = (kindOf(standing.kind)?.cells ?? []).slice(1);
  const [x, y] = quartered(socket?.[0] ?? 0, socket?.[1] ?? (down * CELL_M) / 2 + 1, standing.turn);
  return [placed.at[0] + x, placed.at[1] + y];
}
