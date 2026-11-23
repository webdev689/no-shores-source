import { castOf } from './cast.ts';
import { blocksOf, type TileBlocks } from './cull.ts';
import { type FloraForm, formsOf } from './flora.ts';
import type { Cast, Kind } from './kinds.ts';
import { formKinds, PLANTED_FLOATS, type ScatterGround, scatterTile, TILE_M } from './scatter.ts';
import { PAGE_SHIFT, PAGE_SLOTS, SLOT_FLOATS, SlotStore } from './slots.ts';
import { behindVeil } from '../standIns.ts';

/** How long one update may spend scattering behind a trip's veil, milliseconds: no one sees those frames, and the veil
 *  lifts once the plants round the player are scattered; the loading screen still breathes at some 30 frames a
 *  second. */
const VEILED_BUDGET_MS = 30;

/** The ground round the eye, as the caller has it this frame. */
export interface NatureGround extends ScatterGround {
  /** The landmass's biome, its `climate` in the layout; an unknown one grows nothing. */
  readonly biome: string;
  /** Changes whenever the ground under the plants changes (an edit, a new close patch): every tile is scattered
   *  again, nearest first, the old plants drawn until their tile's turn comes. */
  readonly version: number;
  /** The biome's low ground (0..1 a channel): the far plants' colours lean toward it. */
  readonly groundColour?: readonly [number, number, number];
}

/** The near mesh crossfades into the far one over this last share of its range. */
export const LOD_BAND = 0.12;
/** Far trees thin out from here to here (or their reach, if nearer), the rest widened to fill in; past it, as far
 *  as they are drawn, the same share stands. */
export const THIN_FROM_M = 1000;
export const THIN_TO_M = 3000;
/** While tiles still wait their turn, newly scattered ones are listed at most this often, milliseconds. */
const REPACK_MS = 250;
/** The eye stands anywhere in its tile, so a tile's distance from the eye's tile's middle is this uncertain. */
const SLACK_M = TILE_M * Math.SQRT1_2;
/** A tile is scattered, and drawn, while its middle lies within a reach and this of the eye's tile's middle. */
const RING_M = 2 * SLACK_M;
/** A tile whose nearest point lies past the thinning keeps only what the thinning leaves (scatter.ts `far`), and is
 *  scattered whole again when the eye comes nearer. */
const SPARSE_FROM_M = THIN_TO_M + 2 * SLACK_M;

/** The share of a kind's far plants still drawn at a distance: all of them near, `keepAtReach` at its reach. */
export function keptAt(kind: Kind, keepAtReach: number, distance: number): number {
  if (kind.reachM <= THIN_FROM_M) return 1;
  const share = Math.min(1, Math.max(0, (distance - THIN_FROM_M) / (Math.min(kind.reachM, THIN_TO_M) - THIN_FROM_M)));
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

/** What is drawn from here: the anchor (a world point near the eye, metres); the slot of every instance drawn,
 *  group by group and tile by tile (the slots themselves stay put in the store); each tile number's north-west
 *  corner from the anchor; each listed tile's middle from the anchor and the lowest and highest a plant of it
 *  reaches; and the groups to draw. */
export interface Packed {
  readonly anchor: readonly [number, number];
  readonly list: Uint32Array;
  readonly corners: Float32Array;
  readonly tiles: Float32Array;
  readonly groups: readonly Group[];
  /** How far a plant's crown may reach past its tile's edge, metres, the far ones widened as they thin. */
  readonly spread: number;
  /** The tiles gathered in blocks, for the culls to pass over a whole square at once (each tile alone without). */
  readonly blocks?: TileBlocks;
}

/** One layer of a tile: its plants, sorted by form, where each form's begin (and the last ends), and the store's
 *  pages that hold them. */
interface Layered {
  readonly planted: Float32Array;
  readonly starts: Int32Array;
  readonly pages: readonly number[];
}

interface Tile {
  readonly tileX: number;
  readonly tileY: number;
  /** The tile's number while it is kept: its plants find its corner by it. */
  readonly number: number;
  readonly tall: Layered;
  low: Layered | null;
  readonly version: number;
  /** Scattered far off, holding only what the thinning leaves there. */
  readonly sparse: boolean;
  /** The lowest and highest foot of the tile's plants, both layers', metres: Infinity and -Infinity for none. */
  lowest: number;
  highest: number;
}

/** A layer's plants put in the store as the GPU reads them, and where each form's begin. */
function layered(planted: Float32Array, forms: number, store: SlotStore, tileNumber: number): Layered {
  const starts = new Int32Array(forms + 1);
  const count = planted.length / PLANTED_FLOATS;
  const slots = new Float32Array(count * SLOT_FLOATS);
  for (let index = 0; index < count; index++) {
    const [from, to] = [index * PLANTED_FLOATS, index * SLOT_FLOATS];
    const form = (planted[from] ?? 0) + 1;
    starts[form] = (starts[form] ?? 0) + 1;
    for (let part = 1; part <= 10; part++) slots[to + part - 1] = planted[from + part] ?? 0;
    slots[to + 10] = tileNumber;
    slots[to + 11] = planted[from + 11] ?? 0;
  }
  for (let form = 1; form <= forms; form++) starts[form] = (starts[form] ?? 0) + (starts[form - 1] ?? 0);
  return { planted, starts, pages: store.store(slots) };
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
function extent(cast: Cast, forms: readonly FloraForm[]): { top: number; spread: number } {
  const grow = 1 / Math.sqrt(Math.max(cast.keepAtReach, 0.05));
  const kinds = cast.kinds.flatMap((kind) => Array.from({ length: kind.forms }, () => kind));
  let [top, spread] = [0, 0];
  for (const [index, form] of forms.entries()) {
    const largest = kinds[index]?.sizes[1] ?? 1;
    top = Math.max(top, form.top * largest * 1.12);
    spread = Math.max(spread, form.spread * largest);
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
  private reach = { tall: 0, low: 0, top: 0, spread: 0 };
  private offsets: (readonly [number, number, number])[] = [];
  /** The same offsets in turn round the eye, so the tiles in view run together in the list. */
  private ring: (readonly [number, number, number])[] = [];
  private eyeTile: readonly [number, number] | null = null;
  /** The eye has crossed into another tile, or tiles have been scattered, since the last pack. */
  private moved = true;
  private grown = false;
  private packedAt = -Infinity;
  /** Every tile in reach is scattered on the ground's current version, so an update has nothing to look for. */
  private settled: { readonly version: number } | null = null;
  /** How far through the offsets the last update got, for the version it worked on: the next carries on there. */
  private cursor = { at: 0, version: NaN };
  /** The list's working buffer, kept between lists so a step of the eye rarely makes a new one. */
  private scratch = new Uint32Array(1 << 16);
  /** Each group's run of slots as a list is made, kept between lists: near and far for each form in turn. */
  private readonly runs: { slots: Uint32Array; length: number; tiles: number[]; counts: number[] }[] = [];
  /** Whether each form has a far mesh. */
  private hasFar: boolean[] = [];
  /** Tile numbers let go of, for the next tiles kept; those let go since the last list wait for the next. */
  private readonly freeNumbers: number[] = [];
  private retiredNumbers: number[] = [];
  private nextNumber = 0;
  /** Every kept instance, in slots that stay put while its tile is kept. */
  readonly store = new SlotStore();
  private packing: Packed = {
    anchor: [0, 0],
    list: new Uint32Array(),
    corners: new Float32Array(),
    tiles: new Float32Array(),
    groups: [],
    spread: 0,
  };
  /** How many tile layers have been scattered: for tests and the page's own readout. */
  scattered = 0;

  /** `budgetMs` is how long one update may spend scattering in play; behind a trip's veil it may spend
   *  VEILED_BUDGET_MS. */
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
      if (performance.now() - started > (behindVeil() ? VEILED_BUDGET_MS : this.budgetMs)) {
        waiting = true;
        break;
      }
      const [across, down, distance] = offsets[this.cursor.at] ?? [0, 0, 0];
      const [tileX, tileY] = [tile[0] + across, tile[1] + down];
      const key = keyOf(tileX, tileY);
      let kept = this.kept.get(key);
      const sparse = distance > SPARSE_FROM_M;
      if (!kept || kept.version !== ground.version || (kept.sparse && !sparse)) {
        if (kept) this.letGo(kept, false);
        const number = kept?.number ?? this.freeNumbers.pop() ?? this.nextNumber++;
        const far = sparse ? { beyondM: THIN_TO_M, keepBelow: this.cast.keepAtReach + 0.05 } : null;
        const tall = scatterTile(this.cast, 'tall', tileX, tileY, ground, null, far);
        const [lowest, highest] = feet(tall);
        const forms = this.kindOf.length;
        kept = {
          tileX,
          tileY,
          number,
          tall: layered(tall, forms, this.store, number),
          low: null,
          version: ground.version,
          sparse,
          lowest,
          highest,
        };
        this.kept.set(key, kept);
        this.scattered += 1;
        this.grown = true;
      }
      if (!kept.low && distance <= this.reach.low + RING_M) {
        const low = scatterTile(this.cast, 'low', tileX, tileY, ground, kept.tall.planted);
        kept.low = layered(low, this.kindOf.length, this.store, kept.number);
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
    const forms = formsOf(this.cast, biome);
    this.hasFar = forms.map((form) => !!form.impostor);
    this.runs.length = 0;
    const reachOf = (layer: Kind['layer']) =>
      Math.max(0, ...this.cast.kinds.filter((kind) => kind.layer === layer).map((kind) => kind.reachM));
    this.reach = { tall: reachOf('tall'), low: reachOf('low'), ...extent(this.cast, forms) };
    this.offsets = offsetsWithin(Math.max(this.reach.tall, this.reach.low));
    const turn = ([across, down]: readonly [number, number, number]) => Math.atan2(down, across);
    this.ring = [...this.offsets].sort((a, b) => turn(a) - turn(b) || a[2] - b[2]);
    for (const kept of this.kept.values()) this.letGo(kept, true);
    this.kept.clear();
    this.eyeTile = null;
    this.settled = null;
    this.cursor = { at: 0, version: NaN };
  }

  /** Lets go of tiles, and low layers, the eye has left well behind. */
  private forget(tile: readonly [number, number]): void {
    for (const [key, kept] of this.kept) {
      const distance = Math.hypot(kept.tileX - tile[0], kept.tileY - tile[1]) * TILE_M;
      if (distance > Math.max(this.reach.tall, this.reach.low) + 3 * TILE_M) {
        this.letGo(kept, true);
        this.kept.delete(key);
      } else if (distance > this.reach.low + 3 * TILE_M && kept.low) {
        this.store.release(kept.low.pages);
        kept.low = null;
      }
    }
  }

  /** Gives a tile's pages back to the store, and its number too when the tile itself goes. */
  private letGo(kept: Tile, wholly: boolean): void {
    this.store.release(kept.tall.pages);
    if (kept.low) this.store.release(kept.low.pages);
    if (wholly) this.retiredNumbers.push(kept.number);
  }

  /** Lists the slot of every kept instance its form's detail draws from here, tiles in turn round the eye so the
   *  ones in view run together. Nothing moves in the store: only the list and the tiles' corners are made again. */
  private pack(tile: readonly [number, number]): void {
    const anchor = [tile[0] * TILE_M, tile[1] * TILE_M] as const;
    const tiles: { kept: Tile; east: number; south: number; distance: number }[] = [];
    for (const [across, down, distance] of this.ring) {
      const kept = this.kept.get(keyOf(tile[0] + across, tile[1] + down));
      if (kept) tiles.push({ kept, east: across * TILE_M, south: down * TILE_M, distance });
    }
    const bounds = new Float32Array(tiles.length * 4);
    const corners = new Float32Array(this.nextNumber * 2);
    for (let index = 0; index < tiles.length; index++) {
      const entry = tiles[index];
      if (!entry) continue;
      const { kept } = entry;
      const none = kept.lowest > kept.highest;
      bounds[index * 4] = entry.east + TILE_M / 2;
      bounds[index * 4 + 1] = entry.south + TILE_M / 2;
      bounds[index * 4 + 2] = (none ? 0 : kept.lowest) - 1;
      bounds[index * 4 + 3] = (none ? 0 : kept.highest) + this.reach.top;
      corners[kept.number * 2] = kept.tileX * TILE_M - anchor[0];
      corners[kept.number * 2 + 1] = kept.tileY * TILE_M - anchor[1];
    }
    // Tile by tile, each form's plants go to its group's own run, then the runs are joined: a tile is weighed once,
    // and only the forms it holds are visited.
    const kinds = this.kindOf.map((kindIndex) => this.cast.kinds[kindIndex]);
    const runs = this.runs;
    while (runs.length < kinds.length * 2)
      runs.push({ slots: new Uint32Array(1024), length: 0, tiles: [], counts: [] });
    for (const run of runs) [run.length, run.tiles, run.counts] = [0, [], []];
    for (let index = 0; index < tiles.length; index++) {
      const entry = tiles[index];
      if (!entry) continue;
      const nearest = Math.max(0, entry.distance - SLACK_M * 2);
      const farthest = entry.distance + SLACK_M * 2;
      for (let layerIndex = 0; layerIndex < 2; layerIndex++) {
        const layer = layerIndex === 0 ? entry.kept.tall : entry.kept.low;
        if (!layer) continue;
        const { planted, pages, starts } = layer;
        for (let form = 0; form < kinds.length; form++) {
          const from = starts[form] ?? 0;
          const to = starts[form + 1] ?? 0;
          const kind = kinds[form];
          if (to <= from || !kind || nearest > kind.reachM) continue;
          for (let far = 0; far < 2; far++) {
            if (far === 0 ? nearest > kind.nearM : !this.hasFar[form] || farthest < kind.nearM * (1 - LOD_BAND))
              continue;
            const run = runs[form * 2 + far];
            if (!run) continue;
            if (run.length + to - from > run.slots.length) {
              const grown = new Uint32Array(Math.max(run.slots.length * 2, run.length + to - from));
              grown.set(run.slots.subarray(0, run.length));
              run.slots = grown;
            }
            const keep = far === 1 ? keptAt(kind, this.cast.keepAtReach, nearest) + 0.05 : 2;
            const before = run.length;
            for (let member = from; member < to; member++) {
              // Each form's plants run in rank order, so the thinned-out ones are the end of the run.
              if ((planted[member * PLANTED_FLOATS + 8] ?? 0) >= keep) break;
              run.slots[run.length++] = (pages[member >> PAGE_SHIFT] ?? 0) * PAGE_SLOTS + (member & (PAGE_SLOTS - 1));
            }
            if (run.length === before) continue;
            run.tiles.push(index);
            run.counts.push(run.length - before);
          }
        }
      }
    }
    let out = this.scratch;
    const total = runs.reduce((sum, run) => sum + run.length, 0);
    if (total > out.length) out = new Uint32Array(Math.max(out.length * 2, total));
    let length = 0;
    const groups: Group[] = [];
    for (const [number, run] of runs.entries()) {
      if (run.length === 0) continue;
      out.set(run.slots.subarray(0, run.length), length);
      groups.push({ form: number >> 1, far: (number & 1) === 1, first: length, tiles: run.tiles, counts: run.counts });
      length += run.length;
    }
    this.scratch = out;
    const spread = this.reach.spread;
    this.packing = {
      anchor,
      list: out.slice(0, length),
      corners,
      tiles: bounds,
      groups,
      spread,
      blocks: blocksOf(bounds),
    };
    // The new list names none of what was let go, so its pages and numbers may be handed out again.
    this.store.recycle();
    this.freeNumbers.push(...this.retiredNumbers);
    this.retiredNumbers = [];
  }
}
