// The waters on the held map: each charted water's name and level band, lettered at its label point and held inside
// the map, and the places it names, a city that is no port named as the ruins it is. What is lettered is laid out
// (mapLayout.ts) and painted with the parchment's ink (mapLetters.ts).
import type { CoastField } from './coastField.ts';
import type { MapPlace } from './heldMap.ts';
import type { Rect } from './heldMapLaw.ts';
import { anyCellUnder } from './mapKey.ts';
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

  /** The charted waters' names on a map `ink` wide and high, `toInk` giving a world point's place on it: each at its
   *  label point while that is on the map, in her difficulty's colour. The layout holds each inside the map. */
  letters(
    ink: { readonly width: number; readonly height: number },
    toInk: (x: number, y: number) => readonly [number, number],
  ): { text: string; x: number; y: number; continent: number; colour: string | undefined }[] {
    return this.waters.waters.flatMap((water) => {
      const point = this.points.get(water.continent);
      if (!point || !this.charted.has(water.continent)) return [];
      const [x, y] = toInk(point[0], point[1]);
      if (x < 0 || y < 0 || x > ink.width || y > ink.height) return [];
      const colour = difficultyColour(water.levels) ?? undefined;
      return [{ text: waterWords(water), x, y, continent: water.continent, colour }];
    });
  }
}

/** How well a water's name in `box` (ink pixels), the map showing `view`, stands on the sea of the water whose
 *  continent's index is `continent`: 2 wholly on hers; 1 on no land of any island (`field`), known or not, with its
 *  middle on hers, so across a narrow sea seen whole it runs over a neighbour's wash; 0 over land or off her sea. */
export function onOwnSea(
  waters: MapWaters,
  field: CoastField,
  view: { readonly left: number; readonly top: number; readonly scale: number },
  box: Rect,
  continent: number,
): 0 | 1 | 2 {
  const land = (cell: number) => (waters.water[cell] ?? -1) < 0 || (field.distance[cell] ?? 1) < 0;
  if (anyCellUnder(field, view, box, land)) return 0;
  if (!anyCellUnder(waters, view, box, (cell) => waters.water[cell] !== continent)) return 2;
  const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2, width: 0, height: 0 };
  return anyCellUnder(waters, view, middle, (cell) => waters.water[cell] !== continent) ? 0 : 1;
}
