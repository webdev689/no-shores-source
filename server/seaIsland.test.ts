import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { RoomDoor } from './roomDoor.ts';
import { behindDoor, openIsland } from './seaIsland.ts';

/** The dungeon behind island 7's door, by its name at Normal, as the sea names it. */
const DUNGEON = 'sea-dungeon-continent-4-caverns-0a1b2c3d';

/** The one sea, holding island 7 of seed 255 and its dungeon, and every sea asked of them, by name. */
function theSea() {
  const asked: string[] = [];
  const seas = (sea: string) => {
    asked.push(sea);
    const holds = sea === 'sea';
    return {
      islandWord: (id: number) => Promise.resolve(holds && id === 7 ? '{"seed":"255"}' : ''),
      dungeonWord: (room: string) => Promise.resolve(holds && room === DUNGEON ? '{"id":7,"seed":"255"}' : ''),
    };
  };
  return { asked, seas };
}

/** An island's room that opens on any word, keeping each tier it is set to. */
function islandRoom() {
  const tiers: number[] = [];
  const room = {
    openIsland: () => true,
    checkLandings: () => true,
    difficulty: (seas: number) => tiers.push(seas) > 0,
    reseed: () => true,
  } as unknown as RoomDoor;
  return { room, tiers };
}

test('an island landed at Elite or Abyss is asked of the one sea, and its room opens at that tier', async () => {
  for (const [name, tier] of [
    ['7-00000000000000ff', 0],
    ['7-00000000000000ff--elite', 1],
    ['7-00000000000000ff--abyss', 2],
  ] as const) {
    const { asked, seas } = theSea();
    const { room, tiers } = islandRoom();
    const opened = await openIsland(room, name, seas);
    assert.deepEqual(opened, { island: { id: 7, seed: '255', sea: 'sea' }, opened: true }, name);
    assert.deepEqual(asked, ['sea'], `${name}: never a sea at its tier`);
    assert.deepEqual(tiers, [tier], name);
  }
  const { seas } = theSea();
  assert.equal(await openIsland(islandRoom().room, '7-0000000000000100--elite', seas), null, 'another seed');
  assert.equal(await openIsland(islandRoom().room, '8-00000000000000ff--elite', seas), null, 'an island not held');
});

test('a sea island’s dungeon at Elite or Abyss is asked of the one sea, by its name at Normal', async () => {
  for (const name of [DUNGEON, `${DUNGEON}--elite--run-k3j4h5g6`, `${DUNGEON}--abyss--run-k3j4h5g6`]) {
    const { asked, seas } = theSea();
    assert.deepEqual(await behindDoor(name, seas), { id: 7, seed: '255', sea: 'sea' }, name);
    assert.deepEqual(asked, ['sea'], `${name}: never a sea at its tier`);
  }
  const { seas } = theSea();
  assert.equal(await behindDoor('sea-dungeon-continent-4-crypt-0a1b2c3d--elite--run-k3j4h5g6', seas), null);
});
