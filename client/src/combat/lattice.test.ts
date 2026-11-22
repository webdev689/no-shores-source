import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Direction, Doing, Shown } from '../player/playerMoves.ts';
import { foeDress } from '../player/foeDress.ts';
import type { FoeType } from '../rules/roster.ts';
import {
  LATTICE,
  blinkShare,
  bulwarkChanged,
  latticeAnims,
  latticeHidden,
  latticeMove,
  withoutLayers,
  latticeDresses,
} from './lattice.ts';

const STILL: Doing = {
  mode: 'ground',
  moving: false,
  running: false,
  crouched: false,
  mounted: false,
  speed: 0,
  vz: 0,
  over: 0,
  drawn: true,
  right: null,
  left: null,
  blow: null,
  cast: null,
  act: null,
  fight: null,
};
const MAN: Shown = { anim: 'idle', frame: null, frameSeconds: 0.1 };
const frames = (anim: string) => ({ husk_lunge: 8, flicker_arrive: 6, ravager_hurl: 17, idol_charge: 8 })[anim] ?? 10;
const move = (body: string, doing: Partial<Doing>, changed = false) =>
  latticeMove(body, { ...STILL, ...doing }, MAN, frames, changed);
const blow = (direction: Direction | null) => ({
  blow: { direction, second: false, progress: 0.5 },
});

test('every Lattice type is dressed on its own body in its crystal, its flesh and its veins', () => {
  for (const [type, kind] of Object.entries(LATTICE)) {
    const dress = foeDress({ type: Number(type), right: null, left: null } as unknown as FoeType);
    assert.equal(dress?.body, kind.body);
    for (const layer of [`lattice_${kind.body}`, `lattice_${kind.body}_gore`, `lattice_${kind.body}_veins`])
      assert.ok(dress?.outfit.garments.includes(layer), `${kind.body} wears ${layer}`);
  }
  assert.ok(
    foeDress({ type: 43, right: null, left: null } as unknown as FoeType)?.outfit.garments.includes(
      'lattice_bulwark_shield',
    ),
  );
  const taker = foeDress({ type: 45, right: null, left: null } as unknown as FoeType);
  assert.deepEqual(
    [taker?.body, taker?.outfit.dyes['formal_tunic']],
    ['male', 'DarkBrown'],
    'the Tithe-Taker’s dark coat',
  );
});

test('each foe plays its own moves for its blows', () => {
  assert.equal(move('husk', blow('up'))?.anim, 'husk_lunge');
  assert.equal(move('husk', blow('down'))?.anim, 'husk_gore');
  assert.equal(move('husk', blow('up'))?.frame, 4, 'half through the blow, half through the lunge');
  assert.equal(move('flicker', blow('left'))?.anim, 'flicker_slash_left');
  assert.equal(
    move('flicker', { blow: { direction: 'left', second: true, progress: 0 } })?.anim,
    'flicker_slash_right',
  );
  assert.equal(move('flicker', blow('down'))?.anim, 'flicker_overhead');
  assert.equal(move('idol', blow(null))?.anim, 'idol_fire');
  assert.equal(move('idol', { fight: { kind: 'draw', progress: 0.5 } })?.anim, 'idol_charge');
  assert.equal(move('ravager', blow(null))?.anim, 'ravager_hurl');
  assert.equal(move('ravager', blow('right'))?.anim, 'ravager_maul');
  assert.equal(move('bulwark', blow('down'))?.anim, 'bulwark_discharge', 'shielded, it discharges');
  assert.equal(move('bulwark', blow('down'), true)?.anim, 'bulwark_slam', 'changed, it slams its maul');
  assert.equal(move('bulwark', blow('left'), true)?.anim, 'bulwark_sweep');
  assert.equal(move('heart', blow('up'))?.anim, 'heart_stomp');
  const telegraph = move('husk', { fight: { kind: 'windup', stroke: 'thrust', progress: 1 } });
  assert.deepEqual([telegraph?.anim, telegraph?.frame], ['husk_lunge', 2], 'held in its tell');
});

test('it walks, stands, flinches and staggers in its own moves; the Flicker and the Idol never walk', () => {
  assert.equal(move('husk', { moving: true })?.anim, 'husk_walk');
  assert.equal(move('husk', {})?.anim, 'husk_idle');
  assert.equal(move('flicker', { moving: true })?.anim, 'flicker_idle');
  assert.equal(move('idol', { moving: true })?.anim, 'idol_idle');
  assert.equal(move('ravager', { fight: { kind: 'struck', progress: 0 } })?.anim, 'ravager_hurt');
  assert.equal(move('bulwark', { fight: { kind: 'down', progress: 0 } })?.anim, 'bulwark_stagger');
  assert.equal(latticeMove('male', STILL, MAN, frames), null, 'no body of the Lattice’s');
});

test('the Flicker blinks out through its landing backwards and in through it, dissolved at the middle', () => {
  const blinkAt = (progress: number) => move('flicker', { fight: { kind: 'dodge', progress } });
  assert.deepEqual([blinkAt(0)?.anim, blinkAt(0)?.frame], ['flicker_arrive', 5], 'leaving from its stance');
  assert.equal(blinkAt(0.49)?.frame, 0, 'folded as it goes');
  assert.equal(blinkAt(1)?.frame, 5, 'landed');
  assert.deepEqual([blinkShare(0), blinkShare(0.5), blinkShare(1)], [0, 1, 0]);
  assert.equal(move('husk', { fight: { kind: 'dodge', progress: 0.5 } })?.anim, 'husk_walk', 'a Husk hops');
});

test('the Bulwark changes once in its second phase or at half its health, its change played first', () => {
  assert.equal(bulwarkChanged(1, 100, 100), false);
  assert.equal(bulwarkChanged(2, 100, 100), true);
  assert.equal(bulwarkChanged(1, 50, 100), true);
  assert.deepEqual(latticeMove('bulwark', STILL, MAN, frames, true, 0.5), {
    anim: 'bulwark_change',
    frame: 5,
    frameSeconds: 0,
  });
  assert.ok(latticeAnims('bulwark').includes('bulwark_change') && latticeAnims('bulwark').includes('bulwark_slam'));
});

test('a foe’s own parts show only in the frames they belong to', () => {
  assert.deepEqual(latticeHidden('ravager', 'ravager_hurl', 3, false), [], 'its shards held until the first throw');
  assert.deepEqual(latticeHidden('ravager', 'ravager_hurl', 4, false), ['lattice_ravager_ammunition']);
  assert.deepEqual(latticeHidden('ravager', 'ravager_walk', 4, false), []);
  assert.deepEqual(latticeHidden('bulwark', 'bulwark_walk', 0, false), ['lattice_bulwark_maul']);
  assert.deepEqual(latticeHidden('bulwark', 'bulwark_change', 0, true), ['lattice_bulwark_shield']);
  assert.deepEqual(latticeHidden('heart', 'heart_tear', 5, false), []);
  assert.deepEqual(latticeHidden('heart', 'heart_tear', 10, false), ['lattice_heart_torn']);
  const dress = foeDress({ type: 42, right: null, left: null } as unknown as FoeType);
  assert.ok(dress);
  assert.ok(
    !withoutLayers(dress, ['lattice_ravager_ammunition']).outfit.garments.includes('lattice_ravager_ammunition'),
  );
});

test('a shot held in its tell is a shot, and a Bulwark slain as it changes dies, not changes', () => {
  const telegraphed = move('ravager', {
    blow: { direction: null, second: false, progress: 0 },
    fight: { kind: 'windup', stroke: 'swing', progress: 0 },
  });
  assert.equal(telegraphed?.anim, 'ravager_hurl');
  const slain = latticeMove('bulwark', { ...STILL, fight: { kind: 'dead', progress: 0 } }, MAN, frames, true, 0.2);
  assert.equal(slain?.anim, 'bulwark_hurt');
});

test('a Lattice foe is warmed in the dresses it is drawn in, each with only the moves that show it', () => {
  const frames = () => 12;
  const heart = latticeDresses('heart', false, frames);
  const torn = heart.find((dress) => dress.hidden.length === 0);
  assert.deepEqual(torn?.anims, ['heart_tear'], 'the torn heart shows in its tear alone');
  assert.ok(heart.find((dress) => dress.hidden.includes('lattice_heart_torn'))?.anims.includes('heart_idle'));
  const changed = latticeDresses('bulwark', true, frames);
  assert.deepEqual(
    changed.map((dress) => dress.hidden),
    [['lattice_bulwark_shield']],
    'a changed Bulwark never shows its shield again, nor both at once',
  );
  assert.ok(latticeDresses('bulwark', false, frames).every((dress) => dress.hidden.length === 1));
  const ravager = latticeDresses('ravager', false, frames);
  assert.deepEqual(ravager.find((dress) => dress.hidden.length > 0)?.anims, ['ravager_hurl']);
});
