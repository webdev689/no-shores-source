import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { mapWatersOf } from '../game/friendlyShips.ts';
import { sitesOf } from '../game/worldData.ts';
import { startWatersRules } from '../rules/watersRules.ts';
import { coastField } from './coastField.ts';
import { leastScale, type Rect, SCALE_MOST, stageOf, toInk, type View, zoomAt } from './heldMapLaw.ts';
import { HeldMapWaters, ruinedPlaces } from './heldMapWaters.ts';
import { landUnder } from './mapKey.ts';
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
} from './mapLayout.ts';

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

test('every word at a 1280 x 720 screen is at least 13 px tall, and grows with the screen', () => {
  const small = letterScale(stageOf({ width: 1280, height: 720 }).ink);
  assert.equal(small, 1);
  assert.ok(WORD_PX * small >= 13 && PORT_PX > WORD_PX, 'ports a step larger than every other word');
  const large = letterScale(stageOf({ width: 1920, height: 1080 }).ink);
  assert.ok(large > 1.45 && large < 1.6, `half again on a screen half again as large (${large})`);
  assert.equal(letterScale(stageOf({ width: 390, height: 844 }).ink), 1, 'never smaller on a small screen');
});

const ASK: LayoutAsk = {
  ink: { width: 600, height: 400, margin: 18 },
  scale: 1,
  covers: [],
  places: [],
  waters: [],
  ship: null,
  widthOf,
  land: () => false,
  key: null,
  current: null,
};

test('a name with no clear place is dropped by priority: a port before a water, a water before a ruin and a node', () => {
  const lettering = layOut({
    ...ASK,
    places: [
      { text: 'Hollow Barrow', x: 200, y: 100, kind: 'patrol', chosen: false },
      { text: 'Ruins of Elmhaven', x: 200, y: 100, kind: 'ruin', chosen: false },
      { text: 'Overlook', x: 200, y: 100, kind: 'port', chosen: false },
    ],
    waters: [{ text: 'The Lantern Sea, 1-4', x: 200, y: 100, colour: '#256327' }],
  });
  const named = Object.fromEntries(lettering.letters.map((letter) => [letter.text, letter.side]));
  assert.equal(named['Overlook'], 'right', 'the port takes the first place, right of its mark');
  assert.equal(named['Ruins of Elmhaven'], 'left', 'the ruin the other side');
  assert.equal(named['Hollow Barrow'], null, 'the node keeps its mark, its name dropped');
  assert.ok(named['The Lantern Sea, 1-4'] === 'centre', 'the water moves a line off her point');
  const water = lettering.letters.find((letter) => letter.kind === 'water');
  assert.notEqual(water?.y, 100);
});

test('a name runs right of its mark, and left where the right is the map’s edge', () => {
  const lettering = layOut({ ...ASK, places: [{ text: 'Windmere', x: 590, y: 200, kind: 'port', chosen: false }] });
  assert.equal(lettering.letters[0]?.side, 'left');
});

test('a water’s name under a hand moves inward clear of it rather than vanishing', () => {
  const cover = { x: 0, y: 150, width: 120, height: 80 };
  const lettering = layOut({
    ...ASK,
    covers: [cover],
    waters: [{ text: 'The Mistwrack, 16-19', x: 40, y: 190, colour: '#894314' }],
  });
  const water = lettering.letters[0];
  assert.ok(water, 'still named');
  const box = nameBox(water, 'centre', widthOf(water.text, 'water'), 1);
  assert.ok(!overlaps(box, cover), 'clear of the hand');
});

test('the key yields to nothing but land, marks, hands and ports’ names: with no corner clear it drops the lesser names under it', () => {
  const crowded = layOut({
    ...ASK,
    ink: { width: 300, height: 200, margin: 4 },
    key: { width: 120, height: 80, row: 500 },
    waters: [
      { text: 'Fen', x: 60, y: 160, colour: '#256327' },
      { text: 'Rime', x: 240, y: 160, colour: '#256327' },
      { text: 'Gilt', x: 60, y: 40, colour: '#256327' },
      { text: 'Cairn', x: 240, y: 40, colour: '#256327' },
    ],
  });
  assert.equal(crowded.key?.corner, 'lower-left');
  assert.deepEqual(
    crowded.letters.map((letter) => letter.text),
    ['Rime', 'Gilt', 'Cairn'],
  );
});
