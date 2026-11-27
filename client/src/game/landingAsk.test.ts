import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Point2 } from '../overworld/ground.ts';
import { askWords, type ClickContext, clickAtSea, inReach, LandingCourse, type LandingAim } from './landingAsk.ts';

const HARBOUR: Point2 = [1_000, -2_000];
const PORTED: ClickContext = {
  port: { id: 'overlook-port', name: 'Overlook', harbour: HARBOUR },
  coast: 'Saltmere',
  isleAt: ([x]) => (x > 50_000 ? { id: 7, words: 'the cove' } : null),
  regionOf: () => null,
};
const RUINED: ClickContext = { ...PORTED, port: null, coast: 'Cairnwatch' };
const DOCK: LandingAim = { kind: 'dock', port: 'Overlook', harbour: HARBOUR };

test('in the Oversea view a click on the sea sails there; at sea level only the helm’s keys sail', () => {
  const sea = { kind: 'sea', point: [10, 20, 0] } as const;
  assert.deepEqual(clickAtSea(sea, 'oversea', PORTED), { kind: 'sail', point: [10, 20] });
  assert.equal(clickAtSea(sea, 'sealevel', PORTED), null);
  assert.equal(clickAtSea({ kind: 'none' }, 'oversea', PORTED), null);
});

test('a port’s icon, or anywhere on its island, asks to dock there; a coast with no port asks to go ashore', () => {
  const asked = { kind: 'ask', aim: DOCK };
  assert.deepEqual(clickAtSea({ kind: 'mark', id: 'overlook-port' }, 'oversea', PORTED), asked);
  const land = { kind: 'land', point: [400, 900, 30] } as const;
  assert.deepEqual(clickAtSea(land, 'oversea', PORTED), asked, 'land away from the port docks at it');
  assert.deepEqual(clickAtSea(land, 'sealevel', PORTED), asked, 'at sea level too');
  assert.deepEqual(clickAtSea(land, 'oversea', RUINED), {
    kind: 'ask',
    aim: { kind: 'ashore', coast: 'Cairnwatch', toward: [400, 900] },
  });
  assert.equal(clickAtSea({ kind: 'mark', id: 'elsewhere-port' }, 'oversea', PORTED), null, 'no other port here');
});

test('on an island cut into regions, land asks to dock only within the port’s; another region’s, to go ashore on it', () => {
  // West of x = 0 is the port's region; east of it the Weirlands.
  const regioned: ClickContext = {
    ...PORTED,
    regionOf: ([x]) => (x < 0 ? { coast: 'the Beacon Shore', port: true } : { coast: 'the Weirlands', port: false }),
  };
  assert.deepEqual(clickAtSea({ kind: 'land', point: [-400, 900, 30] }, 'oversea', regioned), {
    kind: 'ask',
    aim: DOCK,
  });
  assert.deepEqual(clickAtSea({ kind: 'land', point: [400, 900, 30] }, 'oversea', regioned), {
    kind: 'ask',
    aim: { kind: 'ashore', coast: 'the Weirlands', toward: [400, 900] },
  });
  const ruined: ClickContext = { ...RUINED, regionOf: () => ({ coast: 'the Cairn Heights', port: false }) };
  assert.deepEqual(clickAtSea({ kind: 'land', point: [400, 900, 30] }, 'oversea', ruined), {
    kind: 'ask',
    aim: { kind: 'ashore', coast: 'the Cairn Heights', toward: [400, 900] },
  });
});

test('a hostile ship’s mark sets the chase in either view; water by a sea island asks to go ashore on it', () => {
  assert.deepEqual(clickAtSea({ kind: 'mark', id: 'hostile-4' }, 'sealevel', PORTED), {
    kind: 'chase',
    id: 'hostile-4',
  });
  assert.deepEqual(clickAtSea({ kind: 'sea', point: [60_000, 0, 0] }, 'oversea', PORTED), {
    kind: 'ask',
    aim: { kind: 'isle', id: 7, words: 'the cove' },
  });
});

test('a click that meets a sea island’s own ground asks to go ashore on it, never to dock at the port', () => {
  const isle = { kind: 'ask', aim: { kind: 'isle', id: 7, words: 'the cove' } };
  assert.deepEqual(clickAtSea({ kind: 'land', point: [60_000, 0, 40] }, 'sealevel', PORTED), isle);
  assert.deepEqual(clickAtSea({ kind: 'land', point: [60_000, 0, 40] }, 'oversea', RUINED), isle);
});

test('the confirmation says what yes does: lands at once within reach, else makes for it, at no pace a view eases', () => {
  assert.deepEqual(askWords(DOCK, false), {
    title: 'Dock at Overlook?',
    line: "Your ship will make for Overlook's harbour and dock there.",
    yes: 'Dock',
  });
  assert.match(askWords(DOCK, true).line, /lies off Overlook's harbour/);
  const ashore: LandingAim = { kind: 'ashore', coast: 'Cairnwatch', toward: [0, 0] };
  assert.equal(askWords(ashore, false).title, 'Go ashore on Cairnwatch?');
  assert.equal(
    askWords(ashore, false).line,
    'No port stands on this coast. Your ship will make for it and you will go ashore.',
  );
  assert.equal(askWords({ kind: 'isle', id: 7, words: 'the cove' }, false).yes, 'Go ashore');
});

test('a landing is in reach where the sea offers it: its own port, any coast, its own island', () => {
  assert.equal(inReach(DOCK, { kind: 'dock', port: 'Overlook' }), true);
  assert.equal(inReach(DOCK, { kind: 'dock', port: 'Sunspire' }), false);
  assert.equal(inReach(DOCK, { kind: 'ashore' }), false, 'off its coast but far from its harbour');
  assert.equal(inReach({ kind: 'ashore', coast: 'Cairnwatch', toward: [0, 0] }, { kind: 'ashore' }), true);
  assert.equal(inReach({ kind: 'isle', id: 7, words: 'the cove' }, { kind: 'isle', id: 7, words: 'the cove' }), true);
  assert.equal(inReach(DOCK, null), false);
});

test('a landing made for lands once in reach, taken once; another course lets it go, a stop keeps it', () => {
  const course = new LandingCourse();
  course.begin(DOCK, HARBOUR);
  // Under way or stopped short, the voyage is bound for the harbour still (`Passage.bound`), so the two read alike.
  assert.equal(course.due(null, HARBOUR), null, 'under way or stopped short, out of reach');
  assert.deepEqual(course.making, DOCK, 'still made for');
  assert.equal(course.due({ kind: 'ashore' }, HARBOUR), null, 'off its coast, far from its harbour');
  assert.deepEqual(course.making, DOCK);
  assert.deepEqual(course.due({ kind: 'dock', port: 'Overlook' }, HARBOUR), DOCK, 'in reach');
  assert.equal(course.due({ kind: 'dock', port: 'Overlook' }, HARBOUR), null, 'taken once');
  course.begin(DOCK, HARBOUR);
  assert.equal(course.due(null, [5, 5]), null);
  assert.equal(course.making, null, 'sent elsewhere, it is let go');
  course.begin(DOCK, HARBOUR);
  assert.equal(course.due(null, null), null);
  assert.equal(course.making, null, 'at anchor out of reach, let go');
});
