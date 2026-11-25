import type { GroundPatch } from '../rules/landRules.ts';
import type { LayoutMarks } from '../terrain/layoutMarks.ts';
import type { Camera } from './camera.ts';

// The 2D map's exact ground: the land as the game stands on it, carved by the layouts, sampled in square tiles round
// each layout's claim and laid over the 1 km relief. The 1 km land cannot show a canyon 30 m across; the exact
// ground takes seconds a square kilometre to sample, so only where the layouts carve is it asked for, nearest the
// middle of the view first, one tile at a time, and every tile is kept until the land changes.

/** A tile is this many steps a side; it is sampled with one more step all round, for the hillshade at its edges. */
export const TILE_STEPS = 128;
export const TILE_SAMPLES = TILE_STEPS + 3;
/** How many tiles are kept, and drawn, at once. */
export const MOST_TILES = 64;
/** The finest and coarsest steps, metres; the map asks for none further out than the coarsest. */
const FINEST_STEP_M = 2;
const COARSEST_STEP_M = 16;
/** The carving fades back into the natural land this far past a claim, and a little more. */
const CARVED_PAST_M = 200;

export interface TileAsk {
  readonly key: string;
  readonly left: number;
  readonly top: number;
  readonly step: number;
}

/** A tile as kept: what it covers, its slot on the GPU, the land version it was sampled from, and its ground. */
export interface Tile extends TileAsk {
  readonly slot: number;
  readonly version: number;
  readonly patch: GroundPatch;
}

/** The step the map asks for at a scale: a power of two no finer than a pixel, or null when too far out. */
export function tileStep(metresPerPixel: number): number | null {
  if (metresPerPixel > COARSEST_STEP_M) return null;
  let step = FINEST_STEP_M;
  while (step < metresPerPixel) step *= 2;
  return step;
}

/** The tiles to ask for: each at the view's step, in the view and within reach of a layout's claim, nearest the
 *  view's middle first. */
export function tilesWanted(camera: Camera, width: number, height: number, layouts: readonly LayoutMarks[]): TileAsk[] {
  const step = tileStep(camera.metresPerPixel);
  if (step === null) return [];
  const side = step * TILE_STEPS;
  const [halfWidth, halfHeight] = [(width / 2) * camera.metresPerPixel, (height / 2) * camera.metresPerPixel];
  const view = [
    camera.centreX - halfWidth,
    camera.centreY - halfHeight,
    camera.centreX + halfWidth,
    camera.centreY + halfHeight,
  ];
  const wanted = new Map<string, TileAsk & { readonly away: number }>();
  for (const { ring } of layouts) {
    if (!ring.length) continue;
    const eastings = ring.map(([x]) => x);
    const southings = ring.map(([, y]) => y);
    const west = Math.max(Math.min(...eastings) - CARVED_PAST_M, view[0] ?? 0);
    const north = Math.max(Math.min(...southings) - CARVED_PAST_M, view[1] ?? 0);
    const east = Math.min(Math.max(...eastings) + CARVED_PAST_M, view[2] ?? 0);
    const south = Math.min(Math.max(...southings) + CARVED_PAST_M, view[3] ?? 0);
    for (let i = Math.floor(west / side); i * side < east; i++)
      for (let j = Math.floor(north / side); j * side < south; j++) {
        const [left, top] = [i * side, j * side];
        const away = Math.hypot(left + side / 2 - camera.centreX, top + side / 2 - camera.centreY);
        wanted.set(`${step}:${i}:${j}`, { key: `${step}:${i}:${j}`, left, top, step, away });
      }
  }
  return [...wanted.values()]
    .sort((first, second) => first.away - second.away)
    .map(({ key, left, top, step: tileStepM }) => ({ key, left, top, step: tileStepM }));
}

/** Where the tiles come from: the exact ground over a square of samples, or null when the landmass is not open. */
export interface TileSource {
  ground(left: number, top: number, step: number, size: number): Promise<GroundPatch | null>;
}

/** The kept tiles of one landmass: asks for the next one wanted, keeps it in a free slot (or the one least lately
 *  wanted), and drops every tile when another landmass is shown. A wanted tile of an older land version is drawn
 *  until its fresh one comes, so a stroke never blanks the carving. */
export class ReliefTiles {
  private readonly tiles = new Map<string, Tile>();
  private readonly used = new Map<string, number>();
  private asking = false;
  private landmass = '';
  private frame = 0;
  private readonly laid: (tile: Tile) => void;

  constructor(laid: (tile: Tile) => void) {
    this.laid = laid;
  }

  /** The tiles to draw. */
  get kept(): readonly Tile[] {
    return [...this.tiles.values()];
  }

  /** Called each frame of the 2D map: asks for the next tile wanted if none is being sampled. Only the nearest
   *  `MOST_TILES` wanted are kept, so a wanted tile never takes another's slot and is asked for again forever; and once
   *  the land changes, a tile of the land before it that is no longer wanted is dropped, so an old, finer tile never
   *  hides the fresh ground under it. */
  keep(landmass: string, version: number, everyWanted: readonly TileAsk[], source: TileSource): void {
    this.frame++;
    if (landmass !== this.landmass) {
      this.tiles.clear();
      this.used.clear();
      this.landmass = landmass;
    }
    const wanted = everyWanted.slice(0, MOST_TILES);
    const wantedKeys = new Set(wanted.map(({ key }) => key));
    for (const [key, tile] of this.tiles) if (tile.version !== version && !wantedKeys.has(key)) this.tiles.delete(key);
    for (const { key } of wanted) this.used.set(key, this.frame);
    const next = wanted.find(({ key }) => this.tiles.get(key)?.version !== version);
    if (!next || this.asking) return;
    this.asking = true;
    const margin = next.step;
    source
      .ground(next.left - margin, next.top - margin, next.step, TILE_SAMPLES)
      .then((patch) => {
        if (!patch || landmass !== this.landmass) return;
        const tile = { ...next, slot: this.slotFor(next.key), version, patch };
        this.tiles.set(next.key, tile);
        this.laid(tile);
      })
      .catch(() => undefined)
      .finally(() => {
        this.asking = false;
      });
  }

  /** The slot a tile goes in: its own, a free one, or that of the tile least lately wanted. */
  private slotFor(key: string): number {
    const own = this.tiles.get(key);
    if (own) return own.slot;
    if (this.tiles.size < MOST_TILES) {
      const taken = new Set([...this.tiles.values()].map(({ slot }) => slot));
      let slot = 0;
      while (taken.has(slot)) slot++;
      return slot;
    }
    const [oldest] = [...this.tiles.values()].sort(
      (first, second) => (this.used.get(first.key) ?? 0) - (this.used.get(second.key) ?? 0),
    );
    if (!oldest) return 0;
    this.tiles.delete(oldest.key);
    return oldest.slot;
  }
}
