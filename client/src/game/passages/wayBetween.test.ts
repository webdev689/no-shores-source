import assert from 'node:assert/strict';
import { test } from 'node:test';
import { READY_WAIT_S, type Flow } from '../flow.ts';
import type { Foot } from '../foot.ts';
import type { NodeInfo } from '../worldData.ts';
import type { Interface } from '../../ui/ui.ts';
import { DOWN_S, DRAW_S, LEAVE_S, LEG_DOTS, RISE_S, WALK_S, type WayFrame } from './passageWay.ts';
import { WayBetween } from './wayBetween.ts';

Object.assign(globalThis, { innerWidth: 1280, innerHeight: 720, document: { exitPointerLock: () => undefined } });

/** Longer than any way plays. */
const PLAYED_S = RISE_S + DRAW_S + DOWN_S + WALK_S + 1;

/** A game's stand-in: its flow, whether the place has come, the body its room stood, the walker's body and bearing,
 *  and what a failed way was sent back for. */
function game() {
  const held = {
    flow: { mode: 'foot', node: 'saltgrass-downs' } as Flow,
    ready: true,
    readied: 0,
    own: null as unknown,
    body: { x: 100, y: 200, z: 5 },
    facing: 0,
    fellBack: null as { place: string; back?: NodeInfo; error?: unknown } | null,
  };
  const ways = new WayBetween({
    flow: () => held.flow,
    setFlow: (flow) => (held.flow = flow),
    setReady: (ready) => ((held.ready = ready), (held.readied += Number(ready))),
    foot: () => (held.own ? ({ fight: { own: held.own } } as unknown as Foot) : null),
    player: () => ({ body: held.body, facing: held.facing }),
    face: (facing) => (held.facing = facing),
    fallback: (place, back) => {
      const fellBack: { place: string; back?: NodeInfo; error?: unknown } = { place, back };
      return (error) => ((fellBack.error = error), (held.fellBack = fellBack));
    },
  });
  return { held, ways };
}

const ui = { size: { width: 1280, height: 720, scale: 1 } } as unknown as Interface;
const cross = { kind: 'cross', node: 'gullwing-vale', name: 'The Gullwing Vale' } as const;
const onward = { kind: 'onward', node: 'passage-continent-1-w1-z7' } as const;
const settle = () => new Promise((resolve) => setTimeout(resolve));

/** Plays frames of `seconds` until the way has played or `most` frames have gone. */
function playOut(ways: WayBetween, held: { ready: boolean }, seconds: number, most: number, whole = true) {
  let shown = ways.passing(seconds, held.ready, whole);
  for (let frame = 0; frame < most && shown !== null; frame++) shown = ways.passing(seconds, held.ready, whole);
  return shown;
}

test('a crossing gate plays the way between the two patrol zones, never the veil, and ends on foot in the far zone', async () => {
  const { held, ways } = game();
  const pass = { kind: 'pass', node: 'mill', name: 'The Mill', into: true } as const;
  assert.equal(
    ways.cross(pass, [0, 0], [1, 1], () => Promise.resolve()),
    false,
    'a gate into an instance is no way',
  );
  let joined = false;
  const work = () => ((joined = true), Promise.resolve());
  assert.equal(ways.cross(cross, [2_800_000, 1_290_000], [2_330_000, 1_900_000], work), true);
  assert.deepEqual(held.flow, { mode: 'passing', then: { mode: 'foot', node: 'gullwing-vale' } });
  assert.equal(held.ready, false);
  const over = ways.passing(1, held.ready, false);
  assert.ok(over && over !== 'place' && over.eye[2] > 1_000, 'risen over the island');
  await settle();
  assert.ok(joined && held.ready, 'the far zone joined behind the way');
  // Held over the island until the far room has stood the body, then down to it and on foot.
  assert.notEqual(ways.passing(PLAYED_S, held.ready, true), null);
  held.own = { x: -50, y: 30, z: 2 };
  assert.equal(playOut(ways, held, 0.5, 20), null);
  assert.deepEqual(held.flow, { mode: 'foot', node: 'gullwing-vale' });
  assert.equal(held.fellBack, null);
});

test('the way rises from the shot the foot’s camera last stood at, not from a fixed one', () => {
  const { ways } = game();
  const own = { eye: [90, 210, 8], yaw: 2, pitch: 0.3, fov: 0.9, near: 0.1, far: 900 } as const;
  assert.equal(ways.shot(own), own);
  ways.cross(cross, [0, 0], [5_000, 5_000], () => Promise.resolve());
  const first = ways.passing(0.001, false, false);
  assert.ok(first && first !== 'place');
  assert.ok(Math.hypot(first.eye[0] - 90, first.eye[1] - 210, first.eye[2] - 8) < 0.5, 'the eye where it was');
  assert.ok(Math.abs(first.yaw - 2) < 0.01 && Math.abs(first.fov - 0.9) < 0.01, 'looking where it looked');
});

test('the character walks into the mouth taken, the camera on foot, before the room is left and the camera rises', () => {
  const { held, ways } = game();
  let joined = false;
  const work = () => ((joined = true), Promise.resolve());
  // The mouth stands due east of the body.
  ways.play(
    { happening: onward, come: [[0, 0]], to: [3_000, 0], framed: [], place: 'a chalk cut', mouth: [104, 200] },
    work,
  );
  assert.equal(ways.passing(0.1, false, false), 'place', 'the place left drawn on foot');
  assert.ok(Math.abs(held.facing - Math.PI / 2) < 1e-9, 'turned to face the mouth');
  assert.ok(ways.walk()?.held('forward'), 'walked forward');
  assert.ok(!ways.walk()?.held('use') && !ways.walk()?.held('leave'), 'nothing else pressed');
  assert.equal(joined, false, 'the room is not left while the body walks to the mouth');
  // At the mouth the leave is over: the room gone to is joined and the camera rises.
  held.body = { x: 103.8, y: 200, z: 5 };
  const risen = ways.passing(0.1, false, false);
  assert.ok(risen && risen !== 'place');
  assert.ok(joined);
  assert.equal(ways.walk(), null, 'standing over the island');
});

test('a leave that never reaches its mouth ends once it has walked its time', () => {
  const { ways } = game();
  ways.play({ happening: onward, come: [[0, 0]], to: [3_000, 0], framed: [], place: 'a cut', mouth: [900, 200] }, () =>
    Promise.resolve(),
  );
  let walked = 0;
  while (ways.passing(0.1, false, false) === 'place' && walked < 100) walked += 0.1;
  assert.ok(Math.abs(walked - LEAVE_S) < 0.15, `walked ${walked} s`);
  assert.equal(ways.walk(), null);
});

test('once come down, a frame not drawn whole never stops the way, nor keeps the body walking', async () => {
  const { held, ways } = game();
  ways.cross(cross, [0, 0], [5_000, 5_000], () => Promise.resolve());
  ways.passing(0.01, held.ready, false);
  await settle();
  held.own = { x: -50, y: 30, z: 2 };
  ways.passing(PLAYED_S, held.ready, false);
  assert.equal(ways.passing(0.01, held.ready, true), 'place');
  // The ground round the walk is still built, a figure stands in: the place is no longer drawn whole.
  assert.equal(playOut(ways, held, 0.1, 60, false), null, 'played to its end in time');
  assert.deepEqual(held.flow, { mode: 'foot', node: 'gullwing-vale' });
});

test('the way waits over the island until the place gone to is drawn whole, then comes down and walks in', async () => {
  const { held, ways } = game();
  ways.cross(cross, [0, 0], [5_000, 5_000], () => Promise.resolve());
  ways.passing(0.01, held.ready, false);
  await settle();
  held.own = { x: -50, y: 30, z: 2 };
  const waited = ways.passing(PLAYED_S, held.ready, false);
  assert.ok(waited && waited !== 'place', 'still over the island');
  assert.ok(ways.landed(), 'the place is drawn unseen under it');
  assert.ok(ways.passing(1, held.ready, false) !== 'place');
  assert.equal(ways.passing(0.01, held.ready, true), 'place', 'drawn whole, the way comes down');
  // Down, then the walk in, stepped forward.
  let walked = false;
  let shown = ways.passing(0.01, held.ready, true);
  for (let frame = 0; frame < 100 && shown !== null; frame++, shown = ways.passing(0.1, held.ready, true))
    walked ||= !!ways.walk()?.held('forward');
  assert.ok(walked, 'the character walks in');
  assert.equal(ways.walk(), null);
});

test('a place never drawn whole is waited on as the veil waits, then the way comes down', async () => {
  const { held, ways } = game();
  ways.cross(cross, [0, 0], [5_000, 5_000], () => Promise.resolve());
  ways.passing(0.01, held.ready, false);
  await settle();
  held.own = { x: -50, y: 30, z: 2 };
  assert.ok(ways.passing(READY_WAIT_S - 1, held.ready, false) !== 'place');
  assert.equal(playOut(ways, held, 0.5, 40, false), null);
  assert.deepEqual(held.flow, { mode: 'foot', node: 'gullwing-vale' });
});

test('a room that never stands the body is waited on as the veil waits, then the way comes down', async () => {
  const { held, ways } = game();
  ways.cross(cross, [0, 0], [5_000, 5_000], () => Promise.resolve());
  ways.passing(0.01, held.ready, false);
  await settle();
  assert.equal(playOut(ways, held, 0.1, 400), null, 'on foot in the far zone');
  assert.deepEqual(held.flow, { mode: 'foot', node: 'gullwing-vale' });
});

test('the way’s dots go with the way once the flow leaves it, however it ends', () => {
  const { held, ways } = game();
  ways.cross(cross, [0, 0], [5_000, 5_000], () => Promise.resolve());
  ways.passing(2, false, false);
  assert.ok(ways.dots(ui), 'drawn over the island');
  // The room gone to shut while the way was held: the player is sent to their ship.
  held.flow = { mode: 'sea' };
  assert.equal(ways.dots(ui), null);
});

test('a way ended by another road while its room was joined never readies the place nor fails', async () => {
  const { held, ways } = game();
  let finish = () => undefined as void;
  ways.cross(cross, [0, 0], [5_000, 5_000], () => new Promise<void>((resolve) => (finish = resolve)));
  ways.passing(0.01, false, false);
  // The new room shut meanwhile: the player is sent to their ship behind the veil.
  held.flow = { mode: 'loading', words: 'Returning to your ship', then: { mode: 'sea' } };
  ways.passing(0.01, false, false);
  finish();
  await settle();
  assert.equal(held.readied, 0, 'the sea trip’s veil is not lifted by the way');
  const failing = game();
  failing.ways.cross(cross, [0, 0], [5_000, 5_000], () => Promise.reject(new Error('the room is full')));
  failing.held.flow = { mode: 'sea' };
  await settle();
  assert.equal(failing.held.fellBack, null);
});

test('a way that fails is sent back as it was set out, for the place it went to', async () => {
  const { held, ways } = game();
  const patrol = { id: 'saltgrass-downs' } as NodeInfo;
  const happening = onward;
  const played = { happening, come: [[0, 0]] as const, to: [3_000, 0] as const, framed: [], place: 'a chalk cut' };
  ways.play({ ...played, back: patrol }, () => Promise.reject(new Error('the room could not be reached')));
  ways.passing(0.01, false, false);
  await settle();
  assert.equal(held.fellBack?.place, 'a chalk cut');
  assert.equal(held.fellBack?.back, patrol);
  assert.equal((held.fellBack?.error as Error).message, 'the room could not be reached');
  assert.equal(ways.dots(ui), null, 'the way is over');
});

test('the way so far is drawn before the leg being taken', () => {
  const { ways } = game();
  const come = [
    [0, 0],
    [1_000, 0],
    [2_000, 0],
  ] as const;
  ways.play({ happening: onward, come, to: [3_000, 0], framed: [], place: 'a cut' }, () => Promise.resolve());
  ways.passing(1, false, false);
  const dots = (ways as unknown as { way: { frame: WayFrame } }).way.frame.dots;
  assert.equal(dots.filter((dot) => !dot.taking).length, 1 + 2 * LEG_DOTS);
});
