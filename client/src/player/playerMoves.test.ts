import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { BOW_LOOSED } from '../firstperson/weaponMachine.ts';
import type { Action, FighterView } from '../rules/fighters.ts';
import { plainDress } from './dressing.ts';
import { fightOf } from './fightMoves.ts';
import type { Placed } from './figures.ts';
import {
  blowFrame,
  blowWay,
  type Doing,
  FULL_RUN,
  FULL_WALK,
  likelyMoves,
  steadyMoves,
  Loop,
  onTheMove,
  PlacedLoop,
  shownMove,
} from './playerMoves.ts';

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

test('a walk slower than a full walk steps as much slower, so the feet keep to the ground; never faster', () => {
  const walking = (speed: number) => shownMove({ ...doing, moving: true, speed }, frames, classic).frameSeconds;
  // A garrison's patrol strolls at about 1.53 m/s: its steps last 2.9 times a full walk's.
  assert.ok(Math.abs(walking(1.53) - (0.25 * FULL_WALK) / 1.53) < 1e-12);
  assert.equal(walking(FULL_WALK), 0.25);
  assert.equal(walking(5.4), 0.25, 'faster than a full walk, short of a run, at the full walk’s pace');
  const bow = { ...doing, right: 'bow_long_iron', moving: true, speed: FULL_WALK / 2 };
  assert.deepEqual(shownMove(bow, frames, classic), { anim: 'walk_bow', frame: null, frameSeconds: 0.5 });
  assert.equal(shownMove({ ...doing, speed: 1 }, frames, classic).frameSeconds, 0.25, 'the rest is not slowed');
});

test('a loop that slows goes on from the frame it shows, never jumping; it starts where the clock has it', () => {
  const loop = new Loop();
  const shown = (frameSeconds: number) => ({ anim: 'walk', frame: null, frameSeconds });
  assert.equal(loop.frame(shown(0.25), 4, 1 / 60, 10.3), 1, 'the clock’s frame first: 41 frames in');
  let was = 1;
  for (let step = 1; step <= 240; step++) {
    // Slowing from a full walk's frames to a stroll's half way through: a frame from the clock would jump back.
    const now = loop.frame(shown(step < 120 ? 0.25 : 0.72), 4, 1 / 60, 10.3 + step / 60);
    assert.ok(now === was || now === (was + 1) % 4, `frame ${was} to ${now} at step ${step}`);
    was = now;
  }
  assert.equal(loop.frame({ anim: 'mantle', frame: 2, frameSeconds: 0 }, 4, 1 / 60, 20), 2, 'a fixed frame as it is');
});

test('a figure the page moves walks at the pace it moved: a townsperson’s stroll steps slower than a full walk', () => {
  const dress = plainDress('human', 0.3);
  const one: Placed = { id: 1, x: 0, y: 0, z: 0, facing: 0, dress, anim: 'walk', frame: null, spin: false };
  const loop = new PlacedLoop();
  let changes = 0;
  let was = loop.frame(one, 4, 1 / 60, 0, 6);
  for (let step = 1; step <= 120; step++) {
    one.y -= 1.25 / 60;
    const now = loop.frame(one, 4, 1 / 60, step / 60, 6);
    if (now !== was) changes++;
    was = now;
  }
  // Two seconds at 1.25 m/s: 2.5 m, a frame each 1.1 m as a full walk's frames are drawn; at 6 a second, 12 frames.
  assert.equal(changes, 2);
  one.anim = 'idle';
  const idle = [1, 2, 3].map((step) => loop.frame(one, 4, 1 / 6, 2 + step / 6, 6));
  assert.equal(new Set(idle).size, 3, 'any other move loops at its own pace');
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
  assert.deepEqual(shot('pistolet', 'pistolet_l', false, true, 0.2), { anim: 'braceshot', frame: 3, frameSeconds: 0 });
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

test('a run slower than a full run, as a foe’s, strides as much slower; never faster', () => {
  const run = (speed: number) => shownMove({ ...doing, moving: true, running: true, speed }, frames, classic);
  assert.deepEqual(run(FULL_RUN), { anim: 'run', frame: null, frameSeconds: 0.125 });
  assert.ok(Math.abs(run(FULL_RUN * 0.75).frameSeconds - 0.125 / 0.75) < 1e-12, 'a foe’s run, at three quarters');
  assert.equal(run(FULL_RUN * 1.3).frameSeconds, 0.125, 'a Hasted run at the full run’s pace');
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

/** Each ranged kind as the figure holds it: its hands, its shot's move, the frame its shot leaves on (a gun's flash, a
 *  bow's or a crossbow's loose, as the forge draws them) and how far through the first person's shot it leaves. */
const RANGED = [
  { kind: 'bow', right: 'bow_long_iron', left: null, shot: 'bow', loose: 2, leaves: BOW_LOOSED },
  { kind: 'crossbow', right: 'crossbow_iron', left: null, shot: 'bow', loose: 2, leaves: 1 / 7 },
  { kind: 'pistolet', right: 'pistolet', left: null, shot: 'pistolshot', loose: 2, leaves: 1 / 6 },
  { kind: 'double pistolet', right: 'pistolet', left: 'pistolet_l', shot: 'braceshot', loose: 1, leaves: 1 / 6 },
  { kind: 'thunderlock', right: 'thunderlock_gilded', left: null, shot: 'gunshot', loose: 2, leaves: 1 / 7 },
] as const;
/** A foe's aimed shot, its wind-up 40 ticks. */
const aimedShot = (elapsed: number): Action => ({
  kind: 'telegraph',
  shape: 'aimed',
  elapsed,
  windup: 40,
  origin: [0, 0, 0],
  bearing: 0,
  ahead: 0,
  iron: false,
  feintAt: null,
});

for (const { kind, right, left, shot, loose, leaves } of RANGED)
  test(`a ${kind} aimed is held on the frame before its shot leaves, standing and walking; its shot plays on`, () => {
    const hands: Doing = { ...doing, right, left };
    const bow = kind === 'bow';
    // As the walker asks: a bow's draw is the first person's, held at half its shot; any other the fight's draw.
    const aimed = (moving: boolean) =>
      shownMove(
        bow
          ? { ...hands, moving, blow: { direction: null, second: false, progress: 0.5 } }
          : { ...hands, moving, fight: { kind: 'draw', progress: 1 } },
        frames,
        everything,
        onTheMove,
      );
    assert.deepEqual(aimed(false), { anim: shot, frame: loose - 1, frameSeconds: 0 }, 'standing');
    assert.deepEqual(aimed(true), { anim: onTheMove(shot), frame: loose - 1, frameSeconds: 0 }, 'walking');
    const drawn = shownMove({ ...hands, fight: { kind: 'draw', progress: 1 } }, frames, everything);
    assert.equal(drawn.frame, loose - 1, "a foe's full draw the same");
    const fired = (progress: number, second = false) =>
      shownMove({ ...hands, blow: { direction: null, second, progress } }, frames, everything).frame;
    assert.deepEqual(
      [fired(bow ? 0.5 : 0), fired(leaves - 0.001), fired(leaves), fired(0.999)],
      [loose - 1, loose - 1, loose, frames(shot) / (left ? 2 : 1) - 1],
      'loosed from the aim: held until the shot leaves, then its flash or loose, then the rest',
    );
    if (left) assert.deepEqual([fired(0, true), fired(leaves, true)], [2, 3], 'the left raised, then fired');
    // A foe's aimed shot draws through its wind-up and holds its own weapon aimed, never the bow's move without a bow.
    const foe = (elapsed: number) =>
      shownMove({ ...hands, fight: fightOf({ action: aimedShot(elapsed) } as FighterView) }, frames, everything);
    assert.deepEqual(foe(24), { anim: shot, frame: loose - 1, frameSeconds: 0 }, "a foe's aimed shot");
  });

test("the player's bow is held at its full draw while the first person's is drawn, and looses only as the arrow leaves", () => {
  const bow = (progress: number, moving = false) =>
    shownMove(
      { ...doing, right: 'bow_long_iron', moving, blow: { direction: null, second: false, progress } },
      frames,
      everything,
      onTheMove,
    );
  // The forge's bow move: drawing, fully drawn, loosed, lowered.
  assert.deepEqual(
    [0, 0.25, 0.5, 0.6].map((share) => bow(share).frame),
    [0, 1, 1, 1],
    'drawn, then held fully drawn',
  );
  assert.deepEqual(
    [BOW_LOOSED, 0.9].map((share) => bow(share).frame),
    [2, 3],
    'loosed, then lowered',
  );
  assert.deepEqual(bow(0.5, true), { anim: 'bowshotwalk', frame: 1, frameSeconds: 0 }, 'on the move too');
  assert.equal(
    shownMove(
      { ...doing, right: 'crossbow_iron', blow: { direction: null, second: false, progress: 0.5 } },
      frames,
      classic,
    ).frame,
    2,
    "a crossbow's shot plays its frames straight through",
  );
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
  const greatsword = {
    ...doing,
    right: 'sword_iron',
    grip: 'hilt',
    blow: { direction: 'left', second: false, progress: 0 },
  };
  assert.equal(shownMove(greatsword as Doing, frames, everything).anim, 'sidehilt', 'a greatsword on its hilt');
  assert.ok(likelyMoves('sword_iron', null, everything, 'hilt').includes('overhilt'));
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

test('a blow struck on the move walks on once its frames have played, rather than stand mid-stride', () => {
  const onTheMove = (action: string) => `${action}walk`;
  const blowAt = (progress: number, moving: boolean) =>
    shownMove(
      { ...doing, moving, speed: 3, blow: { direction: 'down', second: false, progress } },
      frames,
      everything,
      onTheMove,
    );
  // A sword's blow lands 0.4 through its swing; its last frame shows 0.55 of that after.
  assert.deepEqual([blowAt(0.6, true).anim, blowAt(0.6, true).frame], ['over1hwalk', 8]);
  assert.equal(blowAt(0.63, true).anim, 'walk', 'walking on while the swing runs out');
  assert.deepEqual([blowAt(0.9, false).anim, blowAt(0.9, false).frame], ['over1h', 8], 'standing, it holds its last');
});

test('what a fight holds a figure to, and its blows on the move, are composed ahead too', () => {
  const onTheMoveOf = (action: string) => `${action}walk`;
  const likely = likelyMoves('sword_iron', null, everything, null, onTheMoveOf);
  for (const anim of ['over1hwalk', 'side1hwalk', 'thrust1hwalk', 'parry', 'hurt', 'roll'])
    assert.ok(likely.includes(anim), anim);
  assert.ok(likelyMoves('sword_iron', 'shield_kite_iron', everything).includes('block'), "a shield's block");
  const staff = likelyMoves('staff_iron', null, everything);
  assert.ok(staff.includes('hurt_staff') && staff.includes('parry_staff'), "a staff's own");
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

test("a blow's blade goes the way the forge draws it: down, out, and every hold's side cut across to the left", () => {
  assert.deepEqual(['over1h', 'thrustpair', 'side1h', 'sidepair', 'sidehilt', 'sidehaft', 'sidestaff'].map(blowWay), [
    'down',
    'up',
    'left',
    'left',
    'left',
    'left',
    'left',
  ]);
  assert.equal(blowWay('slash'), null, 'any other move');
  assert.equal(blowWay('swing2h'), null);
});

test('moving, a blow, a shot, a reload, an aim and the cast play their own on the move where drawn whole', () => {
  const walking = (action: string) => onTheMove(action);
  const moving = { ...doing, moving: true };
  const blow = (right: string, direction: 'down' | 'up' | 'left' = 'down') =>
    shownMove({ ...moving, right, blow: { direction, second: false, progress: 0.4 } }, frames, everything, walking);
  assert.deepEqual(blow('sword_iron'), { anim: 'over1hwalk', frame: 4, frameSeconds: 0 });
  assert.equal(blow('staff_oak', 'up').anim, 'thruststaffwalk', 'a staff strikes in both hands');
  assert.equal(shownMove({ ...moving, cast: 0.5 }, frames, everything, walking).anim, 'castwalk');
  const shot = { ...moving, right: 'thunderlock_iron', blow: { direction: null, second: false, progress: 0.2 } };
  assert.equal(shownMove(shot, frames, everything, walking).anim, 'gunshotwalk');
  assert.equal(
    shownMove({ ...shot, blow: { ...shot.blow, reload: true } }, frames, everything, walking).anim,
    'gunreloadwalk',
  );
  const aim = (right: string) =>
    shownMove({ ...moving, right, fight: { kind: 'draw', progress: 0.5 } }, frames, classic, walking).anim;
  assert.deepEqual([aim('bow_long_iron'), aim('pistolet_iron')], ['bowshotwalk', 'pistolshotwalk']);
  // Standing, or where the figure does not draw it whole, the action's own.
  assert.equal(shownMove({ ...doing, cast: 0.5 }, frames, everything, walking).anim, 'cast');
  assert.equal(shownMove({ ...moving, cast: 0.5 }, frames, everything, () => null).anim, 'cast');
  assert.equal(blowWay('side1hwalk'), blowWay('side1h'), 'a blow on the move goes its standing way');
});

test("the moves a figure shows standing and moving are a few of its likely ones, its kit's own and the plain", () => {
  const steady = steadyMoves('sword_iron', null, classic);
  const likely = likelyMoves('sword_iron', null, classic);
  for (const anim of ['idle', 'walk', 'run']) assert.ok(steady.includes(anim), anim);
  assert.ok(
    steady.every((anim) => likely.includes(anim)),
    'all of them likely',
  );
  assert.ok(steady.length < likely.length / 2, 'and few: no blow, guard, roll or hurt');
  assert.equal(new Set(steady).size, steady.length);
});
