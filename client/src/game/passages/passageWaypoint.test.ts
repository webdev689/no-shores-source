import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PassageSeenState } from '../../network/passageMessages.ts';
import type { PassageDeal, PassagePiece, PassagePlan } from '../../rules/passageRules.ts';
import { passageWaypoint, type ZoneFoe } from './passageWaypoint.ts';

const piece = (kind: PassagePiece['kind'], number: number, x: number, y: number) =>
  ({ module: `passage.${kind}`, kind, number, at: [x, y, 0], facing: 0 }) as PassagePiece;

/** A zone of `deal` whose way in is at the origin, its two ways on at (0, 40) and (60, 0), the second the far one. */
function planOf(deal: PassageDeal, pieces: PassagePiece[] = [], lamp: number | null = null): PassagePlan {
  const ways = [
    { at: [0, 40], facing: 0 },
    { at: [60, 0], facing: 0 },
  ];
  return {
    zone: { deal, lamp },
    sites: { onward: ways, far: 1, lamp: lamp === null ? null : [20, 20] },
    pieces,
  } as unknown as PassagePlan;
}

const seenOf = (more: Partial<PassageSeenState> = {}): PassageSeenState => ({
  deal: '',
  done: false,
  lit: 0,
  broken: 0,
  held: 0,
  left: 0,
  wave: 0,
  open: false,
  lampLit: false,
  holding: null,
  ...more,
});

const foe = (x: number, y: number, name = '', standing = true): ZoneFoe => ({ at: [x, y], name, standing });

test('a fight points at the nearest foe standing, a Hunt at the Marked, a Reckoning at a collector', () => {
  const foes = [foe(5, 0), foe(30, 0, 'The Marked'), foe(3, 0, '', false), foe(40, 0, 'Collector')];
  assert.deepEqual(passageWaypoint(planOf('skirmish'), seenOf(), [0, 0], foes), [5, 0]);
  assert.deepEqual(passageWaypoint(planOf('hunt'), seenOf(), [0, 0], foes), [30, 0]);
  assert.deepEqual(passageWaypoint(planOf('reckoning'), seenOf(), [0, 0], foes), [40, 0]);
  assert.equal(passageWaypoint(planOf('ambush'), seenOf(), [0, 0], []), null, 'between waves, nothing to point at');
});

test('a mission points at the next of its pieces left: a dead lamp cold, a post whole, a node ungathered', () => {
  const lamps = [piece('kindle', 0, 10, 0), piece('kindle', 1, 50, 0), piece('kindle', 2, 90, 0)];
  assert.deepEqual(passageWaypoint(planOf('kindle', lamps), seenOf({ lit: 0b001 }), [0, 0], []), [50, 0]);
  const waves = [foe(1, 1)];
  assert.deepEqual(passageWaypoint(planOf('kindle', lamps), seenOf({ lit: 0b111 }), [0, 0], waves), [1, 1]);
  const posts = [piece('post', 0, 10, 0), piece('post', 1, 50, 0)];
  assert.deepEqual(passageWaypoint(planOf('sever', posts), seenOf({ broken: 0b01 }), [0, 0], []), [50, 0]);
  const nodes = [piece('node', 0, 10, 0), piece('node', 1, 20, 0)];
  assert.deepEqual(passageWaypoint(planOf('vein', nodes), seenOf(), [0, 0], [], [0]), [20, 0]);
  const ring = [piece('ring', 0, 7, 8)];
  assert.deepEqual(passageWaypoint(planOf('hold', ring), seenOf(), [0, 0], []), [7, 8]);
  assert.deepEqual(passageWaypoint(planOf('gauntlet'), seenOf(), [0, 0], []), [60, 0], 'the far mouth');
  const opened = seenOf({ open: true });
  assert.deepEqual(passageWaypoint(planOf('gauntlet'), opened, [0, 30], []), [60, 0], 'its mouths open from the start');
});

test('once its mouths are open the nearest way on; in a lamp’s zone its lamp, and Home there at the last', () => {
  const open = seenOf({ done: true, open: true });
  assert.deepEqual(passageWaypoint(planOf('skirmish'), open, [0, 30], []), [0, 40]);
  assert.deepEqual(passageWaypoint(planOf('lamp', [], 2), open, [0, 30], []), [20, 20], 'its lamp to light');
  const lit = seenOf({ done: true, open: true, lampLit: true });
  assert.deepEqual(passageWaypoint(planOf('lamp', [], 2), lit, [55, 0], []), [60, 0], 'then a way on');
  const deepest = {
    ...planOf('lamp', [], 4),
    sites: { onward: [], far: null, lamp: [20, 20] },
  } as unknown as PassagePlan;
  assert.deepEqual(passageWaypoint(deepest, lit, [0, 0], []), [20, 20], 'the fourth lamp, Home');
  const before = seenOf({ done: true, open: false, left: 30 });
  assert.equal(passageWaypoint(planOf('skirmish'), before, [0, 0], [foe(1, 1)]), null, 'a round done before they came');
  assert.equal(passageWaypoint(planOf('skirmish'), null, [0, 0], [foe(1, 1)]), null, 'before the room has said');
});
