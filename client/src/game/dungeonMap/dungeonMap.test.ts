import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DungeonLayout } from '../dungeonLayout.ts';
import { DungeonMap } from './dungeonMap.ts';
import { ORBIT } from './mapCamera.ts';
import { REVEAL } from './mapReveal.ts';
import { STOREYED } from './mapStoreys.test.ts';

const layout = {
  ...STOREYED,
  arrival: { x: 1.6, y: 1.6, bearing: 0 },
  portal: { x: 18, y: 1.6, side: 0, width: 2, height: 3 },
  rooms: [{ storey: 0 }, { storey: 1 }],
  end: 1,
} as unknown as DungeonLayout;
const paper = { width: 800, height: 600 };
const you = { feet: [1.6, 1.6, 0] as const, facing: Math.PI / 2, name: 'You' };

function walking(): DungeonMap {
  const map = new DungeonMap();
  map.enter('test dungeon', layout);
  map.tick(you, REVEAL.everyS);
  map.frame(0, paper, []);
  return map;
}

test('the map is shut until its key opens it, and takes every key only while it is up', () => {
  const map = walking();
  assert.equal(map.open, false);
  assert.equal(map.key('q', ['n']), false);
  map.toggle();
  assert.equal(map.open, true);
  assert.equal(map.key('w', ['n']), true, 'a key the map does not use still goes nowhere');
  map.key('n', ['n']);
  assert.equal(map.open, false);
});

test('it opens at rest over the player storey, fitting what is explored, with the way in and the player marked', () => {
  const map = walking();
  map.toggle();
  const shown = map.frame(0, paper, []);
  assert.ok(shown);
  assert.equal(shown.storey, 0);
  assert.equal(shown.view.yaw, ORBIT.yawRest);
  assert.equal(shown.view.pitch, ORBIT.pitchRest);
  const player = shown.marks.find((mark) => mark.kind === 'player');
  assert.ok(player && player.x > 0 && player.x < 800 && player.y > 0 && player.y < 600, 'the player on the paper');
  assert.ok(shown.marks.some((mark) => mark.kind === 'wayIn'));
  assert.ok(
    shown.marks.some((mark) => mark.kind === 'stairs'),
    'the flight was seen',
  );
});

test('the storey keys step the cut a storey at a time, and Home goes back to the player', () => {
  const map = walking();
  map.toggle();
  map.key('pagedown', []);
  let shown = map.frame(10, paper, []);
  assert.equal(shown?.storey, 1);
  assert.equal(shown?.view.centre[2], -8, 'cut over the storey under');
  assert.equal(shown?.marks.find((mark) => mark.kind === 'player')?.faint, true, 'the player is on another storey');
  map.key('pagedown', []);
  assert.equal(map.frame(0, paper, [])?.storey, 1, 'never past the deepest');
  map.key('home', []);
  shown = map.frame(10, paper, []);
  assert.equal(shown?.storey, 0);
  map.key('l', []);
  assert.equal(map.frame(0, paper, [])?.every, true);
});

test('the pointer names the mark it is over', () => {
  const map = walking();
  map.toggle();
  const player = map.frame(0, paper, [])?.marks.find((mark) => mark.kind === 'player');
  map.pointerMove((player?.x ?? 0) + 3, (player?.y ?? 0) + 3);
  const named = map.frame(0, paper, [])?.marks.find((mark) => mark.name !== null);
  assert.equal(named?.name, 'You');
});

test('E turns the view an eighth, eased there', () => {
  const map = walking();
  map.toggle();
  map.key('e', []);
  const shown = map.frame(10, paper, []);
  assert.ok(Math.abs((shown?.view.yaw ?? 0) - (ORBIT.yawRest + Math.PI / 4)) < 1e-6);
});

test('cells found are kept within a few seconds, whether or not the map is looked at', () => {
  const kept = new Map<string, string>();
  const storage = {
    getItem: (key: string) => kept.get(key) ?? null,
    setItem: (key: string, value: string) => void kept.set(key, value),
  };
  Object.assign(globalThis, { localStorage: storage });
  try {
    const map = walking();
    map.frame(0, paper, []);
    void map.dungeon;
    for (let read = 0; read < 20; read++) map.tick(you, REVEAL.everyS);
    assert.ok([...kept.values()].some((value) => value.includes('test dungeon')));
  } finally {
    Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('the ink is told each cell walked or seen and each flight cell', () => {
  const map = walking();
  const words = map.dungeon?.words;
  assert.equal(words?.[0], 1, 'walked');
  assert.equal(words?.[2], 3, 'a flight cell seen');
  assert.equal(words?.[6], 0, 'rock');
});
