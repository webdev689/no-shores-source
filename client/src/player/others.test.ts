import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SeenPlayer } from '../network/messages.ts';
import { UNTRIMMED_FLOATS } from '../rules/fighters.ts';
import { BODY_FLOATS, type Body } from '../rules/movementRules.ts';
import type { Cards } from './cards.ts';
import { plainDress } from './dressing.ts';
import type { Placed } from './figures.ts';
import { OtherPlayers, dressNow, moveOf } from './others.ts';

const body: Body = {
  x: 0,
  y: 0,
  z: 0,
  vx: 0,
  vy: 0,
  vz: 0,
  facing: 0,
  mode: 'ground',
  crouched: false,
  crouch: 0,
  grounded: 1,
  over: null,
  lip: 0,
  moving: false,
};

test('another player plays the move their body is in: standing, walking, running, crouching, in the air or on a wall', () => {
  assert.equal(moveOf(body), 'idle');
  assert.equal(moveOf({ ...body, moving: true, vy: -4.43 }), 'walk');
  assert.equal(moveOf({ ...body, moving: true, vy: -7.59 }), 'run');
  assert.equal(moveOf({ ...body, crouched: true }), 'crouch_idle');
  assert.equal(moveOf({ ...body, mode: 'air' }), 'jump');
  assert.equal(moveOf({ ...body, mode: 'hang', moving: true }), 'shimmy');
  assert.equal(moveOf({ ...body, mode: 'vault' }), 'vault');
});

test('other players are placed in their own dress, moved as the room saw them, and taken away once it stops seeing them', () => {
  const shown: Placed[] = [];
  const others = new OtherPlayers({
    place: (dress, x, y, facing) => {
      const placed: Placed = {
        id: shown.length + 2,
        x,
        y,
        z: 0,
        facing,
        dress,
        anim: 'idle',
        frame: null,
        spin: false,
      };
      shown.push(placed);
      return placed;
    },
    remove: (placed) => shown.splice(shown.indexOf(placed), 1),
  });
  const forge = { draws: () => false } as unknown as Cards;
  const seen = (player: number, x: number): SeenPlayer => ({
    player,
    acknowledged: 0,
    body: { ...body, x },
    fighter: new Float64Array(),
    standing: { kind: 'inside' },
    anim: '',
    frame: 0,
    facing: 0,
  });
  const robed = plainDress('felid', 0.4);
  others.takeDresses([
    { player: 7, dress: JSON.stringify(robed) },
    { player: 8, dress: '{ not a dress' },
  ]);
  others.seen([seen(1, 0), seen(7, 3), seen(8, 5)], 1, forge);
  assert.deepEqual([...others.placed.keys()], [7, 8], 'all but their own');
  assert.deepEqual(others.placed.get(7)?.dress, robed, 'in the dress they sent');
  assert.equal(others.placed.get(8)?.dress.race, 'human', 'a broken dress keeps a plain one');
  others.seen([seen(1, 0), seen(7, 4)], 1, forge);
  assert.deepEqual(
    shown.map((placed) => placed.x),
    [4],
    'moved, and the one gone taken away',
  );
  others.clear();
  assert.equal(shown.length, 0);
});

test('another player drinking has their weapon put away at once, from the snapshot, and back in hand after', () => {
  const armed = { ...plainDress('human', 0.6), outfit: { ...plainDress('human', 0.6).outfit, drawn: true } };
  const doing = (kind: number) => Object.assign(new Float64Array(UNTRIMMED_FLOATS), { [BODY_FLOATS + 23]: kind });
  assert.equal(dressNow(armed, doing(13)).outfit.drawn, false, 'drinking: put away');
  assert.equal(dressNow(armed, doing(0)), armed, 'at rest: as they dress');
  assert.equal(dressNow(armed, null), armed, 'no fighter: as they dress');
  const placed: Placed[] = [];
  const others = new OtherPlayers({
    place: (dress, x, y, facing) => {
      const one: Placed = { id: 2, x, y, z: 0, facing, dress, anim: 'idle', frame: null, spin: false };
      placed.push(one);
      return one;
    },
    remove: () => undefined,
  });
  others.takeDresses([{ player: 7, dress: JSON.stringify(armed) }]);
  const forge = { draws: () => false } as unknown as Cards;
  const seen = (kind: number): SeenPlayer => ({
    player: 7,
    acknowledged: 0,
    body,
    fighter: doing(kind),
    standing: { kind: 'inside' },
    anim: '',
    frame: 0,
    facing: 0,
  });
  others.seen([seen(13)], 1, forge);
  assert.equal(others.placed.get(7)?.dress.outfit.drawn, false);
  others.seen([seen(0)], 1, forge);
  assert.equal(others.placed.get(7)?.dress.outfit.drawn, true);
});
