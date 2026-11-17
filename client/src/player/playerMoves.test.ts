import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { type Doing, likelyMoves, shownMove } from './playerMoves.ts';

const FRAMES: Record<string, number> = {
  attack_sword: 6,
  attack_axe: 6,
  thrust: 6,
  chop: 6,
  swing2h: 6,
  jump: 3,
  mantle: 4,
  climb: 4,
  shimmy: 4,
  hang: 1,
  cast: 4,
  walk: 4,
  idle: 1,
  run: 4,
  walk_bow: 4,
  idle_bow: 1,
  bow: 4,
  gunshot: 6,
  gunreload: 4,
  pistolshot: 6,
  pistolreload: 4,
  braceshot: 6,
};
const frames = (anim: string) => FRAMES[anim] ?? 4;
const everything = () => true;
const doing: Doing = {
  mode: 'ground',
  moving: false,
  running: false,
  crouched: false,
  mounted: false,
  speed: 0,
  vz: 0,
  over: 0,
  drawn: true,
  right: 'sword_iron',
  left: null,
  blow: null,
  cast: null,
  act: null,
};

test('on foot: rest, walk, run and crouch, the weapon in hand choosing its own rest and walk', () => {
  assert.equal(shownMove(doing, frames, everything).anim, 'idle');
  assert.deepEqual(shownMove({ ...doing, moving: true }, frames, everything), {
    anim: 'walk',
    frame: null,
    frameSeconds: 0.25,
  });
  assert.equal(shownMove({ ...doing, moving: true, running: true }, frames, everything).frameSeconds, 0.125);
  assert.equal(shownMove({ ...doing, crouched: true, moving: true }, frames, everything).anim, 'crouch_walk');
  assert.equal(shownMove({ ...doing, right: 'bow_long_iron', moving: true }, frames, everything).anim, 'walk_bow');
  assert.equal(shownMove({ ...doing, left: 'shield_kite_iron' }, frames, everything).anim, 'guard');
});

test('a blow plays one stroke of its swing; up thrusts, down chops, sideways swings two-handed', () => {
  const blow = (direction: 'downLeft' | 'up' | 'down' | 'left', second: boolean, progress: number) =>
    shownMove({ ...doing, blow: { direction, second, progress } }, frames, everything);
  assert.deepEqual(blow('downLeft', false, 0), { anim: 'attack_sword', frame: 0, frameSeconds: 0 });
  assert.deepEqual(blow('downLeft', true, 0.99), { anim: 'attack_sword', frame: 5, frameSeconds: 0 });
  // The stroke's three frames run through the wind-up, the last landing with the blow (two fifths through the swing,
  // DFO's law), and hold through the follow-through: a sword's swing is struck in 0.4 s of its second.
  assert.deepEqual(
    [0.1, 0.25, 0.39, 0.4, 0.7].map((progress) => blow('downLeft', false, progress).frame),
    [0, 1, 1, 2, 2],
  );
  const late = shownMove(
    { ...doing, blow: { direction: 'down', second: false, progress: 0.45, lands: 0.5 } },
    frames,
    everything,
  );
  assert.equal(late.frame, 1, 'a heavier blow that lands later shows its last frame later');
  assert.equal(blow('up', false, 0).anim, 'thrust');
  assert.equal(blow('down', false, 0).anim, 'chop');
  assert.equal(blow('left', false, 0).anim, 'swing2h');
  // An axe's own swing, where the weapon draws no thrust.
  const axe = shownMove(
    { ...doing, right: 'axe_iron', blow: { direction: 'up', second: false, progress: 0 } },
    frames,
    (anim: string) => anim !== 'thrust',
  );
  assert.equal(axe.anim, 'attack_axe');
});

test("a shot plays its weapon's own move whole, then its reload; a brace fires right then left", () => {
  const shot = (right: string, left: string | null, reload: boolean, second: boolean, progress: number) =>
    shownMove({ ...doing, right, left, blow: { direction: null, second, progress, reload } }, frames, everything);
  assert.deepEqual(shot('thunderlock', null, false, true, 0.99), { anim: 'gunshot', frame: 5, frameSeconds: 0 });
  assert.deepEqual(shot('thunderlock', null, true, false, 0.5), { anim: 'gunreload', frame: 2, frameSeconds: 0 });
  assert.equal(shot('pistolet', null, true, false, 0).anim, 'pistolreload');
  assert.deepEqual(shot('pistolet', 'pistolet_l', false, true, 0), { anim: 'braceshot', frame: 3, frameSeconds: 0 });
  assert.equal(shot('crossbow_iron', null, false, false, 0.5).anim, 'bow');
  assert.equal(shot('crossbow_iron', null, true, false, 0.5).anim, 'idle_bow');
});

test('in the air the jump shows rising, at the top and falling; on a wall the climb moves', () => {
  assert.equal(shownMove({ ...doing, mode: 'air', vz: 3 }, frames, everything).frame, 0);
  assert.equal(shownMove({ ...doing, mode: 'air', vz: 0 }, frames, everything).frame, 1);
  assert.equal(shownMove({ ...doing, mode: 'air', vz: -3 }, frames, everything).frame, 2);
  assert.deepEqual(shownMove({ ...doing, mode: 'mantle', over: 0.6 }, frames, everything), {
    anim: 'mantle',
    frame: 2,
    frameSeconds: 0,
  });
  assert.equal(shownMove({ ...doing, mode: 'hang', moving: true }, frames, everything).anim, 'shimmy');
  assert.equal(shownMove({ ...doing, mode: 'climb' }, frames, everything).frame, 0);
});

test('mounted, the horse walks and gallops; a move chosen by hand plays over everything', () => {
  assert.equal(shownMove({ ...doing, mounted: true, moving: true, speed: 12 }, frames, everything).anim, 'horsegallop');
  assert.equal(shownMove({ ...doing, mounted: true, moving: true, speed: 6 }, frames, everything).anim, 'horsewalk');
  assert.equal(shownMove({ ...doing, act: { anim: 'death', progress: 0.5 } }, frames, everything).anim, 'death');
});

test('an off hand: two blades fight as a pair, and a shield or blade in the left keeps the weapon’s own attack', () => {
  const pair = { ...doing, left: 'dagger_iron_l' };
  assert.equal(shownMove(pair, frames, everything).anim, 'twinguard');
  assert.equal(shownMove({ ...pair, right: null }, frames, everything).anim, 'twinguard');
  const up = { direction: 'up', second: false, progress: 0 } as const;
  assert.equal(shownMove({ ...pair, blow: up }, frames, everything).anim, 'twinslash');
  assert.equal(shownMove({ ...doing, left: 'shield_kite_iron', blow: up }, frames, everything).anim, 'slash');
  assert.equal(shownMove({ ...doing, blow: up }, frames, everything).anim, 'thrust');
});

test('a shield or second blade pairs only with a weapon the forge draws in the pair’s moves', () => {
  // An axe is drawn in none of the shield's or the pair's moves: it keeps its own; the shield or blade is worn.
  const axeDraws = (anim: string, held: string | null) => held !== 'axe_iron' || !['slash', 'twinslash'].includes(anim);
  assert.equal(shownMove({ ...doing, right: 'axe_iron', left: 'shield_kite_iron' }, frames, axeDraws).anim, 'idle');
  const axeBlow = {
    ...doing,
    right: 'axe_iron',
    left: 'sword_iron_l',
    blow: { direction: 'down', second: false, progress: 0 },
  } as const;
  assert.equal(shownMove(axeBlow, frames, axeDraws).anim, 'attack_axe');
  assert.equal(shownMove({ ...doing, left: 'shield_kite_iron' }, frames, everything).anim, 'guard');
});

test('the likeliest moves are the kit’s, the strokes of a weapon held alone, and the moves on foot', () => {
  const alone = likelyMoves('sword_iron', null, everything);
  for (const anim of ['idle', 'walk', 'attack_sword', 'thrust', 'chop', 'swing2h', 'run', 'jump'])
    assert.ok(alone.includes(anim));
  const paired = likelyMoves('sword_iron', 'dagger_iron_l', everything);
  assert.ok(paired.includes('twinslash') && !paired.includes('chop'));
  assert.equal(new Set(paired).size, paired.length);
});

test('running with a gun or a crossbow drawn plays its own run; put away, the plain run', () => {
  const running = { ...doing, moving: true, running: true, speed: 7.6 };
  assert.equal(shownMove({ ...running, right: 'thunderlock' }, frames, everything).anim, 'gunrun');
  assert.equal(shownMove({ ...running, right: 'pistolet' }, frames, everything).anim, 'pistolrun');
  assert.equal(shownMove({ ...running, right: 'pistolet', left: 'pistolet_l' }, frames, everything).anim, 'bracerun');
  assert.equal(shownMove({ ...running, right: 'crossbow_iron' }, frames, everything).anim, 'xbowrun');
  assert.equal(shownMove({ ...running, right: 'crossbow_iron', drawn: false }, frames, everything).anim, 'run');
  assert.ok(likelyMoves('crossbow_iron', null, everything).includes('xbowrun'));
});

test('a gun aimed holds its shot at the frame it is aimed, before it fires; a bow is drawn through its draw', () => {
  const aimed = (right: string, left: string | null = null) =>
    shownMove({ ...doing, right, left, fight: { kind: 'draw', progress: 0.5 } }, frames, everything);
  assert.deepEqual(aimed('thunderlock_iron'), { anim: 'gunshot', frame: 1, frameSeconds: 0 });
  assert.deepEqual(aimed('pistolet_iron'), { anim: 'pistolshot', frame: 1, frameSeconds: 0 });
  assert.deepEqual(aimed('pistolet_iron', 'pistolet_iron_l'), { anim: 'braceshot', frame: 0, frameSeconds: 0 });
  assert.equal(aimed('bow_long_elven').anim, 'bow');
});
