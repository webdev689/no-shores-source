import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { startRoomDoor } from '../roomDoor.ts';
import {
  ELITE_DUNGEONS,
  PLAYLISTS,
  playlistBand,
  playlistFoesAt,
  playlistOf,
  playlistRun,
  playlistShut,
} from './playlists.ts';

const wasm = await readFile(
  new URL('../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url),
).catch(() => {
  throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
});
const door = startRoomDoor(new WebAssembly.Module(wasm));
const drawn = JSON.parse(door.activities(29_919_420)) as {
  playlists: { key: string; opens: number; bands: [number, number, number][] }[];
  elites: string[];
};

test('the finder’s playlists agree with the rules: their levels, their bands and the 18 Elite Dungeons', () => {
  assert.deepEqual([...ELITE_DUNGEONS], drawn.elites);
  for (const { key, opens, bands } of drawn.playlists) {
    const playlist = playlistOf(`playlist-${key}`);
    assert.ok(playlist !== null, key);
    assert.equal(PLAYLISTS[playlist].opens, opens);
    for (const [band, [first, last, foesAt]] of bands.entries()) {
      assert.equal(playlistFoesAt(playlist, band), foesAt, `${key} band ${band}`);
      for (let level = first; level <= last; level += 1) assert.equal(playlistBand(playlist, level), band);
    }
    assert.equal(playlistBand(playlist, opens - 1), null, `${key} below its level`);
  }
});

test('a playlist’s run is an Elite Dungeon at its tier with its band’s foes’ level, and every other base is no playlist', () => {
  assert.equal(
    playlistRun('abyss', 2, () => 17, 'zzzzzzzz'),
    'node-brine-catacombs--abyss--playlist-32--run-zzzzzzzz',
  );
  assert.equal(
    playlistRun('elite', 0, () => 0, 'k3j4h5g6'),
    'node-krakens-grotto--elite--playlist-12--run-k3j4h5g6',
  );
  assert.deepEqual([playlistBand('elite', 30), playlistBand('elite', 40), playlistBand('abyss', 29)], [4, 4, 1]);
  assert.equal(playlistShut('abyss'), 'The Abyss Playlist opens at level 20.');
  for (const base of ['playlist-normal', 'node-krakens-grotto', 'playlist-elite--elite'])
    assert.equal(playlistOf(base), null);
});
