import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resourcePicture } from '../combat/dropPictures.ts';
import { MARK_FLOATS } from '../combat/marks.ts';
import { OVER_NODE_M, REACH_M, marksSeen } from '../combat/marksOver.ts';
import { ASKS, type GearAsk, type GearState } from '../network/gearMessages.ts';
import { NODE_REACH_M, nodeBeams, useAt } from './footGear.ts';
import { markedHere } from './overheadMarks.ts';
import { OPEN_AT } from './gearScreen.ts';
import { SERVED_M } from './plazaLife.ts';
import { awayFromCounters } from './townsfolk.ts';
import type { StationInfo } from './nodes.ts';

const WEAPONSMITH: StationInfo = { kind: 'weaponsmith', keeper: [0, -2], counter: [0, 0] };
const CHANDLER: StationInfo = { kind: 'chandler', keeper: [20, -2], counter: [20, 0] };
const lying = {
  nodes: [{ index: 3, x: 10, y: 0, resource: 0 }],
  drops: [{ id: 1, rarity: 3, slot: 0, at: [5, 5, 1] }],
} as unknown as GearState;

test('E at a counter opens its tab, and near a node asks the room to gather it', () => {
  const asked: GearAsk[] = [];
  const ask = (each: GearAsk) => asked.push(each);
  assert.match(useAt(0.5, 0.5, { stations: [WEAPONSMITH] }, lying, ask)?.words ?? '', /^The Weaponsmith/);
  const gather = useAt(10 + NODE_REACH_M - 0.1, 0, { stations: [WEAPONSMITH] }, lying, ask);
  assert.match(gather?.words ?? '', /^Gather /);
  gather?.run();
  assert.deepEqual(asked, [{ kind: ASKS.gather, node: 3 }]);
  assert.equal(
    useAt(10 + NODE_REACH_M + 0.1, 0, { stations: [WEAPONSMITH] }, lying, ask),
    null,
    "out of the room's reach",
  );
  assert.equal(
    useAt(20, 0, { stations: [CHANDLER] }, null, ask),
    null,
    'a station that deals with no one offers nothing',
  );
});

test('a counter whose keeper is away still opens, which calls her back to it, and her mark goes with her', () => {
  const LAMPLIGHTERS: StationInfo = { kind: 'lamplighters', keeper: [0, -2], counter: [0, 0] };
  const here = { stations: [LAMPLIGHTERS] };
  awayFromCounters.add('lamplighters');
  try {
    assert.equal(useAt(0, 0, here, null, () => undefined)?.words, 'Lamplighters', 'offered while she walks the plaza');
    assert.deepEqual(
      markedHere(null, here, () => 0),
      [],
      'no mark over her empty post',
    );
  } finally {
    awayFromCounters.delete('lamplighters');
  }
  assert.equal(markedHere(null, here, () => 0).length, 1, 'marked again once she is back');
});

/** The heights of marks' vertices. */
const heights = (vertices: readonly number[]) => vertices.filter((unused, index) => index % MARK_FLOATS === 2);

test('each node still to gather wears its mark under a beam standing clear over it, its floor read once', () => {
  const nodes = Array.from({ length: 12 }, (unused, resource) => ({ index: resource, x: 10, y: 0, resource }));
  let reads = 0;
  const floor = () => {
    reads += 1;
    return 2;
  };
  const marked = markedHere({ ...lying, nodes: nodes.filter((node) => resourcePicture(node.resource)) }, {}, floor);
  assert.equal(reads, marked.length, 'its floor read once');
  for (const mark of marked) {
    const beams = nodeBeams([mark], 0);
    // A beam is two crossed planes of two triangles each.
    assert.equal(beams.length, 12 * MARK_FLOATS);
    const foot = Math.min(...heights(beams));
    for (let far = 1; far < REACH_M; far += 0.5)
      for (const [seconds, eyeHigh] of [
        [0, 1.6],
        [0.25, 1.6],
        [0.75, 1.6],
        [0.25, 12],
      ] as const) {
        // The eye `far` from the mark's foot, `eyeHigh` over the floor.
        const across = Math.sqrt(Math.max(0, far ** 2 - (eyeHigh - OVER_NODE_M) ** 2));
        const seen = marksSeen([mark], [10 + across, 0, 2 + eyeHigh], seconds, false);
        assert.ok(seen.length > 0, `seen ${far} m off`);
        assert.ok(Math.max(...heights(seen)) < foot, `the mark clear under its beam ${far} m off`);
      }
  }
  assert.equal(reads, marked.length, 'the beams read no floor');
  assert.deepEqual(
    nodeBeams(
      markedHere(null, {}, () => 0),
      0,
    ),
    [],
    'no gear, no nodes',
  );
});

test("Shape's offer is within a counter's reach of his week's spot, marked there, and gone with him", () => {
  const visitorSpots = [
    [40, 40],
    [60, 0],
  ] as const;
  const here = { stations: [WEAPONSMITH], visitorSpots };
  const shape = { ...lying, nodes: [], shape: { place: 1, wares: [] } } as GearState;
  const opened: { type: string; detail: unknown }[] = [];
  // The page's event, as the menu hears it, without a page.
  Object.assign(globalThis, {
    CustomEvent: function (this: { type: string; detail: unknown }, type: string, told: { detail: unknown }) {
      Object.assign(this, { type, detail: told.detail });
    },
    dispatchEvent: (event: { type: string; detail: unknown }) => opened.push({ ...event }),
  });
  const offer = useAt(60 + SERVED_M - 0.1, 0, here, shape, () => undefined);
  assert.equal(offer?.words, 'Shape', 'his title, as a counter shows its keeper’s');
  offer?.run();
  assert.deepEqual(opened, [{ type: OPEN_AT, detail: { view: 'shape' } }]);
  assert.equal(
    useAt(60 + SERVED_M + 0.1, 0, here, shape, () => undefined),
    null,
    'out of his reach',
  );
  assert.equal(
    useAt(60, 0, here, { ...shape, shape: null }, () => undefined),
    null,
    'he has left',
  );
  assert.equal(
    markedHere(shape, here, () => 0).length,
    markedHere(null, here, () => 0).length + 1,
    'a mark of his own',
  );
});
