// The island's tiles painted as the website's pictures are: pixel scenes on the shared sheet (`art/`), in its lights,
// dithered, each texel two of the screen's pixels across. Overlook's town stepping up its rock to its beacon, its quay's
// lanterns and a ship at anchor; the Playlist's night, its four crests set over it as a constellation; a patrol zone's
// hills under dawn, night or mist, a hamlet's windows and its three landing zones' lanterns; an Elite Dungeon's gate in
// a hillside, braziers either side and its light within; a mission's broken walls in mist under a banner; a world
// boss rising from a burning sea; an outpost's palisade and watchtower on its strand; and the island itself charted
// with its shoals, its harbour's lantern and the ship. Each is seeded by its place, so no two are painted alike.
import { DARK } from '../art/landmarks.ts';
import { clouds, lantern, LIGHTS, moon, range, sea, sky, stars } from '../art/light.ts';
import { beacon, isle, quay, town } from '../art/places.ts';
import { box, dot, glow, halo, line, makeSheet, patternOn, shape, type Sheet } from '../art/sheet.ts';
import { ship } from '../art/ships.ts';
import type { Point2 } from '../overworld/ground.ts';
import { seeded } from '../seeded.ts';
import { depths } from './islandDepths.ts';
import { dungeon, patrol } from './islandScenes.ts';

/** A tile's scene: what kind of place it paints, its place's id (its seed), and its state. */
export interface Scene {
  readonly kind: 'island' | 'port' | 'playlist' | 'patrol' | 'dungeon' | 'depths';
  readonly id: string;
  /** An Elite Dungeon of the week's Abyss glows violet within. */
  readonly abyss?: boolean;
  /** A region's dungeon's style (`islandDepths.ts`) and the tier it is met at, 0 Normal to 2 Abyss. */
  readonly style?: string;
  readonly tier?: number;
  /** The island's own: its coast, its harbour and where the ship lies. */
  readonly chart?: { readonly outline: readonly Point2[]; readonly harbour: Point2 | null; readonly ship: Point2 };
}

/** Screen pixels across each texel of a scene. */
export const TEXEL = 2;
/** Where the Playlist's four crests stand over its night, as shares of the tile: the playlists above, the week's two
 *  below them. */
export const CREST_SPOTS: readonly Point2[] = [
  [0.22, 0.3],
  [0.68, 0.22],
  [0.4, 0.6],
  [0.84, 0.54],
];

/** A place's id as a seed. */
function seedOf(id: string): number {
  let state = 2_166_136_261;
  for (const code of id) state = Math.imul(state ^ (code.codePointAt(0) ?? 0), 16_777_619);
  return state >>> 0;
}

/** Overlook by night: its town stepping up the rock to the beacon, the quay's lanterns on the water, a ship at anchor. */
function port(sheet: Sheet, random: () => number): void {
  const { width, height } = sheet;
  const light = LIGHTS.night;
  const horizon = Math.round(height * 0.6);
  sky(sheet, light, horizon);
  stars(sheet, random, light, Math.round(width * 1.1), horizon - 12);
  moon(sheet, light, Math.round(width * 0.14), Math.round(height * 0.17), Math.max(4, Math.round(height * 0.06)));
  clouds(sheet, random, light, { top: Math.round(height * 0.28), depth: Math.round(height * 0.2), count: 3 });
  range(sheet, random, {
    ...{ left: 0, width: Math.round(width * 0.5), top: horizon - 7, foot: horizon, floor: horizon + 1 },
    ...{ ink: light.ranges[0] ?? '', rough: 0.5 },
  });
  const left = Math.round(width * 0.46);
  const lanterns = [left + 14, left + 34, left + 56].filter((x) => x < width - 4);
  sea(sheet, random, light, horizon, [
    { x: Math.round(width * 0.14), wide: 3, ink: '#6e7a8e', core: '#c8d0dc' },
    ...lanterns.map((x) => ({ x, wide: 4, ink: '#7a4416', core: '#d99a36', from: horizon + 9 })),
  ]);
  const island = { left, right: width + 30, top: Math.round(height * 0.14), waterline: horizon + 7, peak: 0.42 };
  const ground = isle(sheet, random, island);
  const summitAt = ground.slice(0, width - left).indexOf(Math.min(...ground.slice(0, width - left)));
  town(sheet, random, ground, left, [left + 6, width], horizon - 3);
  beacon(sheet, left + summitAt, Math.round(ground[summitAt] ?? island.top) + 2, Math.round(height * 0.17));
  quay(sheet, horizon + 6, [left + 4, width], lanterns);
  ship(sheet, Math.round(width * 0.24), horizon + Math.round(height * 0.16), Math.round(width * 0.2), {
    ...{ hull: '#04070d', wale: '#1c2a40', sail: '#3a4558', shade: '#283244', rig: '#0a101c', masts: 3 },
    ...{ facing: 1, furled: true, lantern: true, ports: '#c0802c', reflection: '#03060c' },
  });
}

/** The Playlist's night: crystal-dark, thick with stars, a pale nebula, and the dotted lines of the constellation its
 *  crests are set on. */
function playlist(sheet: Sheet, random: () => number): void {
  const { width, height } = sheet;
  const light = LIGHTS.crystal;
  sky(sheet, light, height);
  halo(sheet, Math.round(width * 0.55), Math.round(height * 0.45), Math.round(width * 0.42), [
    '#0e0a1c',
    '#160e2a',
    '#20123a',
  ]);
  stars(sheet, random, light, Math.round(width * 2.2), height);
  const spots = CREST_SPOTS.map(([x, y]): Point2 => [Math.round(x * width), Math.round(y * height)]);
  for (const [from, to] of [
    [0, 1],
    [0, 2],
    [1, 3],
    [2, 3],
  ] as const) {
    const [start, end] = [spots[from] ?? [0, 0], spots[to] ?? [0, 0]];
    const steps = Math.max(Math.abs(end[0] - start[0]), Math.abs(end[1] - start[1]));
    for (let step = 0; step <= steps; step += 1)
      if (step % 4 < 2)
        dot(
          sheet,
          start[0] + ((end[0] - start[0]) * step) / steps,
          start[1] + ((end[1] - start[1]) * step) / steps,
          '#8a6a3a',
        );
  }
  for (const [x, y] of spots) halo(sheet, x, y, Math.round(height * 0.22), ['#1c1430', '#2a1c40', '#3a2a4a']);
}

/** The square of how far the point (`x`, `y`) lies from the leg from (`fromX`, `fromY`) to (`toX`, `toY`). */
function offLegSquared(x: number, y: number, fromX: number, fromY: number, toX: number, toY: number): number {
  const alongX = toX - fromX;
  const alongY = toY - fromY;
  const length = alongX * alongX + alongY * alongY;
  const share = length > 0 ? Math.max(0, Math.min(1, ((x - fromX) * alongX + (y - fromY) * alongY) / length)) : 0;
  const apartX = x - fromX - share * alongX;
  const apartY = y - fromY - share * alongY;
  return apartX * apartX + apartY * apartY;
}

/** The cells a bucket of the coast's legs spans, so a cell measures only the legs near it. */
const BUCKET = 8;

/** How far each cell of a `width` by `height` sheet lies from the nearest leg of the closed `coast`: each leg kept in
 *  the buckets it passes (four numbers a leg), and each cell searching the rings of buckets round its own, until no
 *  farther ring could hold a nearer leg. The same distance as measuring every leg, a few legs a cell. */
export function offCoast(coast: readonly Point2[], width: number, height: number): Float64Array {
  const [columns, rows] = [Math.ceil(width / BUCKET), Math.ceil(height / BUCKET)];
  const buckets: number[][] = Array.from({ length: columns * rows }, () => []);
  const bucketOf = (value: number, most: number) => Math.max(0, Math.min(most - 1, Math.floor(value / BUCKET)));
  coast.forEach((from, place) => {
    const to = coast[(place + 1) % coast.length] ?? from;
    const [left, right] = [bucketOf(Math.min(from[0], to[0]), columns), bucketOf(Math.max(from[0], to[0]), columns)];
    const [top, bottom] = [bucketOf(Math.min(from[1], to[1]), rows), bucketOf(Math.max(from[1], to[1]), rows)];
    for (let row = top; row <= bottom; row++)
      for (let column = left; column <= right; column++)
        buckets[row * columns + column]?.push(from[0], from[1], to[0], to[1]);
  });
  const field = new Float64Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const [home, homeRow] = [bucketOf(x, columns), bucketOf(y, rows)];
      let nearest = Number.POSITIVE_INFINITY;
      // Kept squared while searching, its root taken once.
      const measure = (column: number, row: number) => {
        if (row < 0 || column < 0 || row >= rows || column >= columns) return;
        const legs = buckets[row * columns + column] ?? [];
        for (let leg = 0; leg < legs.length; leg += 4)
          nearest = Math.min(
            nearest,
            offLegSquared(x, y, legs[leg] ?? 0, legs[leg + 1] ?? 0, legs[leg + 2] ?? 0, legs[leg + 3] ?? 0),
          );
      };
      // A bucket `ring` rings out lies at least `ring - 1` buckets away: only each ring's edge is measured.
      const beyond = (ring: number) => ring === 0 || nearest > ((ring - 1) * BUCKET) ** 2;
      for (let ring = 0; ring <= Math.max(columns, rows) && beyond(ring); ring++) {
        for (let column = home - ring; column <= home + ring; column++) {
          measure(column, homeRow - ring);
          if (ring > 0) measure(column, homeRow + ring);
        }
        for (let row = homeRow - ring + 1; row <= homeRow + ring - 1; row++) {
          measure(home - ring, row);
          measure(home + ring, row);
        }
      }
      field[y * width + x] = Math.sqrt(nearest);
    }
  return field;
}

/** The island charted at night: its coast filled as land, shoals dithered round it, its crest lit from the north-west,
 *  its harbour's lantern and the ship. */
function island(sheet: Sheet, random: () => number, chart: Scene['chart']): void {
  const { width, height } = sheet;
  const light = LIGHTS.night;
  sea(sheet, random, light, 0);
  if (!chart || chart.outline.length < 3) return;
  const eastings = chart.outline.map((point) => point[0]);
  const southings = chart.outline.map((point) => point[1]);
  const [left, top, right, bottom] = [
    Math.min(...eastings),
    Math.min(...southings),
    Math.max(...eastings),
    Math.max(...southings),
  ];
  // The island laid in the tile's upper part, clear of the words at its foot.
  const room = { across: width * 0.84, down: height * 0.56 };
  const scale = Math.min(room.across / Math.max(1, right - left), room.down / Math.max(1, bottom - top));
  const [offsetX, offsetY] = [
    (width - (right - left) * scale) / 2,
    height * 0.08 + (room.down - (bottom - top) * scale) / 2,
  ];
  const onChart = ([x, y]: Point2): Point2 => [offsetX + (x - left) * scale, offsetY + (y - top) * scale];
  const coast = chart.outline.map(onChart);
  const field = offCoast(coast, width, height);
  const off = (x: number, y: number): number => field[y * width + x] ?? Number.POSITIVE_INFINITY;
  for (let row = 0; row < height; row++)
    for (let column = 0; column < width; column++) {
      const away = off(column, row);
      if (away < 7)
        dot(
          sheet,
          column,
          row,
          patternOn(column, row, 1 - away / 7)
            ? away < 3
              ? '#3a5a7a'
              : '#2a4262'
            : (sheet.cells[row * width + column] ?? ''),
        );
    }
  // The land rising inland in bands, dithered one into the next, a contour every few cells and its rock at the coast.
  const LAND = ['#1a2a24', '#22362a', '#2e4430', '#3e5236', '#56603e'];
  shape(sheet, coast, '#000001');
  for (let row = 0; row < height; row++)
    for (let column = 0; column < width; column++) {
      if (sheet.cells[row * width + column] !== '#000001') continue;
      const inland = off(column, row) / 3.5;
      const band = Math.min(LAND.length - 2, Math.floor(inland));
      dot(sheet, column, row, (patternOn(column, row, inland - band) ? LAND[band + 1] : LAND[band]) ?? '');
      if (Math.abs(inland - Math.round(inland)) < 0.12 && inland > 0.6 && (column + row) % 2 === 0)
        dot(sheet, column, row, '#5a6a4a');
      if (inland < 0.4 && (column + row) % 2 === 0) dot(sheet, column, row, '#6a7a8a');
    }
  coast.forEach((point, place) => {
    const next = coast[(place + 1) % coast.length] ?? point;
    line(sheet, point[0], point[1], next[0], next[1], '#5a6a8a');
  });
  if (chart.harbour) lantern(sheet, Math.round(onChart(chart.harbour)[0]), Math.round(onChart(chart.harbour)[1]), 8);
  const [shipX, shipY] = onChart(chart.ship).map(Math.round) as unknown as Point2;
  glow(sheet, shipX, shipY, 5, '#c8d0dc', 0.5);
  box(sheet, shipX - 1, shipY, 3, 1, '#efe8d6');
  dot(sheet, shipX, shipY - 1, '#efe8d6');
}

/** Darkens the scene's foot where its words are laid, dithered as its sky is, so they read over any scene. */
function foot(sheet: Sheet): void {
  const { width, height } = sheet;
  const from = Math.round(height * 0.62);
  for (let row = from; row < height; row++)
    for (let column = 0; column < width; column++)
      if (patternOn(column, row, ((row - from) / (height - from)) ** 0.8 * 0.95)) dot(sheet, column, row, DARK);
}

/** Paints `scene` on a sheet `width` by `height` texels. */
export function sceneSheet(scene: Scene, width: number, height: number): Sheet {
  const sheet = makeSheet(width, height);
  const random = seeded(seedOf(`${scene.kind}:${scene.id}`));
  if (scene.kind === 'port') port(sheet, random);
  else if (scene.kind === 'playlist') playlist(sheet, random);
  else if (scene.kind === 'patrol') patrol(sheet, random);
  else if (scene.kind === 'dungeon') dungeon(sheet, random, scene.abyss ?? false);
  else if (scene.kind === 'depths') depths(sheet, random, scene.style ?? 'crypt', scene.tier ?? 0);
  else island(sheet, random, scene.chart);
  foot(sheet);
  return sheet;
}
