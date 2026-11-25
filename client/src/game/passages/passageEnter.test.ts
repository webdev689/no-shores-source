import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GearState } from '../../network/gearMessages.ts';
import type { RoomLink } from '../../network/roomConnection.ts';
import { NO_WAY_HERE, PASSAGE_FULL } from '../rooms.ts';
import type { PassagePlan } from '../../rules/passageRules.ts';
import { hollowBoxes, joinPassage, joiner, onwardOrBack } from './passageEnter.ts';

/** A join that finds the first `full` copies full, recording each name joined and each link closed. */
function joins(full: number) {
  const [joined, closed] = [[] as string[], [] as string[]];
  const join = (name: string) => {
    joined.push(name);
    const link = { close: () => closed.push(name) } as unknown as RoomLink;
    return Promise.resolve({ link, full: joined.length <= full });
  };
  return { join, joined, closed };
}

test('a public zone full joins its next copy, letting go of the one that turned the player away', async () => {
  const { join, joined, closed } = joins(2);
  await joinPassage('passage-continent-1-w9-z3', join);
  assert.deepEqual(joined, [
    'passage-continent-1-w9-z3',
    'passage-continent-1-w9-z3--2',
    'passage-continent-1-w9-z3--3',
  ]);
  assert.deepEqual(closed, joined.slice(0, 2));
});

test('a company’s route is its own room alone: full, it is not copied, and every copy full says so', async () => {
  const route = joins(1);
  await assert.rejects(joinPassage('passage-continent-1-w9-z3--run-a1b2c3d4', route.join), /This passage is full/);
  assert.equal(route.joined.length, 1);
  await assert.rejects(joinPassage('passage-continent-1-w9-z3', joins(99).join), /This passage is full/);
});

test('a ninth account, held a moment and then turned away as full, is moved on to the next copy', async () => {
  const [joined, closed] = [[] as string[], [] as string[]];
  // As the server does: every room holds the player and sends its snapshots; the first is full, said only after the
  // token, the look and the judge, and the second keeps the character, its gear naming the dive in this zone.
  const open = (name: string, gear: (sent: GearState) => void) => {
    joined.push(name);
    const link = { shut: null as string | null, close: () => closed.push(name) };
    setTimeout(() => {
      if (joined.length === 1) link.shut = PASSAGE_FULL;
      else gear({ dive: { island: 'continent-1', week: 9, zone: 3 } } as unknown as GearState);
    }, 250);
    return Promise.resolve(link as unknown as RoomLink);
  };
  await joinPassage('passage-continent-1-w9-z3', joiner(open));
  assert.deepEqual(joined, ['passage-continent-1-w9-z3', 'passage-continent-1-w9-z3--2']);
  assert.deepEqual(closed, ['passage-continent-1-w9-z3']);
});

test('a zone gone on to that refuses the dive as come by no way there sends the page back to the zone it left', async () => {
  const went: string[] = [];
  const refused = () => Promise.reject(new Error(NO_WAY_HERE));
  assert.equal(await onwardOrBack(refused, async () => void went.push('back')), false);
  assert.deepEqual(went, ['back']);
  await assert.rejects(onwardOrBack(refused, null), /cannot reach/, 'from the patrol zone, nowhere to go back to');
  const full = () => Promise.reject(new Error(PASSAGE_FULL));
  await assert.rejects(
    onwardOrBack(full, async () => void went.push('back')),
    /full/,
    'any other refusal is said',
  );
  assert.equal(await onwardOrBack(() => Promise.resolve(), null), true);
});

test('a copy that shuts on the player for any other reason than full is not joined, and says why', async () => {
  const join = (name: string) =>
    Promise.resolve({ link: { shut: NO_WAY_HERE, close: () => undefined } as unknown as RoomLink, full: false, name });
  await assert.rejects(joinPassage('passage-continent-1-w9-z3', join), /cannot reach/);
});

test('a hollow’s foot boxes hold its dressing (cliffs, boulders, trees) as well as its pieces', () => {
  const plan = {
    ground: { kind: 'open', placements: [], blocks: [[0, 0, 4, 4, 9]], ring: [] },
    solids: [[10, 10, 11, 11, 2]],
  } as unknown as PassagePlan;
  assert.deepEqual(
    hollowBoxes(plan).map((box) => [box.minX, box.top, box.bottom]),
    [
      [0, 9, -100],
      [10, 2, -100],
    ],
  );
  assert.deepEqual(hollowBoxes({ ground: { kind: 'under' }, solids: [] } as unknown as PassagePlan), []);
});
