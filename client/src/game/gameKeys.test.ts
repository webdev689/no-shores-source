import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contextOf } from './gameKeys.ts';

type Playing = Parameters<typeof contextOf>[0];
const dead = { standing: { kind: 'dead' } };
const alive = { standing: { kind: 'inside' } };
/** The game as `contextOf` reads it: its flow, and the sea and the foot as far as it looks at them. */
const game = (flow: object, sea: object | null = null, foot: object | null = null) =>
  ({ flow, sea, foot }) as unknown as Playing;
const afloat = (more: object = {}) => ({
  aboard: { walking: false },
  boarding: { onDeck: false },
  fight: null,
  ...more,
});

test('the controls act where the player is: a window, dead, on foot, at the helm or in a fight at sea', () => {
  assert.equal(contextOf(game({ mode: 'foot', menu: true }, null, alive)), 'menu');
  assert.equal(contextOf(game({ mode: 'foot' }, null, alive)), 'foot');
  assert.equal(contextOf(game({ mode: 'foot' }, null, dead)), 'dead');
  assert.equal(contextOf(game({ mode: 'sea' }, afloat())), 'helm');
  assert.equal(contextOf(game({ mode: 'landing' }, afloat())), 'helm');
  assert.equal(contextOf(game({ mode: 'sea' }, afloat({ fight: {} }))), 'fight');
  assert.equal(contextOf(game({ mode: 'sea' }, afloat({ aboard: { walking: true } }))), 'foot', 'walking its deck');
  const boarded = (foot: object) => afloat({ fight: {}, boarding: { onDeck: true, foot } });
  assert.equal(contextOf(game({ mode: 'sea' }, boarded(alive))), 'foot', "on a struck ship's deck");
  assert.equal(contextOf(game({ mode: 'sea' }, boarded(dead))), 'dead');
});
