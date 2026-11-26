import assert from 'node:assert/strict';
import { test } from 'node:test';
import { byId, fakeInterface, wordsIn } from '../ui/uiForTests.ts';
import type { Activities } from './activities.ts';
import { islandPanelNode, islandScreen } from './islandPanel.ts';
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
const FACTS = {
  activities: DRAWN,
  gates: null,
  named: (id: string) => (id === 'coral-halls' ? 'The Coral Halls' : id),
};

test('docked, the panel holds the port and the Playlist first, then the island’s places by kind, none of them on the map', () => {
  const panel = islandPanelOf(ISLAND, true, FACTS);
  assert.deepEqual([panel.title, panel.where, panel.band], ['Saltmere', 'Docked at Overlook', 'Levels 1 to 5']);
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
  assert.equal(rows['Moorings'], '2 ships moored by its pier');
  assert.equal(panel.port?.act.words, 'Land in its plaza');
  const banner = Object.fromEntries(panel.playlist?.rows ?? []);
  assert.equal(banner['Today'], 'Burn (Shadow)');
  assert.equal(banner['Elite of the week'], 'krakens-grotto, level 26');
  assert.equal(banner['Abyss of the week'], 'The Coral Halls, level 30');
  assert.deepEqual(
    panel.playlist?.crests.map((crest) => crest.kind),
    ['elite', 'abyss', 'week-elite', 'week-abyss'],
  );
  assert.equal(panel.playlist?.act.does, 'playlist');
});

test('a patrol zone’s snapshot: its levels, its dungeon of the day, resources, foes and the harder seas', () => {
  const patrol = entriesOf(islandPanelOf(ISLAND, true, FACTS)).find((entry) => entry.id === 'saltgrass-downs');
  assert.equal(patrol?.line, 'Patrol zone · Levels 1 to 5');
  const rows = Object.fromEntries(patrol?.rows ?? []);
  assert.equal(rows['Dungeons'], 'Three; its second is the dungeon of the day');
  assert.equal(rows['Resources'], '3 places: iron, herbs');
  assert.equal(rows['Foes'], '2 sites of the Grey Tithe');
  assert.deepEqual([rows['Elite seas'], rows['Abyss seas']], ['Levels 10 to 14', 'Levels 20 to 24']);
  assert.equal(rows["Today's modifier"], 'Burn (Shadow)');
});

test('an Elite Dungeon leads into its dungeon from the sea, saying whether it is one of the week’s; locked places say why', () => {
  const entries = entriesOf(islandPanelOf(ISLAND, true, FACTS));
  const dungeon = entries.find((entry) => entry.id === 'krakens-grotto');
  assert.deepEqual(dungeon?.act, { words: 'Go in from the sea', does: 'dungeon' });
  assert.equal(Object.fromEntries(dungeon?.rows ?? [])['Elite of the week'], 'Level 26, Brawler');
  const gated = entriesOf(
    islandPanelOf(ISLAND, true, {
      ...FACTS,
      gates: { eliteDungeon: 'Opens after the prologue.', seas: [null, null, null] } as never,
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

test('the panel opens the chosen entry to its details and its press; a click chooses, a second does what it does', () => {
  const panel = islandPanelOf(ISLAND, true, FACTS);
  const { ui, step } = fakeInterface(1280, 720);
  let chosen: string | null = null;
  const acted: IslandEntry[] = [];
  const acts = {
    choose: (id: string) => void (chosen = id),
    act: (entry: IslandEntry) => void acted.push(entry),
    back: () => undefined,
  };
  const root = () => islandPanelNode(ui, panel, chosen, null, acts);
  step(root);
  const shown = root();
  assert.ok(byId(shown, 'island:act:overlook-social'), 'the first open while none is chosen');
  assert.equal(byId(shown, 'island:act:saltgrass-downs'), undefined);
  assert.ok(wordsIn(shown).includes('Weaponsmith, Postmaster, the houses'));
  const click = (id: string) => {
    const box = ui.boxOf(id);
    assert.ok(box, id);
    const spot = { x: box.x + 4, y: box.y + 4 };
    step(root, [
      { kind: 'pointer', ...spot },
      { kind: 'down', ...spot, button: 0 },
      { kind: 'up', ...spot, button: 0 },
    ]);
  };
  click('island:saltgrass-downs');
  assert.equal(chosen, 'saltgrass-downs');
  step(root);
  click('island:act:saltgrass-downs');
  assert.deepEqual(
    acted.map((entry) => entry.id),
    ['saltgrass-downs'],
  );
  chosen = 'burned-mill';
  step(root);
  assert.equal(byId(root(), 'island:act:burned-mill')?.disabled, true, 'a locked place’s press is dim');
});

test('Enter does the chosen entry’s press, the first’s with none chosen: a landing, the dungeon’s card, the Playlist', () => {
  const done: string[] = [];
  let chosen: string | null = null;
  const screen = islandScreen({
    landmass: () => ISLAND as never,
    sea: () => ({ position: [0, 0], view: { docked: true } }) as never,
    chosen: () => chosen,
    facts: () => ({ activities: DRAWN, gates: null }),
    named: (id) => id,
    choose: (id) => void (chosen = id),
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
  assert.deepEqual(done, ['land overlook-social', 'dungeon krakens-grotto', 'playlist overlook']);
});
