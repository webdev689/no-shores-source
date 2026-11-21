import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SIDE, coastDistance } from '../client/src/overworld/islandView.ts';
import { accounts } from './accounts/accountsForTests.ts';
import { characters } from './accounts/characters.ts';
import {
  FIRST_ROOM,
  LANDFALL_M,
  NO_WAY_HERE,
  type Reach,
  arrives,
  cameOutOf,
  reachOf,
  shipOf,
  toCoast,
} from './arrival.ts';
import { Keeper, type KeptRoom } from './keeping.ts';

/** An island 100 km square, its coast at x and y from 1,000 km to 1,100 km. */
const COAST: [number, number][] = [
  [1_000_000, 1_000_000],
  [1_100_000, 1_000_000],
  [1_100_000, 1_100_000],
  [1_000_000, 1_100_000],
];
const reach = (gatedFrom: string[] = [], social = false): Reach => ({ social, coast: COAST, gatedFrom });
const [OFF_COAST, FAR_OFF]: [number, number][] = [
  [1_050_000, 1_120_000],
  [1_050_000, 1_200_000],
];

test('Overlook’s social space takes anyone, a room takes back whoever it held last, and no other room is judged', () => {
  assert.equal(arrives(FIRST_ROOM, null, null, null), true, 'every session begins there');
  assert.equal(arrives(FIRST_ROOM, 'node-tidewall--abyss', null, null), true);
  assert.equal(arrives('node-tidewall', 'node-tidewall', null, reach()), true, 'a rejoin');
  assert.equal(arrives('node-tidewall', null, OFF_COAST, reach()), false, 'held nowhere before');
  for (const room of ['sea', 'sea--abyss', 'isle-7-00000000000000ff', 'fleet-a', 'course'])
    assert.equal(arrives(room, 'node-tidewall', null, null), true, room);
});

test('a node is landed at from the sea at its seas, its ship lying off the node’s island', () => {
  assert.equal(arrives('node-tidewall', 'sea', OFF_COAST, reach()), true);
  assert.equal(arrives('node-tidewall--elite', 'sea--elite', OFF_COAST, reach()), true);
  assert.equal(arrives('node-tidewall', 'sea', FAR_OFF, reach()), false, 'a voyage skipped');
  assert.equal(arrives('node-tidewall', 'sea', null, reach()), false, 'no ship the sea kept');
  assert.equal(arrives('node-tidewall', 'sea--abyss', OFF_COAST, reach()), false, 'at another tier');
  assert.equal(arrives('node-tidewall--abyss', 'sea', OFF_COAST, reach()), false);
  assert.equal(arrives('node-tidewall', 'node-saltgrass-downs', OFF_COAST, reach()), false, 'not from the sea');
  assert.equal(arrives('node-tidewall', 'sea', OFF_COAST, null), false, 'a node the index does not list');
  assert.equal(arrives('node-sunspire-social', 'sea--abyss', OFF_COAST, reach([], true)), true, 'one room each tier');
  assert.equal(arrives('node-sunspire-social', 'sea', FAR_OFF, reach([], true)), false);
  // The page's own measure off a coast, and every landfall it offers within the room's reach.
  for (const ship of [OFF_COAST, FAR_OFF, [1_050_000, 1_050_000], [900_000, 1_250_000]] as const)
    assert.equal(toCoast(ship, COAST), coastDistance(ship, COAST), String(ship));
  assert.ok(LANDFALL_M > SIDE.coastReachM);
});

test('a gate takes a player into a node from a node whose gate leads there, at the same seas', () => {
  const gated = reach(['gullwing-vale']);
  assert.equal(arrives('node-tidewall', 'node-gullwing-vale', null, gated), true);
  assert.equal(arrives('node-tidewall--elite', 'node-gullwing-vale--elite', null, gated), true);
  assert.equal(arrives('node-tidewall--elite', 'node-gullwing-vale', null, gated), false, 'at another tier');
  assert.equal(arrives('node-tidewall', 'node-driftwood-moors', null, gated), false, 'no gate leads from there');
  assert.equal(arrives('node-tidewall', 'node-gullwing-vale--dungeon-0', null, gated), false, 'not from its dungeon');
});

test('a dungeon or a run is entered from its node’s room, and left back into it at its seas', () => {
  assert.equal(arrives('node-gullwing-vale--dungeon-1', 'node-gullwing-vale', null, null), true);
  assert.equal(arrives('node-gullwing-vale--dungeon-1', 'node-gullwing-vale--elite', null, null), false);
  assert.equal(arrives('node-gullwing-vale--dungeon-1', 'node-gullwing-vale--dungeon-2', null, null), false);
  assert.equal(arrives('node-gullwing-vale--dungeon-1', 'node-tidewall', null, null), false);
  assert.equal(arrives('node-gullwing-vale--dungeon-1', 'sea', OFF_COAST, reach()), false);
  const run = 'node-gullwing-vale--elite--dungeon-1--run-k3j4h5g6';
  assert.equal(arrives(run, 'node-gullwing-vale--elite', null, null), true);
  assert.equal(arrives(run, 'node-gullwing-vale', null, null), false);
  // An Elite Dungeon's run at Normal from its node at any seas; the week's at Abyss only from its node at Abyss.
  assert.equal(arrives('node-krakens-grotto--run-k3j4h5g6', 'node-krakens-grotto--abyss', null, null), true);
  assert.equal(arrives('node-krakens-grotto--abyss--run-k3j4h5g6', 'node-krakens-grotto--abyss', null, null), true);
  assert.equal(arrives('node-krakens-grotto--abyss--run-k3j4h5g6', 'node-krakens-grotto', null, null), false);
  // Out again, at the seas the dungeon was gone into at.
  assert.equal(arrives('node-gullwing-vale', 'node-gullwing-vale--dungeon-1', null, reach()), true);
  assert.equal(arrives('node-gullwing-vale--elite', run, null, reach()), true);
  assert.equal(arrives('node-gullwing-vale', run, null, reach()), false);
  assert.equal(arrives('node-krakens-grotto', 'node-krakens-grotto--run-k3j4h5g6', null, reach()), true);
  assert.equal(arrives('node-tidewall', 'node-gullwing-vale--dungeon-1', null, reach(['gullwing-vale'])), false);
});

test('a player stands out of an entrance only as they come out of its dungeon or its run', () => {
  const patrol = 'node-gullwing-vale--elite';
  assert.equal(cameOutOf(patrol, 'node-gullwing-vale--elite--dungeon-2--run-k3j4h5g6', 2), true);
  assert.equal(cameOutOf(patrol, 'node-gullwing-vale--elite--dungeon-2--run-k3j4h5g6', 1), false, 'another door');
  assert.equal(cameOutOf(patrol, 'node-gullwing-vale--abyss--dungeon-2--run-k3j4h5g6', 2), false, 'another tier');
  assert.equal(cameOutOf('node-gullwing-vale', 'node-gullwing-vale--dungeon-0', 0), true);
  assert.equal(cameOutOf('node-gullwing-vale', 'node-gullwing-vale', 0), false, 'a rejoin is an ordinary join');
  assert.equal(cameOutOf('node-gullwing-vale', 'sea', 0), false);
  assert.equal(cameOutOf('node-gullwing-vale', null, 0), false, 'a player not kept');
  assert.equal(cameOutOf('node-krakens-grotto', 'node-krakens-grotto--run-k3j4h5g6', 0), true, 'its one entrance');
  assert.equal(cameOutOf('node-gullwing-vale--dungeon-0', 'node-gullwing-vale', 0), false, 'no door inside');
});

test('a node’s reach reads from the bake’s index, and a ship’s place from the kept character', () => {
  const index = [
    { id: 'gullwing-vale', kind: 'patrol', continent: 'continent-1', gates: ['tidewall', 'pearl-tomb'] },
    { id: 'tidewall', kind: 'mission', continent: 'continent-1', gates: ['gullwing-vale'] },
    { id: 'overlook-social', kind: 'social', continent: 'continent-1' },
  ];
  const continents = [{ id: 'continent-1', outline: COAST }];
  assert.deepEqual(reachOf(index, continents, 'tidewall'), {
    social: false,
    coast: COAST,
    gatedFrom: ['gullwing-vale'],
  });
  assert.equal(reachOf(index, continents, 'overlook-social')?.social, true);
  assert.equal(reachOf(index, continents, 'nowhere'), null);
  assert.deepEqual(shipOf('{"xp":1,"ship_at":[5000,6000]}'), [5000, 6000]);
  for (const body of [null, '{"xp":1}', '{"ship_at":null}', '{"ship_at":["a",1]}', 'not a character'])
    assert.equal(shipOf(body), null, String(body));
});

/** A room on land whose players' characters are plain strings, every gate open. */
function roomOf(): KeptRoom & { readonly held: Map<number, string> } {
  const held = new Map<number, string>();
  return {
    held,
    character: (player) => held.get(player) ?? null,
    restoreCharacter: (player, kept) => held.has(player) && Boolean(held.set(player, kept)),
    own: (player) => held.has(player),
    shut: () => '',
  };
}

test('a node’s room lets go a character that came by no way leading there, unless one of its company plays there', async () => {
  const made = accounts();
  const tokens: Record<string, string> = {};
  for (const name of ['Ada', 'Ben']) {
    tokens[name] = (await made.ask('POST', '/v1/guest')).body['token'] as string;
    await made.ask('POST', '/v1/register', { username: name, password: 'long enough' }, tokens[name]);
  }
  const kept = characters(
    made.deps.database,
    () => made.clock.now,
    () => Promise.resolve(),
  );
  const [now, here] = [() => made.clock.now, () => true];
  const sent: [number, string | undefined][] = [];
  const keeperOf = (name: string, room: KeptRoom) =>
    new Keeper(kept, room, name, (player, why) => sent.push([player, why])).judgingArrivals((from, body) =>
      arrives(name, from, shipOf(body), reach()),
    );
  // Both begin in Overlook's social space, where every session does.
  const plaza = roomOf();
  for (const player of [1, 2]) plaza.held.set(player, '{"start":1}');
  const overlook = keeperOf(FIRST_ROOM, plaza);
  assert.equal(await overlook.signIn(1, tokens['Ada'] ?? '', now, here), true);
  assert.equal(await overlook.signIn(2, tokens['Ben'] ?? '', now, here), true);
  assert.equal(overlook.cameFrom(1), null, 'no room held it before');
  await overlook.leave(1);
  // Ada names a far node's room from there: refused, untouched, and her character still last in Overlook.
  const far = roomOf();
  for (const player of [1, 2, 3]) far.held.set(player, '{"start":2}');
  const tidewall = keeperOf('node-tidewall', far);
  assert.equal(await tidewall.signIn(1, tokens['Ada'] ?? '', now, here), false);
  assert.deepEqual(sent, [[1, NO_WAY_HERE]]);
  assert.equal(far.held.get(1), '{"start":2}', 'never given the kept character');
  assert.equal((await kept.look(tokens['Ada'] ?? ''))?.from, FIRST_ROOM, 'it was never there');
  // Ben goes there by sea, his ship lying off its island; then Ada joins him there, in his company.
  const sea = roomOf();
  sea.held.set(1, '{}');
  const atSea = new Keeper(kept, sea, 'sea', () => undefined);
  await overlook.leave(2);
  assert.equal(await atSea.signIn(1, tokens['Ben'] ?? '', now, here), true);
  sea.held.set(1, JSON.stringify({ ship_at: OFF_COAST }));
  await atSea.leave(1);
  assert.equal(await tidewall.signIn(2, tokens['Ben'] ?? '', now, here), true, 'landed from the sea');
  assert.equal(tidewall.cameFrom(2), 'sea');
  await made.ask('POST', '/v1/social/company/invite', { name: 'Ben' }, tokens['Ada']);
  await made.ask('POST', '/v1/social/company/accept', { name: 'Ada' }, tokens['Ben']);
  assert.equal(await tidewall.signIn(3, tokens['Ada'] ?? '', now, here), true, 'the Roster’s join');
  assert.equal(far.held.get(3), '{"start":1}', 'with her own character');
});
