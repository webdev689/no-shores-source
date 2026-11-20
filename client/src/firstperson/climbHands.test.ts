import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Climb, ClimbHands, type ClimbLook, type ClimbShown, gait, shimmyGait } from './climbHands.ts';
import { climbFrame, climbPlace } from './climbing.ts';

const FRAME = 1 / 60;
const NORTH = 0;
const SQUARE: ClimbLook = { yaw: NORTH, pitch: 0, fov: (50 * Math.PI) / 180, aspect: 16 / 9 };
const hanging = (east = 0): Climb => ({ mode: 'hang', feet: [east, 0, 1], wall: NORTH, over: 0, rise: 0 });
const climbing = (up = 0, east = 0): Climb => ({ mode: 'climb', feet: [east, 0, up], wall: NORTH, over: 0, rise: 0 });

/** Steps the hands frame by frame through `climbs`, seen through `look`, and answers the last frame. */
function run(hands: ClimbHands, climbs: readonly Climb[], look: ClimbLook = SQUARE, present = 1): ClimbShown {
  let shown: ClimbShown = { grips: [], reach: null };
  for (const climb of climbs) shown = hands.step(FRAME, climb, look, present);
  return shown;
}
const held = (frames: number, climb: Climb) => Array.from({ length: frames }, () => climb);
const grip = (shown: ClimbShown, hand: 'left' | 'right') => shown.grips.find((each) => each.hand === hand);

test('the hands come up onto the wall from under the screen, held square, the right the mirror of the left', () => {
  const hands = new ClimbHands();
  const below = hands.step(FRAME, hanging(), SQUARE, 0);
  assert.equal(below.grips.length, 0, 'under the screen before they come');
  const shown = run(hands, held(30, hanging()));
  const [left, right] = [grip(shown, 'left'), grip(shown, 'right')];
  assert.ok(left && right);
  const [leftBox, rightBox] = [
    climbPlace('grip', 'left', left.x, left.y, 150)(),
    climbPlace('grip', 'right', right.x, right.y, 150)(),
  ];
  assert.equal(leftBox.flip, false);
  assert.equal(rightBox.flip, true);
  // A still hang sways both fists the same way, 1.2 design pixels at most.
  assert.ok(Math.abs(leftBox.x + leftBox.width - (320 - rightBox.x)) < 2 * 1.2 + 1e-9, 'mirrored about the middle');
  assert.ok(leftBox.y + leftBox.height > 200, 'the sleeve runs off the screen’s foot');
  assert.deepEqual([left.open, right.open], [0, 0], 'both holding the stone');
  assert.equal(shown.reach, null);
  assert.deepEqual([climbFrame(0), climbFrame(1), climbFrame(1, 'reach')], [0, 5, 4]);
});

test('shimmying, the hand the body goes toward reaches first and the other closes up after it', () => {
  const hands = new ClimbHands();
  run(hands, held(30, hanging()));
  const reached: string[] = [];
  let east = 0;
  for (let frame = 0; frame < 60; frame++) {
    east += 1 * FRAME;
    const shown = hands.step(FRAME, hanging(east), SQUARE, 1);
    for (const hand of ['left', 'right'] as const)
      if ((grip(shown, hand)?.open ?? 0) > 0.5 && reached.at(-1) !== hand) reached.push(hand);
  }
  assert.deepEqual(reached.slice(0, 3), ['right', 'left', 'right'], 'going right, the right leads, in turns');
  const before = grip(run(hands, held(30, hanging(east))), 'left');
  const after = grip(run(hands, [hanging(east + 0.05)]), 'left');
  assert.ok(before && after && after.x < before.x, 'a hand on the lip keeps its stone as the body passes it');
});

test('climbing, the hands go hand over hand, a held one going down the view as the body climbs past it', () => {
  const hands = new ClimbHands();
  run(hands, held(30, climbing()));
  let [up, alternated, sank] = [0, 0, false];
  let reaching: string | null = null;
  for (let frame = 0; frame < 120; frame++) {
    const before = hands.step(0, climbing(up), SQUARE, 1);
    up += 1 * FRAME;
    const shown = hands.step(FRAME, climbing(up), SQUARE, 1);
    const open = shown.grips.filter((each) => each.open > 0.5).map((each) => each.hand);
    assert.ok(open.length <= 1, 'never both off the wall');
    if (open[0] && open[0] !== reaching) [reaching, alternated] = [open[0], alternated + 1];
    for (const hand of ['left', 'right'] as const) {
      const [was, now] = [grip(before, hand), grip(shown, hand)];
      if (was && now && was.open === 0 && now.open === 0 && now.y > was.y) sank = true;
    }
  }
  assert.ok(alternated >= 3, `the hands take turns (${alternated})`);
  assert.ok(sank, 'a hand holding its stone goes down the view');
});

test('looked away from the wall, the hand on that side lets go and reaches in from its own edge', () => {
  const right = new ClimbHands();
  run(right, held(30, hanging()));
  const looked = run(right, held(60, hanging()), { ...SQUARE, yaw: (90 * Math.PI) / 180 });
  assert.equal(looked.reach?.hand, 'right');
  assert.ok((looked.reach?.x ?? 0) > 100, 'from the right edge');
  assert.equal(grip(looked, 'right'), undefined, 'the right hand has let go of the stone');
  const left = new ClimbHands();
  run(left, held(30, hanging()));
  const leftward = run(left, held(60, hanging()), { ...SQUARE, yaw: (-90 * Math.PI) / 180 });
  assert.equal(leftward.reach?.hand, 'left');
  assert.ok((leftward.reach?.x ?? 999) < 20, 'from the left edge');
  const back = run(left, held(60, hanging()));
  assert.equal(back.reach, null, 'looked back at the wall, both hold on again');
  assert.equal(back.grips.length, 2);
});

test('the fists stay on the wall, not the screen: a turned view carries them across it', () => {
  const hands = new ClimbHands();
  const square = run(hands, held(30, hanging()));
  const turned = run(hands, held(5, hanging()), { ...SQUARE, yaw: (20 * Math.PI) / 180 });
  for (const hand of ['left', 'right'] as const)
    assert.ok((grip(turned, hand)?.x ?? 999) < (grip(square, hand)?.x ?? 0) - 20, `${hand} carried left`);
  assert.equal(turned.reach, null, 'a little off the wall, no reach');
});

test('going over a lip, the hands go down the view as the body rises, press on the top and let go', () => {
  const hands = new ClimbHands();
  const atLip = run(hands, held(30, hanging()));
  const mantle = (over: number): Climb => ({
    mode: 'mantle',
    feet: [0, 0, 1 + over * 1.8],
    wall: NORTH,
    over,
    rise: 1.8,
  });
  const rising = run(
    hands,
    Array.from({ length: 20 }, (unused, frame) => mantle((frame + 1) * 0.02)),
  );
  assert.ok(
    (grip(rising, 'left')?.y ?? 0) > (grip(atLip, 'left')?.y ?? 0),
    'down the view as the body rises past them',
  );
  const pressing = run(
    hands,
    Array.from({ length: 20 }, (unused, frame) => mantle(0.5 + (frame + 1) * 0.0125)),
  );
  assert.ok(
    pressing.grips.every((each) => each.open > 0.5),
    'the palms open on the top',
  );
  const done = run(
    hands,
    Array.from({ length: 20 }, (unused, frame) => mantle(0.75 + (frame + 1) * 0.0125)),
  );
  assert.equal(done.grips.length, 0, 'let go as the body stands');
});

test('the gaits: a limb holds its stone through its duty, then reaches one stride on', () => {
  assert.deepEqual(gait(0, 1, 0, 0.6), { anchor: 0.3, next: 0.3, swing: 0, cycle: 0 });
  assert.deepEqual(gait(0.8, 1, 0, 0.6), { anchor: 0.3, next: 1.3, swing: 0.5000000000000001, cycle: 0 });
  assert.deepEqual(shimmyGait(0, 0.5, 0.125, 0.2), { anchor: 0, next: 0, swing: 0, cycle: -1 });
  assert.ok(Math.abs(shimmyGait(0.1, 0.5, 0.125, 0.2).swing - 0.375) < 1e-12);
});

test('lowered out of the view, the hands forget the last climb: a new hold looked at square shows both fists', () => {
  const hands = new ClimbHands();
  run(hands, held(30, hanging()));
  const away = run(hands, held(60, hanging()), { ...SQUARE, yaw: (90 * Math.PI) / 180 });
  assert.ok(away.reach, 'reaching while looked away');
  hands.step(FRAME, null, SQUARE, 0);
  const caught = hands.step(FRAME, hanging(), SQUARE, 1);
  assert.equal(caught.reach, null, 'no reaching arm on the new hold');
  assert.equal(caught.grips.length, 2, 'both fists on it');
});

test('a frame of no known length moves nothing, and the hands go on from it', () => {
  const hands = new ClimbHands();
  run(hands, held(30, hanging()));
  hands.step(Number.NaN, hanging(), SQUARE, 1);
  const shown = run(hands, held(5, hanging()));
  assert.equal(shown.grips.length, 2);
  assert.ok(shown.grips.every((each) => Number.isFinite(each.x) && Number.isFinite(each.y)));
});

test('looked down, the fists rise with the wall up to their slack, then go out of the view', () => {
  const hands = new ClimbHands();
  run(hands, held(30, hanging()));
  // A step of no time lays the hands out again without moving them.
  const tilted = (degrees: number) =>
    grip(hands.step(0, hanging(), { ...SQUARE, pitch: (degrees * Math.PI) / 180 }, 1), 'left');
  const level = tilted(0)?.y ?? 0;
  const [up, slight, deep] = [tilted(-3)?.y ?? 0, tilted(3)?.y ?? 0, tilted(45)?.y ?? 0];
  assert.ok(up > level, 'looked up, they go down the view');
  assert.ok(slight < level && slight > level - 34, 'a little down, they rise');
  assert.equal(deep, Math.max(200 - 150, level - 34), 'further down, no higher than the slack');
  assert.equal(tilted(85), undefined, 'straight down, out of the view');
});
