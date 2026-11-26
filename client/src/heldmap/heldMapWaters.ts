// The waters on the held map: each water's name and level band, lettered at its label point and held inside
// the map, and the places it names, a city that is no port named as the ruins it is. What is lettered is laid out
// (mapLayout.ts) and painted with the parchment's ink (mapLetters.ts).
import { ruinedName } from '../ruinedName.ts';
import type { CoastField } from './coastField.ts';
import type { MapPlace } from './heldMapScene.ts';
import type { WaterJudge } from './heldMapAsk.ts';
import type { Rect } from './heldMapLaw.ts';
import { anyCellUnder } from './mapKey.ts';
import { difficultyColour, labelPoints, type MapWaters, washOf, type WatersWash, waterWords } from './watersWash.ts';

/** The places the map names, a city that is no port named and marked as the ruins it is; before the waters are open,
 *  as they come. */
export function ruinedPlaces(places: readonly MapPlace[], mainPorts: readonly string[] | null): MapPlace[] {
  if (!mainPorts) return [...places];
  return places.map((place) => {
    const city = place.kind === 'port' && place.id.endsWith('-port') ? place.id.slice(0, -'-port'.length) : null;
    return city !== null && !mainPorts.includes(city)
      ? { ...place, kind: 'ruin', name: ruinedName(place.name) }
      : place;
  });
}

/** The waters as the map keeps them: their label points, worked out once, their letters and the key. */
/** How far apart the points a water's name is tried at are, ink pixels. */
const SPOT_PX = 10;

export class HeldMapWaters {
  readonly waters: MapWaters;
  /** The water at a point by the exact rule, the room's. */
  readonly judge: WaterJudge;
  private readonly points: Map<number, readonly [number, number]>;

  constructor(waters: MapWaters, judge: WaterJudge) {
    [this.waters, this.judge] = [waters, judge];
    this.points = labelPoints(waters);
  }

  /** The wash over every water. */
  wash(): WatersWash {
    return washOf(this.waters);
  }

  /** The waters in view on a map `ink` wide and high (`toWorld` the world point at a point of it, `toInk`
   *  the reverse): each water's name, its difficulty's colour, and the spots its name may stand at, ink pixels. Its
   *  label point comes first while it is on the map, then every point of a grid `SPOT_PX` apart over the map that
   *  lies on its sea, nearest the middle of its sea in view first. */
  letters(
    ink: { readonly width: number; readonly height: number },
    toInk: (x: number, y: number) => readonly [number, number],
    toWorld: (x: number, y: number) => readonly [number, number],
  ): { text: string; continent: number; colour: string | undefined; spots: { x: number; y: number }[] }[] {
    const { columns, rows, cellM } = this.waters;
    const seen = new Map<number, { x: number; y: number }[]>();
    for (let y = SPOT_PX / 2; y < ink.height; y += SPOT_PX)
      for (let x = SPOT_PX / 2; x < ink.width; x += SPOT_PX) {
        const [east, south] = toWorld(x, y);
        const [column, row] = [Math.floor(east / cellM), Math.floor(south / cellM)];
        if (column < 0 || row < 0 || column >= columns || row >= rows) continue;
        const water = this.waters.water[row * columns + column] ?? -1;
        if (water < 0) continue;
        const spots = seen.get(water) ?? [];
        spots.push({ x, y });
        seen.set(water, spots);
      }
    return this.waters.waters.flatMap((water) => {
      const grid = seen.get(water.continent);
      if (!grid) return [];
      const middle = grid.reduce(
        (sum, spot) => ({ x: sum.x + spot.x / grid.length, y: sum.y + spot.y / grid.length }),
        {
          x: 0,
          y: 0,
        },
      );
      const away = (spot: { x: number; y: number }) => Math.hypot(spot.x - middle.x, spot.y - middle.y);
      const spots = [...grid].sort((one, other) => away(one) - away(other));
      const point = this.points.get(water.continent);
      const [x, y] = point ? toInk(point[0], point[1]) : [-1, -1];
      if (x >= 0 && y >= 0 && x <= ink.width && y <= ink.height) spots.unshift({ x, y });
      const colour = difficultyColour(water.levels) ?? undefined;
      return [{ text: waterWords(water), continent: water.continent, colour, spots }];
    });
  }
}

/** How a water's name in `box` (ink pixels), the map showing `view`, stands on the sea of the water whose continent's
 *  index is `continent`: 2 wholly on it; 1 on no land of any island (`field`), known or not, with its middle on it,
 *  as across a sea too narrow for its name seen whole, where it runs over a neighbour's wash; 0 over land or off its
 *  sea. */
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
