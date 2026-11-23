import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import type { OutpostSeen } from '../../network/accounts.ts';
import type { Block } from '../../rules/movementRules.ts';
import { OutpostHere, useWords } from './outpostHere.ts';
import { socketOf } from './outpostPlaces.ts';

// The page's window events, which the outpost listens on, are none under Node.
Object.assign(globalThis, { addEventListener: () => undefined, removeEventListener: () => undefined });

const GROUND = { plot: [1000, 2000], level: 12 } as const;
const NODE_BOX: Block = { minX: 0, minY: 0, maxX: 1, maxY: 1, top: 1, bottom: 0 };
const structure = (id: number, kind: string, x: number, y: number, tier = 1, building = 0) => ({
  ...{ id, kind, tier, building, x, y, turn: 0, spent: 0, delivered: {} },
});
const SEEN: OutpostSeen = {
  guild: 'a1b2c3d4-0000',
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
function outpost() {
  const courses: (readonly Block[])[] = [];
  const course = { setCourse: (blocks: readonly Block[]) => void courses.push(blocks) };
  const here = new OutpostHere('gull-cove-outpost', GROUND, null, { boxes: [NODE_BOX], courses: [course, course] });
  made.push(here);
  return { here, courses };
}

test('a bare site stands only a post at the hall’s door, whose use says how to raise the outpost', () => {
  const { here } = outpost();
  const props = here.props();
  assert.deepEqual(
    props.map((prop) => prop.module),
    ['lamp-post'],
  );
  const [x = 0, y = 0] = props[0]?.at ?? [];
  assert.equal(here.uses(x, y, () => undefined)?.words, "Raise your guild's outpost here from the Guild tab.");
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
  assert.equal(here.uses(countX, countY, () => undefined)?.words, 'Counting House');
  assert.equal(useWords(structure(3, 'horn', 12, 0, 0, 1)), 'Deliver materials', 'a scaffold takes deliveries');
  assert.equal(useWords(structure(3, 'horn', 12, 0, 1, 0)), 'Sound the War Horn');
});
