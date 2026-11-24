import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import type { AccountLink, OutpostSeen } from '../../network/accounts.ts';
import type { Block } from '../../rules/movementRules.ts';
import { OutpostHere, useWords } from './outpostHere.ts';
import { letGo, placingStrip, startPlacing } from './decorPlacing.ts';
import { guildRead, keepGuild } from './guildHeld.ts';
import { PLOT_M, kindOf, tierName } from './outpostLaw.ts';
import { decorPlaceOf, placeOf, socketOf } from './outpostPlaces.ts';

// The page's window events, which the outpost listens on, are none under Node.
Object.assign(globalThis, {
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  dispatchEvent: () => true,
});

const GROUND = { plot: [1000, 2000], level: 12 } as const;
const NODE_BOX: Block = { minX: 0, minY: 0, maxX: 1, maxY: 1, top: 1, bottom: 0 };
const structure = (id: number, kind: string, x: number, y: number, tier = 1, building = 0) => ({
  ...{ id, kind, tier, building, x, y, turn: 0, spent: 0, delivered: {} },
});
const SEEN: OutpostSeen = {
  guild: '0a1b2c3d-4e5f-6071-8293-a4b5c6d7e8f9',
  name: 'Salt Kings',
  banner: '{}',
  site: 'gull-cove-outpost',
  plot: {
    structures: [structure(1, 'hall', 6, 6), structure(2, 'counting', 0, 0), structure(3, 'horn', 12, 0, 0, 1)],
    decor: [{ id: 9, piece: 'well', x: 3, y: 14, turn: 0, paid: 10 }],
  },
};

const made: OutpostHere[] = [];
after(() => made.forEach((here) => here.stop()));

/** An outpost on the test ground, keeping the courses it walls. */
function outpost(link: AccountLink | null = null) {
  const courses: (readonly Block[])[] = [];
  const course = { setCourse: (blocks: readonly Block[]) => void courses.push(blocks) };
  const here = new OutpostHere('gull-cove-outpost', GROUND, link, { boxes: [NODE_BOX], courses: [course, course] });
  made.push(here);
  return { here, courses };
}

test('a bare site stands only the standard’s oak staff at the plot’s middle, whose use says how to raise the outpost', () => {
  const { here } = outpost();
  const props = here.props();
  assert.deepEqual(
    props.map((prop) => prop.module),
    ['outpost-standard-oak'],
  );
  const [x = 0, y = 0] = props[0]?.at ?? [];
  assert.deepEqual([x, y], [...GROUND.plot], 'at the plot’s middle');
  assert.equal(here.uses(x + 1, y, () => undefined)?.words, "Raise your guild's outpost here from the Guild tab.");
  assert.equal(
    here.uses(x + 20, y, () => undefined),
    null,
    'far from it, nothing',
  );
});

test('a raised outpost stands each structure and piece, walls them beside the node, and offers each at its socket', () => {
  const { here, courses } = outpost();
  here.take(SEEN);
  assert.deepEqual(
    here.props().map((prop) => prop.module),
    ['outpost-hall-1', 'outpost-counting-1', 'outpost-scaffold-2', 'well'],
  );
  assert.equal(courses.length, 2, 'the movement and the fight');
  assert.equal(courses[0]?.[0], NODE_BOX, "the node's own boxes kept first");
  assert.ok((courses[0]?.length ?? 0) > 3, 'and the plot walled');
  const [countX, countY] = socketOf(structure(2, 'counting', 0, 0), GROUND, '', 'use');
  assert.equal(here.uses(countX, countY, () => undefined)?.words, 'Counting House I', 'named at its tier');
  assert.equal(useWords(structure(3, 'horn', 12, 0, 0, 1)), 'Deliver materials', 'a scaffold takes deliveries');
  assert.equal(useWords(structure(3, 'horn', 12, 0, 1, 0), true), 'Sound the War Horn', 'to the founder or an admin');
  assert.equal(useWords(structure(3, 'horn', 12, 0, 1, 0)), 'War Horn I', 'to a member, only its name');
  const hall = kindOf('hall');
  assert.ok(hall);
  assert.equal(useWords(structure(1, 'hall', 6, 6, 2)), tierName(hall, 2), "the hall by its tier's own name");
  assert.notEqual(useWords(structure(1, 'hall', 6, 6, 2)), 'Hall');
});

test('a piece being placed stands its ghost just before the player, snapped to a quarter metre, red where the law refuses', async () => {
  const asked: unknown[] = [];
  const link = {
    outpost: () => Promise.resolve('The accounts are away.'),
    social: (path: string, body: unknown) => {
      asked.push([path, body]);
      return Promise.resolve(null);
    },
  } as unknown as AccountLink;
  const { here } = outpost(link);
  here.take(SEEN);
  startPlacing('gull-cove-outpost', 'bench');
  const corner = [GROUND.plot[0] - PLOT_M / 2, GROUND.plot[1] - PLOT_M / 2] as const;
  // Facing east, the bench (reaching 1.25 m) stands 2.25 m before the player's feet, clear of their body.
  const open: readonly [number, number] = [corner[0] + 0.85, corner[1] + 30.4];
  const east = Math.PI / 2;
  here.uses(...open, () => undefined, east);
  const ghost = here.props([], open).at(-1);
  assert.equal(ghost?.module, 'bench');
  assert.deepEqual(ghost?.at.slice(0, 2), [corner[0] + 3, corner[1] + 30.5]);
  assert.ok((ghost?.tint?.[1] ?? 0) > (ghost?.tint?.[0] ?? 1), 'green where it may stand');
  assert.equal(here.uses(...open, () => undefined, east)?.words, 'Place the Bench');
  const onHall = placeOf(structure(1, 'hall', 6, 6), GROUND, '').at;
  assert.equal(here.uses(onHall[0], onHall[1], () => undefined)?.words, 'A structure stands there.');
  assert.ok((here.props([], [onHall[0], onHall[1]]).at(-1)?.tint?.[0] ?? 0) > 0.5, 'red where it may not');
  const place = here.uses(...open, () => undefined, east);
  place?.run();
  place?.run();
  await Promise.resolve();
  const [[path, { rid, ...body }] = ['', {}]] = asked as [string, Record<string, unknown>][];
  assert.deepEqual(
    [path, body],
    ['outpost/decorate', { site: 'gull-cove-outpost', piece: 'bench', x: 3, y: 30.5, turn: 0 }],
  );
  assert.match(String(rid), /^[a-z0-9-]{1,64}$/, 'setting a piece pays Aurem, so it goes with its request id');
  letGo();
  assert.equal(here.props([], open).length, 4, 'let go, the ghost is gone');
});

test("the guild's banner hangs from its standard's cloth socket, turned as the standard is", () => {
  const { here } = outpost();
  assert.equal(here.cloth(), null, 'no standard, no cloth');
  const standard = { ...structure(4, 'standard', 7, 11), turn: 1 };
  here.take({ ...SEEN, plot: { ...SEEN.plot, structures: [...SEEN.plot.structures, standard] } });
  const placed = placeOf(standard, GROUND, 'driftwood');
  const hung = here.cloth();
  assert.equal(hung?.turn, Math.PI / 2);
  assert.equal(hung?.banner.staff, 'driftwood', "the guild's banner, its name's while it keeps none");
  // The socket stands 0.15 m before the pole and 5.35 m up: turned a quarter, before it is to the west.
  assert.ok(Math.abs((hung?.at[0] ?? 0) - (placed.at[0] - 0.15)) < 1e-9);
  assert.ok(Math.abs((hung?.at[2] ?? 0) - (GROUND.level + 5.35)) < 1e-9);
});

test('at a Delve Gate standing, its prompt goes down at the highest tier it opens, out before its door', () => {
  const delved: unknown[][] = [];
  const course = { setCourse: () => undefined };
  const here = new OutpostHere('gull-cove-outpost', GROUND, null, { boxes: [], courses: [course] }, (...asked) =>
    delved.push(asked),
  );
  made.push(here);
  const gate = structure(4, 'gate', 6, 12, 2);
  here.take({ ...SEEN, plot: { structures: [...SEEN.plot.structures, gate], decor: [] } });
  const [doorX, doorY] = socketOf(gate, GROUND, 'driftwood', 'door');
  const use = here.uses(doorX, doorY, () => undefined);
  assert.equal(use?.words, 'Delve: Elite');
  use?.run();
  const [key, tier, out] = delved[0] ?? [];
  assert.deepEqual([key, tier], ['0a1b2c3d4e5f60718293a4b5c6d7e8f9', 1]);
  const { x = 0, y = 0, facing = 0 } = out as { x?: number; y?: number; facing?: number };
  assert.ok(Math.abs(x - doorX) < 1e-9 && Math.abs(y - (doorY + 1.5)) < 1e-9, 'a step and a half south of the door');
  assert.ok(Math.abs(facing - Math.PI) < 1e-9, 'facing out of the gate, south');
  const building = { ...gate, tier: 0, building: 1 };
  here.take({ ...SEEN, plot: { structures: [...SEEN.plot.structures, building], decor: [] } });
  const [scaffoldX, scaffoldY] = socketOf(building, GROUND, 'driftwood', 'door');
  assert.equal(
    here.uses(scaffoldX, scaffoldY, () => undefined)?.words,
    'Deliver materials',
    'a gate first being built opens nothing: its scaffold takes deliveries',
  );
});

test("a companion's guest reads the outpost of the guild whose room they joined, and stays there on a guild change", () => {
  const read: string[] = [];
  const link = {
    outpost: (room: string) => {
      read.push(room);
      return Promise.resolve('The accounts are away.');
    },
  } as unknown as AccountLink;
  const key = '0a1b2c3d4e5f60718293a4b5c6d7e8f9';
  const course = { setCourse: () => undefined };
  const guest = new OutpostHere('gull-cove-outpost', GROUND, link, { boxes: [], courses: [course] }, undefined, {
    guild: key,
    own: false,
  });
  made.push(guest);
  assert.deepEqual(read, [`node-gull-cove-outpost--guild-${key}`]);
  assert.equal(guest.rejoins(null), false, 'a guest stays whatever their own guild');
  const own = new OutpostHere('gull-cove-outpost', GROUND, link, { boxes: [], courses: [course] });
  made.push(own);
  assert.equal(own.rejoins(key), true, 'at the wild site, a guild founded here takes the player to its room');
  assert.equal(own.rejoins(null), false);
});

test("the room's word that it stood another plot reads the plot again", () => {
  let reads = 0;
  const link = { outpost: () => Promise.resolve(String(++reads)) } as unknown as AccountLink;
  const heard = { plots: 0 };
  const course = { setCourse: () => undefined };
  const here = new OutpostHere(
    'gull-cove-outpost',
    GROUND,
    link,
    { boxes: [], courses: [course] },
    undefined,
    {
      guild: null,
      own: true,
    },
    heard,
  );
  made.push(here);
  here.uses(0, 0, () => undefined);
  assert.equal(reads, 1, 'read on arriving');
  heard.plots = 3;
  here.uses(0, 0, () => undefined);
  here.uses(0, 0, () => undefined);
  assert.equal(reads, 2, 'read again once as it changed');
});

test('a piece is offered to take up only to the founder or an admin, held through, and the horn only to them', async () => {
  // Read as keepGuild starts, again by the first fresh read, and again by the second, the player made an admin.
  const ranks = [2, 2, 1];
  const key = '0a1b2c3d4e5f60718293a4b5c6d7e8f9';
  const asked: string[] = [];
  const link = {
    guild: () => Promise.resolve({ guild: { key, rank: ranks.shift() ?? 2, banner: {} } }),
    outposts: () => Promise.resolve({ outposts: [] }),
    outpost: () => Promise.resolve('The accounts are away.'),
    social: (path: string) => {
      asked.push(path);
      return Promise.resolve('Refused.');
    },
  } as unknown as AccountLink;
  keepGuild(link);
  await guildRead();
  const { here } = outpost(link);
  const horn = structure(3, 'horn', 12, 0, 1, 0);
  here.take({ ...SEEN, plot: { ...SEEN.plot, structures: [...SEEN.plot.structures, horn] } });
  const [wellX, wellY] = decorPlaceOf(SEEN.plot.decor[0] ?? { id: 0, piece: '', x: 0, y: 0, turn: 0 }, GROUND).at;
  const [hornX, hornY] = socketOf(horn, GROUND, '', 'use');
  assert.equal(
    here.uses(wellX, wellY, () => undefined),
    null,
    'a member is offered nothing at a piece',
  );
  assert.equal(here.uses(hornX, hornY, () => undefined)?.words, 'War Horn I');
  await guildRead();
  assert.equal(here.uses(hornX, hornY, () => undefined)?.words, 'Sound the War Horn', 'an admin sounds it');
  let now = 1000;
  here.clock = () => now;
  const take = here.uses(wellX, wellY, () => undefined);
  assert.equal(take?.words, 'Take up the Well');
  take?.run();
  now += 400;
  assert.equal(here.uses(wellX, wellY, () => undefined, 0, true)?.held, 0.5, 'held half way');
  assert.equal(here.uses(wellX, wellY, () => undefined, 0, false)?.held, undefined, 'let go, the hold is gone');
  now += 1000;
  here.uses(wellX, wellY, () => undefined, 0, true);
  assert.deepEqual(asked, [], 'nothing asked before it is held through');
  here.uses(wellX, wellY, () => undefined)?.run();
  now += 400;
  here.uses(hornX, hornY, () => undefined, 0, true);
  now += 400;
  here.uses(wellX, wellY, () => undefined, 0, true);
  assert.deepEqual(asked, [], 'a hold broken by stepping to a structure starts again');
  here.uses(wellX, wellY, () => undefined)?.run();
  now += 800;
  here.uses(wellX, wellY, () => undefined, 0, true);
  assert.deepEqual(asked, ['outpost/undecorate'], 'held through, it is asked once');
});

test('a structure is used from its front alone: a Delve Gate is not entered through its back wall', () => {
  const course = { setCourse: () => undefined };
  const here = new OutpostHere('gull-cove-outpost', GROUND, null, { boxes: [], courses: [course] }, () => undefined);
  made.push(here);
  const gate = structure(4, 'gate', 6, 12, 1);
  here.take({ ...SEEN, plot: { structures: [gate], decor: [] } });
  const [doorX, doorY] = socketOf(gate, GROUND, 'driftwood', 'door');
  assert.equal(here.uses(doorX, doorY + 1.5, () => undefined)?.words, 'Delve: Normal', 'before its door, south');
  assert.equal(
    here.uses(doorX, doorY - 1.9, () => undefined),
    null,
    'behind it, through the wall',
  );
  const turned = { ...gate, turn: 1 };
  here.take({ ...SEEN, plot: { structures: [turned], decor: [] } });
  const [westX, westY] = socketOf(turned, GROUND, 'driftwood', 'door');
  assert.equal(
    here.uses(westX - 1.5, westY, () => undefined)?.words,
    'Delve: Normal',
    'turned a quarter, before it west',
  );
  assert.equal(
    here.uses(westX + 1.9, westY, () => undefined),
    null,
  );
});

test('while placing, the law’s words show and Place is offered on the strip only where the piece may stand', () => {
  const { here } = outpost();
  here.take(SEEN);
  startPlacing('gull-cove-outpost', 'bench');
  const corner = [GROUND.plot[0] - PLOT_M / 2, GROUND.plot[1] - PLOT_M / 2] as const;
  const east = Math.PI / 2;
  const onHall = [GROUND.plot[0] - PLOT_M / 2 + 6 * 4 + 2, GROUND.plot[1] - PLOT_M / 2 + 6 * 4 + 2] as const;
  assert.equal(here.uses(onHall[0], onHall[1], () => undefined, east)?.words, 'A structure stands there.');
  const offered = () => (placingStrip()?.hints ?? []).map(([keys]) => keys);
  assert.deepEqual(offered(), ['[ / ]', 'Esc'], 'red: no Place');
  assert.equal(here.uses(corner[0] + 0.85, corner[1] + 30.4, () => undefined, east)?.words, 'Place the Bench');
  assert.deepEqual(offered(), ['[ / ]', 'use', 'Esc'], 'green: Place');
  letGo();
  assert.equal(placingStrip(), null);
});
