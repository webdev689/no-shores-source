import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { coastField } from '../heldmap/coastField.ts';
import { leastScale, type Rect, SCALE_MOST, stageOf, toInk, type View, zoomAt } from '../heldmap/heldMapLaw.ts';
import { HeldMapWaters, ruinedPlaces } from '../heldmap/heldMapWaters.ts';
import { landUnder } from '../heldmap/mapKey.ts';
import {
  handsCover,
  type LayoutAsk,
  layOut,
  letterScale,
  type Lettering,
  markBox,
  nameBox,
  PORT_PX,
  WORD_PX,
} from '../heldmap/mapLayout.ts';
import { startWatersRules } from '../rules/watersRules.ts';
import { mapWatersOf } from './friendlyShips.ts';
import { sitesOf } from './worldData.ts';

// The held map's lettering laid out on the real world, as the game hands it the waters the rules open (mapLayout.ts).
const WORLD = { width: 4_915_200, height: 3_072_000 } as const;
/** A word's width in the map's face, units: Pixelify's letters are a little over half their size wide, taken wide. */
const widthOf = (text: string, kind: string) => text.length * 0.62 * (kind === 'port' ? PORT_PX : WORD_PX);
const KEY = { width: 190, height: 92, row: 520 } as const;

const overlaps = (one: Rect, other: Rect) =>
  one.x < other.x + other.width &&
  other.x < one.x + one.width &&
  one.y < other.y + other.height &&
  other.y < one.y + one.height;

/** The real world: every island, port and node discovered, the waters as the rules open them, all charted. */
async function realWorld() {
  const world = new URL('../../../content/world/', import.meta.url);
  const layoutText = await readFile(new URL('layout.json', world), 'utf8');
  const layout = JSON.parse(layoutText) as { continents: { id: string; outline: [number, number][] }[] };
  const cities = [];
  const nodes = [];
  for (const continent of layout.continents) {
    const sites = sitesOf(continent.id, await readFile(new URL(`land/${continent.id}.json`, world), 'utf8'));
    if (sites.city) cities.push(sites.city);
    nodes.push(...sites.nodes);
  }
  const bytes = await readFile(
    new URL('../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url),
  );
  const rules = startWatersRules(new WebAssembly.Module(bytes));
  const table = rules.open(layoutText, cities);
  const waters = new HeldMapWaters(mapWatersOf(table, rules.grid(4_800)));
  const columns = WORLD.width / 4_800;
  const rows = WORLD.height / 4_800;
  waters.chart(new Uint8Array(columns * rows).fill(1));
  const field = coastField(
    layout.continents.map((continent) => continent.outline),
    columns,
    rows,
    4_800,
  );
  const places = ruinedPlaces(
    [
      ...cities.map((city) => ({
        id: `${city.id}-port`,
        name: city.name,
        kind: 'port',
        at: city.centre,
        sail: city.centre,
      })),
      ...nodes.map((node) => ({ id: node.id, name: node.name, kind: node.kind, at: node.centre, sail: node.centre })),
    ],
    waters.waters.mainPorts,
  );
  return { waters, field, places, known: (1 << layout.continents.length) - 1 };
}

/** The map's lettering for a screen and a view, as the held map asks for it. */
function lettered(screen: { width: number; height: number }, view: View, real: Awaited<ReturnType<typeof realWorld>>) {
  const stage = stageOf(screen);
  const ink = stage.ink;
  const onMap = (x: number, y: number) => x >= 0 && y >= 0 && x <= ink.width && y <= ink.height;
  const places = real.places
    .map((place) => {
      const [x, y] = toInk(view, place.at[0], place.at[1]);
      return { text: place.name, x, y, kind: place.kind, chosen: false };
    })
    .filter((place) => onMap(place.x, place.y));
  const [shipX, shipY] = toInk(view, 2_809_214, 1_206_000);
  const ask: LayoutAsk = {
    ink: { width: ink.width, height: ink.height, margin: 18 },
    scale: letterScale(ink),
    covers: handsCover(stage.sprite, ink),
    places,
    waters: real.waters.letters(ink, (x, y) => toInk(view, x, y)),
    ship: onMap(shipX, shipY) ? { x: shipX, y: shipY, heading: 1 } : null,
    widthOf,
    land: (box) => landUnder(real.field, real.known, view, box),
    key: KEY,
    current: null,
  };
  return { ask, lettering: layOut(ask) };
}

/** Every box the lettering covers: each name's and each mark's, and the key's. */
function boxesOf(ask: LayoutAsk, lettering: Lettering) {
  const names = lettering.letters.flatMap((letter) =>
    letter.side
      ? [{ letter, box: nameBox(letter, letter.side, widthOf(letter.text, letter.kind), lettering.scale) }]
      : [],
  );
  const marks = ask.places.map((place) => markBox(place.kind, place.x, place.y, lettering.scale));
  if (ask.ship) marks.push(markBox('ship', ask.ship.x, ask.ship.y, lettering.scale));
  return { names, marks };
}

const SCREENS = [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
  { width: 390, height: 844 },
];
/** Overlook, the crowded east and the far north-west. */
const CENTRES: readonly [number, number][] = [
  [2_809_214, 1_201_477],
  [3_900_000, 1_350_000],
  [947_280, 183_566],
];

test('on the real world at five zooms no name overlaps another or a mark, and each keeps inside the clear map', async () => {
  const real = await realWorld();
  let named = 0;
  for (const screen of SCREENS) {
    const ink = stageOf(screen).ink;
    const least = leastScale(ink, WORLD);
    for (let zoom = 0; zoom < 5; zoom++) {
      const scale = least * (SCALE_MOST / least) ** (zoom / 4);
      for (const [x, y] of CENTRES) {
        const view = zoomAt(
          { left: x - ink.width / 2 / scale, top: y - ink.height / 2 / scale, scale },
          0,
          0,
          1,
          ink,
          WORLD,
        );
        const { ask, lettering } = lettered(screen, view, real);
        const { names, marks } = boxesOf(ask, lettering);
        const where = `${screen.width} x ${screen.height}, zoom ${zoom}, at ${x}, ${y}`;
        named += names.length;
        names.forEach(({ letter, box }, index) => {
          const what = `${letter.text} (${where})`;
          assert.ok(
            box.x >= 0 && box.y >= 0 && box.x + box.width <= ink.width && box.y + box.height <= ink.height,
            `${what} keeps inside the map`,
          );
          for (const cover of ask.covers) assert.ok(!overlaps(box, cover), `${what} is not under a hand`);
          for (const mark of marks) assert.ok(!overlaps(box, mark), `${what} covers no mark`);
          for (const other of names.slice(index + 1))
            assert.ok(!overlaps(box, other.box), `${what} and ${other.letter.text}`);
          if (lettering.key) assert.ok(!overlaps(box, lettering.key.box), `${what} is not under the key`);
        });
        const key = lettering.key;
        if (key && key.corner !== 'margin') {
          assert.ok(!ask.land(key.box), `the key covers no land (${where})`);
          for (const box of [...marks, ...ask.covers])
            assert.ok(!overlaps(key.box, box), `the key covers no mark or hand (${where})`);
        }
      }
    }
  }
  assert.ok(named > 100, `the world's places are named across the views (${named})`);
});
