import { castOf } from './cast.ts';
import type { Cast, Kind } from './kinds.ts';
import { firstForms, formKinds, PLANTED_FLOATS, type ScatterGround, scatterTile, TILE_M } from './scatter.ts';
import { VERTEX_FLOATS } from './shapes.ts';

/** The ground round the eye, as the caller has it this frame. */
export interface NatureGround extends ScatterGround {
  /** The landmass's biome, its `climate` in the layout; an unknown one grows nothing. */
  readonly biome: string;
  /** Changes whenever the ground under the plants changes (an edit, a new close patch): every tile is scattered
   *  again, nearest first, the old plants drawn until their tile's turn comes. */
  readonly version: number;
}

/** An instance as the GPU reads it: east and south of the anchor, its foot's height, its turn; its width and height
 *  scales, its tint and its rank. */
export const INSTANCE_FLOATS = 8;
/** The near mesh crossfades into the far one over this last share of its range. */
export const LOD_BAND = 0.12;
/** Far trees thin out from here to their reach, the rest widened to fill in. */
export const THIN_FROM_M = 1000;
/** While tiles still wait their turn, newly scattered ones are packed at most this often, milliseconds: a pack
 *  copies every instance, too much to do every frame. */
const REPACK_MS = 250;
/** The eye stands anywhere in its tile, so a tile's distance from the eye's tile's middle is this uncertain. */
const SLACK_M = TILE_M * Math.SQRT1_2;
/** A tile is scattered, and drawn, while its middle lies within a reach and this of the eye's tile's middle. */
const RING_M = 2 * SLACK_M;

/** The share of a kind's far plants still drawn at a distance: all of them near, `keepAtReach` at its reach. */
export function keptAt(kind: Kind, keepAtReach: number, distance: number): number {
  if (kind.reachM <= THIN_FROM_M) return 1;
  const share = Math.min(1, Math.max(0, (distance - THIN_FROM_M) / (kind.reachM - THIN_FROM_M)));
  return 1 - (1 - keepAtReach) * share * share * (3 - 2 * share);
}

/** One form's instances at one detail, tile by tile in the packed order: the tiles that hold some, and how many. */
export interface Group {
  readonly form: number;
  readonly far: boolean;
  readonly first: number;
  readonly tiles: readonly number[];
  readonly counts: readonly number[];
}

/** Everything drawn, packed for the GPU: the anchor (a world point near the eye, metres) every instance is placed
 *  from, the instances, each packed tile's middle (from the anchor) and the lowest and highest a plant of it reaches,
 *  and the groups to draw. */
export interface Packed {
  readonly anchor: readonly [number, number];
  readonly instances: Float32Array;
  readonly tiles: Float32Array;
  readonly groups: readonly Group[];
  /** How far a plant's crown may reach past its tile's edge, metres, the far ones widened as they thin. */
  readonly spread: number;
}

/** One layer of a tile: its plants, sorted by form, and where each form's begin (and the last ends). */
interface Layered {
  readonly planted: Float32Array;
  readonly starts: Int32Array;
}

interface Tile {
  readonly tileX: number;
  readonly tileY: number;
  readonly tall: Layered;
  low: Layered | null;
  readonly version: number;
  /** The lowest and highest foot of the tile's plants, both layers', metres: Infinity and -Infinity for none. */
  lowest: number;
  highest: number;
}

function layered(planted: Float32Array, forms: number): Layered {
  const starts = new Int32Array(forms + 1);
  for (let offset = 0; offset < planted.length; offset += PLANTED_FLOATS) {
    const form = (planted[offset] ?? 0) + 1;
    starts[form] = (starts[form] ?? 0) + 1;
  }
  for (let form = 1; form <= forms; form++) starts[form] = (starts[form] ?? 0) + (starts[form - 1] ?? 0);
  return { planted, starts };
}

/** The lowest and highest foot among some plants and the bounds so far. */
function feet(planted: Float32Array, lowest = Infinity, highest = -Infinity): [number, number] {
  for (let offset = 3; offset < planted.length; offset += PLANTED_FLOATS) {
    lowest = Math.min(lowest, planted[offset] ?? 0);
    highest = Math.max(highest, planted[offset] ?? 0);
  }
  return [lowest, highest];
}

/** Tile offsets from the eye's tile, nearest first, out to a reach. */
function offsetsWithin(reach: number): (readonly [number, number, number])[] {
  const steps = Math.ceil(reach / TILE_M) + 1;
  const offsets: [number, number, number][] = [];
  for (let down = -steps; down <= steps; down++) {
    for (let across = -steps; across <= steps; across++) {
      const distance = Math.hypot(across, down) * TILE_M;
      if (distance <= reach + RING_M) offsets.push([across, down, distance]);
    }
  }
  return offsets.sort((a, b) => a[2] - b[2]);
}

const keyOf = (tileX: number, tileY: number) => tileX * 4_194_304 + tileY;

/** How tall the cast's tallest plant stands and how far its widest reaches from its foot, metres, at its largest
 *  and widened as much as thinning widens the far ones (natureShader.ts `grow`). */
function extent(cast: Cast): { top: number; spread: number } {
  const grow = 1 / Math.sqrt(Math.max(cast.keepAtReach, 0.05));
  let [top, spread] = [0, 0];
  for (const kind of cast.kinds) {
    for (const plant of kind.plants) {
      const { vertices } = plant.near;
      for (let offset = 0; offset < vertices.length; offset += VERTEX_FLOATS) {
        top = Math.max(top, (vertices[offset + 2] ?? 0) * kind.sizes[1] * 1.12);
        spread = Math.max(spread, Math.hypot(vertices[offset] ?? 0, vertices[offset + 1] ?? 0) * kind.sizes[1]);
      }
    }
  }
  return { top: top * (1 + (grow - 1) * 0.3), spread: spread * grow };
}

/**
 * The plants round the eye, a tile at a time. A tile is scattered once and kept while the eye stays near; the
 * instances are packed again only when the eye crosses into another tile or a tile is scattered.
 */
export class NatureField {
  private readonly budgetMs: number;
  private readonly kept = new Map<number, Tile>();
  private biome = '';
  private cast: Cast = castOf('');
  private kindOf: number[] = [];
  private firstForm: number[] = [];
  private reach = { tall: 0, low: 0, top: 0, spread: 0 };
  private offsets: (readonly [number, number, number])[] = [];
  private eyeTile: readonly [number, number] | null = null;
  /** The eye has crossed into another tile, or tiles have been scattered, since the last pack. */
  private moved = true;
  private grown = false;
  private packedAt = -Infinity;
  /** Every tile in reach is scattered on the ground's current version, so an update has nothing to look for. */
  private settled: { readonly version: number } | null = null;
  /** How far through the offsets the last update got, for the version it worked on: the next carries on there. */
  private cursor = { at: 0, version: NaN };
  /** The packing's working buffer, kept between packs so a step of the eye rarely makes a new one. */
  private scratch = new Float32Array(1 << 16);
  private packing: Packed = {
    anchor: [0, 0],
    instances: new Float32Array(),
    tiles: new Float32Array(),
    groups: [],
    spread: 0,
  };
  /** How many tile layers have been scattered: for tests and the page's own readout. */
  scattered = 0;

  /** `budgetMs` is how long one update may spend scattering. */
  constructor(budgetMs = 6) {
    this.budgetMs = budgetMs;
  }

  /** The cast being drawn. */
  get drawnCast(): Cast {
    return this.cast;
  }

  /** The instances as last packed. */
  get packed(): Packed {
    return this.packing;
  }

  /** Scatters the tiles the eye has come near, nearest first, within the budget, and packs again if anything
   *  changed. Answers whether tiles are still waiting their turn. */
  update(eyeX: number, eyeY: number, ground: NatureGround): boolean {
    if (ground.biome !== this.biome) this.reset(ground.biome);
    const tile = [Math.floor(eyeX / TILE_M), Math.floor(eyeY / TILE_M)] as const;
    if (tile[0] !== this.eyeTile?.[0] || tile[1] !== this.eyeTile[1]) {
      this.eyeTile = tile;
      this.moved = true;
      this.settled = null;
      this.cursor = { at: 0, version: NaN };
      this.forget(tile);
    }
    if (this.cursor.version !== ground.version) this.cursor = { at: 0, version: ground.version };
    let waiting = false;
    const started = performance.now();
    const offsets = this.settled?.version === ground.version ? [] : this.offsets;
    for (; this.cursor.at < offsets.length; this.cursor.at++) {
      if (performance.now() - started > this.budgetMs) {
        waiting = true;
        break;
      }
      const [across, down, distance] = offsets[this.cursor.at] ?? [0, 0, 0];
      const [tileX, tileY] = [tile[0] + across, tile[1] + down];
      const key = keyOf(tileX, tileY);
      let kept = this.kept.get(key);
      if (!kept || kept.version !== ground.version) {
        const tall = scatterTile(this.cast, 'tall', tileX, tileY, ground);
        const [lowest, highest] = feet(tall);
        kept = {
          tileX,
          tileY,
          tall: layered(tall, this.kindOf.length),
          low: null,
          version: ground.version,
          lowest,
          highest,
        };
        this.kept.set(key, kept);
        this.scattered += 1;
        this.grown = true;
      }
      if (!kept.low && distance <= this.reach.low + RING_M) {
        const low = scatterTile(this.cast, 'low', tileX, tileY, ground, kept.tall.planted);
        kept.low = layered(low, this.kindOf.length);
        [kept.lowest, kept.highest] = feet(low, kept.lowest, kept.highest);
        this.scattered += 1;
        this.grown = true;
      }
    }
    if (!waiting) this.settled = { version: ground.version };
    const now = performance.now();
    if (this.moved || (this.grown && (!waiting || now - this.packedAt >= REPACK_MS))) {
      this.pack(tile);
      [this.moved, this.grown, this.packedAt] = [false, false, now];
    }
    return waiting;
  }

  private reset(biome: string): void {
    this.biome = biome;
    this.cast = castOf(biome);
    this.kindOf = formKinds(this.cast);
    this.firstForm = firstForms(this.cast);
    const reachOf = (layer: Kind['layer']) =>
      Math.max(0, ...this.cast.kinds.filter((kind) => kind.layer === layer).map((kind) => kind.reachM));
    this.reach = { tall: reachOf('tall'), low: reachOf('low'), ...extent(this.cast) };
    this.offsets = offsetsWithin(Math.max(this.reach.tall, this.reach.low));
    this.kept.clear();
    this.eyeTile = null;
    this.settled = null;
    this.cursor = { at: 0, version: NaN };
  }

  /** Lets go of tiles, and low layers, the eye has left well behind. */
  private forget(tile: readonly [number, number]): void {
    for (const [key, kept] of this.kept) {
      const distance = Math.hypot(kept.tileX - tile[0], kept.tileY - tile[1]) * TILE_M;
      if (distance > Math.max(this.reach.tall, this.reach.low) + 3 * TILE_M) this.kept.delete(key);
      else if (distance > this.reach.low + 3 * TILE_M) kept.low = null;
    }
  }

  /** Packs every kept instance its form's detail draws from here, tiles in turn round the eye so the ones in view
   *  run together. */
  private pack(tile: readonly [number, number]): void {
    const anchor = [tile[0] * TILE_M, tile[1] * TILE_M] as const;
    const middle = [anchor[0] + TILE_M / 2, anchor[1] + TILE_M / 2] as const;
    const tiles = [...this.kept.values()]
      .map((kept) => {
        const [east, south] = [(kept.tileX + 0.5) * TILE_M - middle[0], (kept.tileY + 0.5) * TILE_M - middle[1]];
        return { kept, east, south, turn: Math.atan2(south, east), distance: Math.hypot(east, south) };
      })
      .sort((a, b) => a.turn - b.turn || a.distance - b.distance);
    const bounds = new Float32Array(tiles.length * 4);
    for (const [index, { kept, east, south }] of tiles.entries()) {
      const [lowest, highest] = kept.lowest > kept.highest ? [0, 0] : [kept.lowest, kept.highest];
      bounds.set([east + TILE_M / 2, south + TILE_M / 2, lowest - 1, highest + this.reach.top], index * 4);
    }
    let out = this.scratch;
    let length = 0;
    const groups: Group[] = [];
    for (const [form, kindIndex] of this.kindOf.entries()) {
      const kind = this.cast.kinds[kindIndex];
      if (!kind) continue;
      const plant = kind.plants[form - (this.firstForm[kindIndex] ?? 0)];
      for (const far of plant?.far ? [false, true] : [false]) {
        const group = { form, far, first: length / INSTANCE_FLOATS, tiles: [] as number[], counts: [] as number[] };
        // Plain loops and scalars: this runs for every form over every tile each time the eye steps a tile.
        for (let index = 0; index < tiles.length; index++) {
          const entry = tiles[index];
          if (!entry) continue;
          const nearest = Math.max(0, entry.distance - SLACK_M * 2);
          if (nearest > kind.reachM) continue;
          if (!far && nearest > kind.nearM) continue;
          if (far && entry.distance + SLACK_M * 2 < kind.nearM * (1 - LOD_BAND)) continue;
          const layer = kind.layer === 'tall' ? entry.kept.tall : entry.kept.low;
          if (!layer) continue;
          const from = (layer.starts[form] ?? 0) * PLANTED_FLOATS;
          const to = (layer.starts[form + 1] ?? 0) * PLANTED_FLOATS;
          if (to <= from) continue;
          if (length + to - from > out.length) {
            const grown = new Float32Array(Math.max(out.length * 2, length + to - from));
            grown.set(out.subarray(0, length));
            out = grown;
          }
          const keep = far ? keptAt(kind, this.cast.keepAtReach, nearest) + 0.05 : 2;
          const east = entry.kept.tileX * TILE_M - anchor[0];
          const south = entry.kept.tileY * TILE_M - anchor[1];
          const planted = layer.planted;
          const before = length;
          for (let offset = from; offset < to; offset += PLANTED_FLOATS) {
            // Each form's plants run in rank order, so the thinned-out ones are the end of the run.
            if ((planted[offset + 8] ?? 0) >= keep) break;
            out[length] = east + (planted[offset + 1] ?? 0);
            out[length + 1] = south + (planted[offset + 2] ?? 0);
            for (let part = 3; part < PLANTED_FLOATS; part++) out[length + part - 1] = planted[offset + part] ?? 0;
            length += INSTANCE_FLOATS;
          }
          if (length === before) continue;
          group.tiles.push(index);
          group.counts.push((length - before) / INSTANCE_FLOATS);
        }
        if (group.tiles.length > 0) groups.push(group);
      }
    }
    this.scratch = out;
    this.packing = { anchor, instances: out.slice(0, length), tiles: bounds, groups, spread: this.reach.spread };
  }
}
