import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Activities } from '../activities.ts';
import type { BreachPlan } from '../breachPlan.ts';
import { nodeOfRoom } from '../rooms.ts';
import { testEntries } from './testRuns.ts';

const playlist = (key: 'elite' | 'abyss', name: string, top: number) => ({
  key,
  name,
  tier: key === 'elite' ? 1 : 2,
  opens: 10,
  bands: [
    [10, 14, 12],
    [25, 30, top],
  ] as const,
  modifiers: [],
  weekClears: 3,
  weekEssence: 2,
  weekVestiges: 1,
});

const DRAWN = {
  playlists: [playlist('elite', 'Elite Playlist', 32), playlist('abyss', 'Abyss Playlist', 32)],
  elites: ['krakens-grotto', 'pearl-tomb'],
  weekElite: { place: 'cinder-deep', modifiers: [], level: 30, opens: 24 },
  weekAbyss: { place: 'silt-barrows', modifiers: [], level: 32, opens: 26 },
} as unknown as Activities;
const PLAN = { name: 'The Drowned Vale', zone: 'saltgrass-downs' } as BreachPlan;
const names: Record<string, string> = {
  'cinder-deep': 'The Cinder Deep',
  'silt-barrows': 'The Silt Barrows',
  'saltgrass-downs': 'Saltgrass Downs',
};

test('the six entries in the Playlist order, named by the rules, each launching its own test room', () => {
  const entries = testEntries(
    DRAWN,
    PLAN,
    (id) => names[id] ?? id,
    (count) => count - 1,
  );
  assert.deepEqual(
    entries.map((entry) => [entry.kind, entry.name, entry.about, entry.room('ab12cd34')]),
    [
      [
        'elite',
        'Elite Playlist',
        'An Elite Dungeon drawn as it starts · Foes at level 32',
        'node-pearl-tomb--elite--playlist-32--test-ab12cd34',
      ],
      [
        'abyss',
        'Abyss Playlist',
        'An Elite Dungeon drawn as it starts · Foes at level 32',
        'node-pearl-tomb--abyss--playlist-32--test-ab12cd34',
      ],
      [
        'week-elite',
        'Elite Dungeon of the week',
        'The Cinder Deep · Foes at level 30',
        'node-cinder-deep--elite--test-ab12cd34',
      ],
      [
        'week-abyss',
        'Abyss Dungeon of the week',
        'The Silt Barrows · Foes at level 32',
        'node-silt-barrows--abyss--test-ab12cd34',
      ],
      [
        'breach-normal',
        'The Drowned Vale · Normal',
        'From the gate in a copy of Saltgrass Downs of its own',
        'node-saltgrass-downs--breach-normal--test-ab12cd34',
      ],
      [
        'breach-hard',
        'The Drowned Vale · Hard',
        'From the gate in a copy of Saltgrass Downs of its own',
        'node-saltgrass-downs--breach-hard--test-ab12cd34',
      ],
    ],
  );
  for (const entry of entries) assert.equal(nodeOfRoom(entry.room('ab12cd34'))?.test, true, entry.name);
});

test('without the Breach read, its two are left out', () => {
  assert.deepEqual(
    testEntries(
      DRAWN,
      null,
      (id) => id,
      () => 0,
    ).map((entry) => entry.kind),
    ['elite', 'abyss', 'week-elite', 'week-abyss'],
  );
});
