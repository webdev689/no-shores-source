import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { blowFrame, type Doing, likelyMoves, shownMove } from './playerMoves.ts';

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
  roll: 6,
};
const frames = (anim: string) => FRAMES[anim] ?? 4;
const everything = () => true;
/** The forge before its next work: its blows, the bow's own holds and the roll undrawn. */
const NEXT = /^((over|side|thrust)(1h|haft|hilt|pair)|bow(ready|walk|run)|roll)$/;
const classic = (anim: string) => !NEXT.test(anim);
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
  assert.equal(shownMove(doing, frames, classic).anim, 'idle');
  assert.deepEqual(shownMove({ ...doing, moving: true }, frames, classic), {
    anim: 'walk',
    frame: null,
    frameSeconds: 0.25,
  });
  assert.equal(shownMove({ ...doing, moving: true, running: true }, frames, classic).frameSeconds, 0.125);
  assert.equal(shownMove({ ...doing, crouched: true, moving: true }, frames, classic).anim, 'crouch_walk');
  assert.equal(shownMove({ ...doing, right: 'bow_long_iron', moving: true }, frames, classic).anim, 'walk_bow');
  assert.equal(shownMove({ ...doing, left: 'shield_kite_iron' }, frames, classic).anim, 'guard');
});

test('a blow plays one stroke of its swing; up thrusts, down chops, sideways swings two-handed', () => {
  const blow = (direction: 'downLeft' | 'up' | 'down' | 'left', second: boolean, progress: number) =>
    shownMove({ ...doing, blow: { direction, second, progress } }, frames, classic);
  assert.deepEqual(blow('downLeft', false, 0), { anim: 'attack_sword', frame: 0, frameSeconds: 0 });
  assert.deepEqual(blow('downLeft', true, 0.99), { anim: 'attack_sword', frame: 5, frameSeconds: 0 });
  // The stroke's three frames run through the last three quarters of the wind-up, the last landing with the blow (two fifths
  // through the swing, DFO's law), and hold through the follow-through: a sword's swing is struck in 0.4 s of its second.
  assert.deepEqual(
    [0.1, 0.2, 0.31, 0.39, 0.4, 0.7].map((progress) => blow('downLeft', false, progress).frame),
    [0, 0, 1, 1, 2, 2],
  );
  const late = shownMove(
    { ...doing, blow: { direction: 'down', second: false, progress: 0.45, lands: 0.5 } },
    frames,
    classic,
  );
  assert.equal(late.frame, 1, 'a heavier blow that lands later shows its last frame later');
  assert.equal(blow('up', false, 0).anim, 'thrust');
  assert.equal(blow('down', false, 0).anim, 'chop');
  assert.equal(blow('left', false, 0).anim, 'swing2h');
  // An axe's own swing, where the weapon draws no thrust.
  const axe = shownMove(
    { ...doing, right: 'axe_iron', blow: { direction: 'up', second: false, progress: 0 } },
    frames,
    (anim: string) => classic(anim) && anim !== 'thrust',
  );
  assert.equal(axe.anim, 'attack_axe');
});

test("a shot plays its weapon's own move whole, then its reload; a brace fires right then left", () => {
  const shot = (right: string, left: string | null, reload: boolean, second: boolean, progress: number) =>
    shownMove({ ...doing, right, left, blow: { direction: null, second, progress, reload } }, frames, classic);
  assert.deepEqual(shot('thunderlock', null, false, true, 0.99), { anim: 'gunshot', frame: 5, frameSeconds: 0 });
  assert.deepEqual(shot('thunderlock', null, true, false, 0.5), { anim: 'gunreload', frame: 2, frameSeconds: 0 });
  assert.equal(shot('pistolet', null, true, false, 0).anim, 'pistolreload');
  assert.deepEqual(shot('pistolet', 'pistolet_l', false, true, 0), { anim: 'braceshot', frame: 3, frameSeconds: 0 });
  assert.equal(shot('crossbow_iron', null, false, false, 0.5).anim, 'bow');
  assert.equal(shot('crossbow_iron', null, true, false, 0.5).anim, 'idle_bow');
});

test('in the air the jump shows rising, at the top and falling; on a wall the climb moves', () => {
  assert.equal(shownMove({ ...doing, mode: 'air', vz: 3 }, frames, classic).frame, 0);
  assert.equal(shownMove({ ...doing, mode: 'air', vz: 0 }, frames, classic).frame, 1);
  assert.equal(shownMove({ ...doing, mode: 'air', vz: -3 }, frames, classic).frame, 2);
  assert.deepEqual(shownMove({ ...doing, mode: 'mantle', over: 0.6 }, frames, classic), {
    anim: 'mantle',
    frame: 2,
    frameSeconds: 0,
  });
  assert.equal(shownMove({ ...doing, mode: 'hang', moving: true }, frames, classic).anim, 'shimmy');
  assert.equal(shownMove({ ...doing, mode: 'climb' }, frames, classic).frame, 0);
});

test('mounted, the horse walks and gallops; a move chosen by hand plays over everything', () => {
  assert.equal(shownMove({ ...doing, mounted: true, moving: true, speed: 12 }, frames, classic).anim, 'horsegallop');
  assert.equal(shownMove({ ...doing, mounted: true, moving: true, speed: 6 }, frames, classic).anim, 'horsewalk');
  assert.equal(shownMove({ ...doing, act: { anim: 'death', progress: 0.5 } }, frames, classic).anim, 'death');
});

test('an off hand: two blades fight as a pair, and a shield or blade in the left keeps the weapon’s own attack', () => {
  const pair = { ...doing, left: 'dagger_iron_l' };
  assert.equal(shownMove(pair, frames, classic).anim, 'twinguard');
  assert.equal(shownMove({ ...pair, right: null }, frames, classic).anim, 'twinguard');
  const up = { direction: 'up', second: false, progress: 0 } as const;
  assert.equal(shownMove({ ...pair, blow: up }, frames, classic).anim, 'twinslash');
  assert.equal(shownMove({ ...doing, left: 'shield_kite_iron', blow: up }, frames, classic).anim, 'slash');
  assert.equal(shownMove({ ...doing, blow: up }, frames, classic).anim, 'thrust');
});

test('a shield or second blade pairs only with a weapon the forge draws in the pair’s moves', () => {
  // An axe is drawn in none of the shield's or the pair's moves: it keeps its own; the shield or blade is worn.
  const axeDraws = (anim: string, held: string | null) =>
    classic(anim) && (held !== 'axe_iron' || !['slash', 'twinslash'].includes(anim));
  assert.equal(shownMove({ ...doing, right: 'axe_iron', left: 'shield_kite_iron' }, frames, axeDraws).anim, 'idle');
  const axeBlow = {
    ...doing,
    right: 'axe_iron',
    left: 'sword_iron_l',
    blow: { direction: 'down', second: false, progress: 0 },
  } as const;
  assert.equal(shownMove(axeBlow, frames, axeDraws).anim, 'attack_axe');
  assert.equal(shownMove({ ...doing, left: 'shield_kite_iron' }, frames, classic).anim, 'guard');
});

test('the likeliest moves are the kit’s, the strokes of a weapon held alone, and the moves on foot', () => {
  const alone = likelyMoves('sword_iron', null, classic);
  for (const anim of ['idle', 'walk', 'attack_sword', 'thrust', 'chop', 'swing2h', 'run', 'jump'])
    assert.ok(alone.includes(anim));
  const paired = likelyMoves('sword_iron', 'dagger_iron_l', classic);
  assert.ok(paired.includes('twinslash') && !paired.includes('chop'));
  assert.equal(new Set(paired).size, paired.length);
});

test('running with a gun or a crossbow drawn plays its own run; put away, the plain run', () => {
  const running = { ...doing, moving: true, running: true, speed: 7.6 };
  assert.equal(shownMove({ ...running, right: 'thunderlock' }, frames, classic).anim, 'gunrun');
  assert.equal(shownMove({ ...running, right: 'pistolet' }, frames, classic).anim, 'pistolrun');
  assert.equal(shownMove({ ...running, right: 'pistolet', left: 'pistolet_l' }, frames, classic).anim, 'bracerun');
  assert.equal(shownMove({ ...running, right: 'crossbow_iron' }, frames, classic).anim, 'xbowrun');
  assert.equal(shownMove({ ...running, right: 'crossbow_iron', drawn: false }, frames, classic).anim, 'run');
  assert.ok(likelyMoves('crossbow_iron', null, classic).includes('xbowrun'));
});

test('a gun aimed holds its shot at the frame it is aimed, before it fires; a bow is drawn through its draw', () => {
  const aimed = (right: string, left: string | null = null) =>
    shownMove({ ...doing, right, left, fight: { kind: 'draw', progress: 0.5 } }, frames, classic);
  assert.deepEqual(aimed('thunderlock_iron'), { anim: 'gunshot', frame: 1, frameSeconds: 0 });
  assert.deepEqual(aimed('pistolet_iron'), { anim: 'pistolshot', frame: 1, frameSeconds: 0 });
  assert.deepEqual(aimed('pistolet_iron', 'pistolet_iron_l'), { anim: 'braceshot', frame: 0, frameSeconds: 0 });
  assert.equal(aimed('bow_long_elven').anim, 'bow');
});

test("the owner's blows: the swing's stroke in the weapon's hold, nine frames, landing on the fifth", () => {
  const blow = (direction: 'down' | 'up' | 'left', right: string, left: string | null = null, progress = 0) =>
    shownMove({ ...doing, right, left, blow: { direction, second: false, progress } }, frames, everything);
  assert.equal(blow('down', 'sword_iron').anim, 'over1h');
  assert.equal(blow('up', 'sword_iron').anim, 'thrust1h');
  assert.equal(blow('left', 'mace_iron').anim, 'side1h');
  assert.equal(blow('down', 'axe_iron').anim, 'overhaft');
  assert.equal(blow('down', 'warhammer_iron').anim, 'overhaft');
  assert.equal(blow('up', 'dagger_iron', 'dagger_iron_l').anim, 'thrustpair');
  // A shield is drawn in no blow: the weapon's own attack plays.
  const shieldless = (anim: string, held: string | null) => !(held?.startsWith('shield_') && NEXT.test(anim));
  const guarded = {
    ...doing,
    left: 'shield_kite_iron',
    blow: { direction: 'down', second: false, progress: 0 },
  } as const;
  assert.equal(shownMove(guarded, frames, shieldless).anim, 'slash');
  // Landing two fifths through the swing: the first frame held, then four through the last three quarters of the time
  // up to it, the fifth as it lands, and the rest over a little over half that time after.
  assert.deepEqual(
    [0, 0.2, 0.31, 0.39, 0.4, 0.45, 0.55, 1].map((progress) => blowFrame(progress, 0.4)),
    [0, 1, 2, 3, 4, 5, 7, 8],
  );
  assert.equal(blow('down', 'sword_iron', null, 0.4).frame, 4);
  // A torch in the left is drawn in no blow: the guard's slash plays, as before the blows.
  const unlit = (anim: string, held: string | null) => !(held === 'torch_l' && NEXT.test(anim));
  const torchBlow = { ...doing, left: 'torch_l', blow: { direction: 'up', second: false, progress: 0 } } as const;
  assert.equal(shownMove(torchBlow, frames, unlit).anim, 'slash');
  // Every swing strikes a blow: the blows are composed ahead, the old strokes no longer.
  const likely = likelyMoves('sword_iron', null, everything);
  assert.ok(['over1h', 'side1h', 'thrust1h'].every((anim) => likely.includes(anim)));
  assert.ok(!likely.includes('chop') && !likely.includes('attack_sword'));
});

test('a bow drawn stands, walks and sprints in its own holds; undrawn there, it rests in the left fist', () => {
  const bow = { ...doing, right: 'bow_long_iron' };
  assert.equal(shownMove(bow, frames, everything).anim, 'bowready');
  assert.equal(shownMove({ ...bow, moving: true }, frames, everything).anim, 'bowwalk');
  assert.equal(shownMove({ ...bow, moving: true, running: true }, frames, everything).anim, 'bowrun');
  assert.equal(shownMove(bow, frames, classic).anim, 'idle_bow');
});

test('a dodge rolls through its span, on the ground and in the air; with no roll drawn, the hop', () => {
  const dodging = { ...doing, fight: { kind: 'dodge', progress: 0.5 } } as const;
  assert.deepEqual(shownMove(dodging, frames, everything), { anim: 'roll', frame: 3, frameSeconds: 0 });
  assert.equal(shownMove({ ...dodging, mode: 'air', vz: 3 }, frames, everything).anim, 'roll');
  assert.equal(shownMove(dodging, frames, classic).anim, 'idle', 'on the ground, the hop stands');
  assert.equal(shownMove({ ...dodging, mode: 'air', vz: 3 }, frames, classic).anim, 'jump');
  assert.equal(shownMove({ ...dodging, mounted: true }, frames, everything).anim, 'horseidle', 'mounted, the horse');
});
