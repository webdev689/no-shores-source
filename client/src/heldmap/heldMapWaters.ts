// The waters on the held map as page elements over the parchment: each charted water's name and level band at its
// label point, the key naming the four holders by their colours in the map's lower left corner, and the sheet both
// are drawn by, with the ruins' glyph. Lettered in the map's own ink, as its places are.
import { make } from '../editor/dom.ts';
import type { MapPlace } from './heldMap.ts';
import type { Rect } from './heldMapLaw.ts';
import {
  chartedWaters,
  HOLDER_COLOURS,
  HOLDER_WORDS,
  labelPoints,
  type MapWaters,
  washOf,
  type WatersWash,
  waterWords,
} from './watersWash.ts';

/** The key's inset from the map's lower left corner, pixels. */
const KEY_INSET_PX = 14;

/** The places the map names, a city that is no port named and marked as the ruins it is; before the waters are open,
 *  as they come. */
export function ruinedPlaces(places: readonly MapPlace[], mainPorts: readonly string[] | null): MapPlace[] {
  if (!mainPorts) return [...places];
  return places.map((place) => {
    const city = place.kind === 'port' && place.id.endsWith('-port') ? place.id.slice(0, -'-port'.length) : null;
    return city !== null && !mainPorts.includes(city)
      ? { ...place, kind: 'ruin', name: `Ruins of ${place.name}` }
      : place;
  });
}

/** The waters as the map keeps them: their label points, worked out once, their letters and the key. */
export class HeldMapWaters {
  readonly waters: MapWaters;
  private readonly points: Map<number, readonly [number, number]>;
  private readonly key = make('div', '', 'held-key');
  private readonly letters = new Map<number, HTMLElement>();
  private charted = new Set<number>();

  constructor(waters: MapWaters, layer: HTMLElement) {
    this.waters = waters;
    this.points = labelPoints(waters);
    for (const [holder, words] of HOLDER_WORDS) {
      const row = make('div', '', 'held-key-row');
      const swatch = make('i', '', 'held-key-swatch');
      swatch.style.background = HOLDER_COLOURS[holder];
      row.append(swatch, make('span', words));
      this.key.append(row);
    }
    layer.append(this.key);
    for (const water of waters.waters) {
      const letters = make('div', waterWords(water), 'held-water');
      letters.hidden = true;
      this.letters.set(water.continent, letters);
      layer.append(letters);
    }
  }

  /** The wash for the sea charted now, and which waters are lettered from it. */
  chart(charted: Uint8Array): WatersWash {
    this.charted = chartedWaters(this.waters, charted);
    return washOf(this.waters, charted);
  }

  /** Lays the letters and the key on the map at `ink` (screen pixels, `drop` down its lowering); `toInk` gives a world
   *  point's place on it. */
  layout(ink: Rect, drop: number, toInk: (x: number, y: number) => readonly [number, number]): void {
    for (const [continent, letters] of this.letters) {
      const point = this.points.get(continent);
      const [x, y] = point ? toInk(point[0], point[1]) : [-1, -1];
      letters.hidden = !this.charted.has(continent) || x < 0 || y < 0 || x > ink.width || y > ink.height;
      letters.style.transform = `translate(${ink.x + x}px, ${ink.y + y + drop}px) translate(-50%, -50%)`;
    }
    this.key.style.transform = `translate(${ink.x + KEY_INSET_PX}px, ${ink.y + ink.height + drop - KEY_INSET_PX}px) translate(0, -100%)`;
  }
}

const SHEET_ID = 'held-map-waters';

/** Lays the waters' and the ruins' sheet on `page`, once: in the map's ink (`--map-ink`, index.html's held map). */
export function wearHeldMapWaters(page: Document): void {
  if (page.getElementById(SHEET_ID)) return;
  const sheet = page.createElement('style');
  sheet.id = SHEET_ID;
  sheet.textContent = `
.held-water { font-size: 13px; font-style: italic; letter-spacing: 0.08em; color: var(--map-ink); white-space: nowrap;
  opacity: 0.85; text-shadow: -1px 0 0 #eedebe, 1px 0 0 #eedebe, 0 -1px 0 #eedebe, 0 1px 0 #eedebe; }
.held-key { display: flex; flex-direction: column; gap: 3px; padding: 6px 8px; font-size: 11px; color: var(--map-ink);
  border: 1px solid color-mix(in srgb, var(--map-ink) 45%, transparent); background: rgba(238, 222, 190, 0.6); }
.held-key-row { display: flex; align-items: center; gap: 6px; white-space: nowrap; }
.held-key-swatch { display: inline-block; width: 14px; height: 9px; opacity: 0.75;
  border: 1px solid color-mix(in srgb, var(--map-ink) 60%, transparent); }
.held-mark.ruin::before { border-radius: 0; border-style: dashed; transform: rotate(45deg); background: none; }
`;
  page.head.append(sheet);
}
