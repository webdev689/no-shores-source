import assert from 'node:assert/strict';
import { test } from 'node:test';
import { byId, fakeInterface, wordsIn } from '../ui/uiForTests.ts';
import { sidesOf } from '../ui/layout.ts';
import type { Activities, Gates } from './activities.ts';
import { TEXEL } from './islandArt.ts';
import { gridOf, islandPanelNode, islandScreen } from './islandPanel.ts';
import { entriesOf, type IslandEntry, islandPanelOf } from './islandWords.ts';
import type { NodeInfo } from './worldData.ts';

const WHERE = { continent: 'continent-1', ring: [], spawns: [], centre: [0, 0] as const };
const node = (id: string, kind: NodeInfo['kind'], name: string, more: object = {}) =>
  ({ ...WHERE, id, kind, name, ...more }) as unknown as NodeInfo;
const NODES = [
  node('overlook-social', 'social', 'Overlook', {
    stations: [{ kind: 'weaponsmith' }, { kind: 'mail' }, { kind: 'veiled' }],
  }),
  node('saltgrass-downs', 'patrol', 'The Saltgrass Downs', {
    resources: [{ at: [0, 0], holds: 'iron' }, { at: [0, 0], holds: 'herbs' }, { at: [0, 0] }],
    foes: [
      [0, 0],
      [1, 1],
    ],
  }),
  node('krakens-grotto', 'dungeon', "Kraken's Grotto"),
  node('burned-mill', 'mission', 'The Burned Mill', { locked: true }),
  node('maw', 'boss', 'The Maw of the Shallows'),
  node('tern-strand', 'outpost', 'Tern Strand'),
];
const ISLAND = {
  id: 'continent-1',
  plan: {
    id: 'overlook',
    name: 'Overlook',
    harbour: [0, 0],
    ruined: false,
    social: {
      moorings: [
        [0, 0, 0],
        [1, 1, 0],
      ],
    },
  },
  nodes: NODES,
  outline: [
    [-500, -500],
    [500, -500],
    [500, 500],
    [-500, 500],
  ],
} as unknown as Parameters<typeof islandPanelOf>[0] & { outline: readonly (readonly [number, number])[] };

/** The day's and week's draws as the panel reads them. */
const DRAWN = {
  ofTheDay: [{ continent: 'continent-1', patrol: 'saltgrass-downs', number: 1 }],
  dayModifier: 'burn-shadow',
  weekElite: { place: 'krakens-grotto', modifiers: ['brawler'], level: 26, opens: 24 },
  weekAbyss: { place: 'coral-halls', modifiers: [], level: 30, opens: 28 },
  bands: {
    'continent-1': [
      [1, 5],
      [10, 14],
      [20, 24],
    ],
  },
  modifiers: { 'burn-shadow': { name: 'Burn (Shadow)', words: '' }, brawler: { name: 'Brawler', words: '' } },
} as unknown as Activities;
/** A character's gates with every place open. */
const OPEN: Gates = {
  day: [null, null, null],
  eliteDungeon: null,
  weekElite: null,
  weekAbyss: null,
  seas: [null, null, null],
  playlists: [null, null],
};
const FACTS = {
  activities: DRAWN,
  gates: null,
  named: (id: string) => (id === 'coral-halls' ? 'The Coral Halls' : id),
};

test('docked, the tiles hold the port and the Playlist first, then the island’s places by kind, none of them on the map', () => {
  const panel = islandPanelOf(ISLAND, true, FACTS);
  assert.deepEqual([panel.title, panel.where, panel.levels], ['Saltmere', 'Docked at Overlook', 'Lv 1–5']);
  assert.deepEqual(
    entriesOf(panel).map((entry) => entry.id),
    ['overlook-social', 'overlook-playlist', 'saltgrass-downs', 'krakens-grotto', 'burned-mill', 'maw', 'tern-strand'],
  );
  assert.deepEqual(
    panel.groups.map((group) => group.title),
    ['Patrol zones', 'Elite Dungeons', 'Missions', 'World boss', 'Outpost'],
  );
  const ashore = islandPanelOf(ISLAND, false, FACTS);
  assert.deepEqual([ashore.port, ashore.playlist, ashore.where], [null, null, 'Ashore on the coast of Saltmere']);
});

test('the port’s snapshot names its counters and moorings; the Playlist’s banner what is on today and this week', () => {
  const panel = islandPanelOf(ISLAND, true, FACTS);
  const rows = Object.fromEntries(panel.port?.rows ?? []);
  assert.equal(rows['Counters'], 'Weaponsmith, Postmaster, the houses');
  assert.equal(rows['Moorings'], '2 ships by its pier');
  assert.equal(panel.port?.act.words, 'Land in its plaza');
  const banner = Object.fromEntries(panel.playlist?.rows ?? []);
  assert.equal(banner['Today'], 'Burn (Shadow)');
  assert.equal(banner["Week's Elite"], 'krakens-grotto, level 26');
  assert.equal(banner["Week's Abyss"], 'The Coral Halls, level 30');
  assert.deepEqual(
    panel.playlist?.crests.map((crest) => crest.kind),
    ['elite', 'abyss', 'week-elite', 'week-abyss'],
  );
  assert.equal(panel.playlist?.act.does, 'playlist');
});

test('the Playlist’s crests are shut on its tile as on the screen it opens: each playlist and week by its gate', () => {
  const gates = { ...OPEN, playlists: [null, 'Opens at level 24'], weekAbyss: 'Opens at level 24' };
  const panel = islandPanelOf(ISLAND, true, { ...FACTS, gates });
  assert.deepEqual(
    panel.playlist?.crests.map((crest) => [crest.kind, crest.shut]),
    [
      ['elite', false],
      ['abyss', true],
      ['week-elite', false],
      ['week-abyss', true],
    ],
  );
});

test('a patrol zone’s snapshot: its levels, its dungeon of the day, resources, foes and the harder seas', () => {
  const patrol = entriesOf(islandPanelOf(ISLAND, true, FACTS)).find((entry) => entry.id === 'saltgrass-downs');
  assert.equal(patrol?.line, 'Patrol zone · Levels 1 to 5');
  const rows = Object.fromEntries(patrol?.rows ?? []);
  assert.equal(rows['Dungeons'], "Three; today's is second");
  assert.equal(rows['Resources'], '3 places: iron, herbs');
  assert.equal(rows['Foes'], '2 sites of the Grey Tithe');
  assert.deepEqual([rows['Elite seas'], rows['Abyss seas']], ['Levels 10 to 14', 'Levels 20 to 24']);
  assert.equal(rows['Today'], 'Burn (Shadow)');
  assert.deepEqual(
    patrol?.glyphs.map((glyph) => [glyph.icon, glyph.says]),
    [
      ['dungeon', 'Dungeon of the day: its second'],
      ['seas-elite', 'Elite seas: Levels 10 to 14'],
      ['seas-abyss', 'Abyss seas: Levels 20 to 24'],
      ['burn', 'Burn (Shadow)'],
    ],
  );
  assert.equal(patrol?.levels, 'Lv 1–5');
});

test('an Elite Dungeon leads into its dungeon from the sea, saying whether it is one of the week’s; locked places say why', () => {
  const entries = entriesOf(islandPanelOf(ISLAND, true, FACTS));
  const dungeon = entries.find((entry) => entry.id === 'krakens-grotto');
  assert.deepEqual(dungeon?.act, { words: 'Go in from the sea', does: 'dungeon' });
  assert.equal(Object.fromEntries(dungeon?.rows ?? [])['This week'], 'Elite, level 26, Brawler');
  const gated = entriesOf(
    islandPanelOf(ISLAND, true, {
      ...FACTS,
      gates: { ...OPEN, eliteDungeon: 'Opens after the prologue.' },
    }),
  );
  assert.equal(gated.find((entry) => entry.id === 'krakens-grotto')?.shut, 'Opens after the prologue.');
  const mill = entries.find((entry) => entry.id === 'burned-mill');
  assert.deepEqual([mill?.shut, mill?.line], ['The Burned Mill is locked', 'The Burned Mill is locked']);
  const unread = entriesOf(islandPanelOf(ISLAND, true, { ...FACTS, activities: null }));
  assert.equal(
    unread.find((entry) => entry.id === 'maw')?.line,
    'World boss',
    'before the draws are read, its kind alone',
  );
});

test('the grid lays even tiles with room between them, up to five a row, three rows to the view', () => {
  assert.deepEqual(gridOf(1280, 720), { columns: 4, tile: { width: 294, height: 186 } });
  assert.deepEqual(gridOf(1920, 1080), { columns: 5, tile: { width: 340, height: 220 } });
  assert.deepEqual(gridOf(700, 720).columns, 2);
  assert.equal(gridOf(1280, 500).tile.height, 176, 'never shorter than its details need; the grid scrolls');
});

/** The tiles laid on a 1280 by 720 view: what a click on `id` did, and what it chose on its way. */
function clicked(id: string, chosen: string | null = null) {
  const panel = islandPanelOf(ISLAND, true, FACTS);
  const { ui, step } = fakeInterface(1280, 720);
  const heard: string[] = [];
  const acts = {
    choose: (entry: string) => void heard.push(`choose ${entry}`),
    act: (entry: IslandEntry) => void heard.push(`act ${entry.id}`),
    back: () => void heard.push('back'),
  };
  let node = islandPanelNode(ui, panel, chosen, null, acts);
  const root = () => (node = islandPanelNode(ui, panel, chosen, null, acts));
  step(root);
  const box = ui.boxOf(id);
  assert.ok(box, id);
  const spot = { x: box.x + 4, y: box.y + 4 };
  step(root, [
    { kind: 'pointer', ...spot },
    { kind: 'down', ...spot, button: 0 },
    { kind: 'up', ...spot, button: 0 },
  ]);
  return { heard, node, ui };
}

test('every tile is the same size, and a click on one does what it does, the Playlist’s opening the Playlist', () => {
  const { node, ui, heard } = clicked('island:overlook-playlist');
  assert.ok(heard.includes('act overlook-playlist'), heard.join());
  const sizes = new Set(
    ['island:island', 'island:overlook-social', 'island:saltgrass-downs', 'island:maw', 'island:tern-strand'].map(
      (id) => `${ui.boxOf(id)?.width}x${ui.boxOf(id)?.height}`,
    ),
  );
  assert.deepEqual([...sizes], ['294x186']);
  const [port, playlist] = [ui.boxOf('island:overlook-social'), ui.boxOf('island:overlook-playlist')];
  assert.ok(port && playlist && playlist.x - (port.x + port.width) === 16, 'room between each');
  const patrolTile = byId(node, 'island:saltgrass-downs');
  assert.deepEqual(wordsIn(patrolTile ?? node), ['The Saltgrass Downs', 'Lv 1–5'], 'its name and levels alone');
  assert.match(patrolTile?.label ?? '', /Dungeons: Three; today's is second/, 'its details read out');
  assert.ok(byId(node, 'island:back'));
});

test('each scene is painted at the box it is drawn in, a texel two pixels across, its crests over its own lines', () => {
  const { ui } = clicked('island:island');
  const scenes = ui.laid.filter((each) => each.node.picture?.key.startsWith('island scene') === true);
  assert.equal(scenes.length, 8, 'the island’s own and its seven places');
  for (const { node, box } of scenes) {
    const [top, right, bottom, left] = sidesOf(node.padding);
    const drawn = [box.width - left - right, box.height - top - bottom];
    const { width, height } = node.picture?.pixel ?? { width: 0, height: 0 };
    assert.deepEqual(drawn, [width * TEXEL, height * TEXEL], node.picture?.key);
  }
});

test('a press dragged off one tile onto another lights the one under the pointer, and holds it lit', () => {
  const panel = islandPanelOf(ISLAND, true, FACTS);
  const { ui, step } = fakeInterface(1280, 720);
  let chosen: string | null = null;
  const chose: string[] = [];
  const acts = {
    choose: (entry: string) => void chose.push((chosen = entry)),
    act: () => undefined,
    back: () => undefined,
  };
  const root = () => islandPanelNode(ui, panel, chosen, null, acts);
  step(root);
  const [from, to] = [ui.boxOf('island:saltgrass-downs'), ui.boxOf('island:krakens-grotto')];
  assert.ok(from && to);
  const [a, b] = [
    { x: from.x + 8, y: from.y + 8 },
    { x: to.x + 8, y: to.y + 8 },
  ];
  step(root, [{ kind: 'pointer', ...a }, { kind: 'down', ...a, button: 0 }, { kind: 'pointer', ...b }]);
  step(root, [{ kind: 'up', ...b, button: 0 }]);
  chose.length = 0;
  for (let frame = 0; frame < 4; frame += 1) step(root);
  assert.deepEqual(chose, chosen === 'krakens-grotto' ? [] : ['krakens-grotto'], 'the tile under the pointer');
  assert.equal(chosen, 'krakens-grotto');
});

test('the island’s own tile names its levels at Normal; a shut tile’s label says why once', () => {
  const { node } = clicked('island:island');
  assert.deepEqual(wordsIn(byId(node, 'island:island') ?? node).slice(0, 2), ['Saltmere', 'Lv 1–5'], 'its levels');
  const label = byId(node, 'island:burned-mill')?.label ?? '';
  assert.equal(label.split('The Burned Mill is locked').length - 1, 1, label);
});

test('a shut tile does nothing; the pointer on a tile lights it for Enter', () => {
  assert.deepEqual(
    clicked('island:burned-mill').heard.filter((said) => said.startsWith('act')),
    [],
  );
  assert.deepEqual(clicked('island:maw').heard, ['act maw', 'choose maw'], 'once');
  assert.deepEqual(
    clicked('island:maw', 'maw').heard.filter((said) => said.startsWith('choose')),
    [],
    'lit already',
  );
});

test('Enter does the lit tile’s press, the first’s with none lit: a landing chosen first, the dungeon’s card, the Playlist', () => {
  const done: string[] = [];
  let chosen: string | null = null;
  const screen = islandScreen({
    landmass: () => ISLAND as never,
    sea: () => ({ position: [0, 0], view: { docked: true } }) as never,
    chosen: () => chosen,
    facts: () => ({ activities: DRAWN, gates: null }),
    named: (id) => id,
    choose: (id) => {
      chosen = id;
      done.push(`choose ${id}`);
    },
    back: () => undefined,
    does: {
      land: (id) => void done.push(`land ${id}`),
      dungeon: (found) => void done.push(`dungeon ${found.id}`),
      playlist: (city) => void done.push(`playlist ${city}`),
    },
  });
  screen.act(null);
  screen.act('krakens-grotto');
  screen.act('overlook-playlist');
  screen.act('burned-mill');
  screen.act('nowhere');
  // The flow lands only at the node chosen, so a landing chooses its node first.
  assert.deepEqual(done, [
    'choose overlook-social',
    'land overlook-social',
    'dungeon krakens-grotto',
    'playlist overlook',
  ]);
});
