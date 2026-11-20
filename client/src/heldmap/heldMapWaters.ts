// The waters on the held map: each charted water's name and level band, lettered at its label point and held inside
// the map, and the places it names, a city that is no port named as the ruins it is. What is lettered is painted with
// the parchment's ink (mapLetters.ts).
import type { MapPlace } from './heldMap.ts';
import type { MapLetter } from './mapLetters.ts';
import {
  chartedWaters,
  difficultyColour,
  labelPoints,
  type MapWaters,
  washOf,
  type WatersWash,
  waterWords,
} from './watersWash.ts';

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
  private charted = new Set<number>();

  constructor(waters: MapWaters) {
    this.waters = waters;
    this.points = labelPoints(waters);
  }

  /** The wash for the sea charted now, and which waters are lettered from it. */
  chart(charted: Uint8Array): WatersWash {
    this.charted = chartedWaters(this.waters, charted);
    return washOf(this.waters, charted);
  }

  /** The charted waters' names on a map `ink` wide and high, `toInk` giving a world point's place on it, `widthOf` a
   *  name's width: each at its label point while that is on the map, held inside the map's edges. */
  letters(
    ink: { readonly width: number; readonly height: number },
    toInk: (x: number, y: number) => readonly [number, number],
    widthOf: (text: string) => number,
  ): MapLetter[] {
    return this.waters.waters.flatMap((water): MapLetter[] => {
      const point = this.points.get(water.continent);
      if (!point || !this.charted.has(water.continent)) return [];
      const [x, y] = toInk(point[0], point[1]);
      if (x < 0 || y < 0 || x > ink.width || y > ink.height) return [];
      const text = waterWords(water);
      const half = Math.min(widthOf(text) / 2, ink.width / 2);
      const colour = difficultyColour(water.levels) ?? undefined;
      return [{ text, x: Math.min(Math.max(x, half), ink.width - half), y, kind: 'water', chosen: false, colour }];
    });
  }
}
