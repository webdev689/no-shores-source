import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shipPlateNodes } from './shipPlates.ts';

test('each plate stands where it was laid, its emblem’s square as tall as it, a Boss’s with her faction', () => {
  const bar = {
    key: 1,
    left: 10.4,
    top: 20.6,
    width: 140,
    height: 26,
    bar: 8,
    name: 'Tithe Sloop',
    faction: 1,
    rank: 3,
  };
  const [plate, boss] = shipPlateNodes([
    { ...bar, colour: '#e8c23a', share: 0.5, words: '' },
    { ...bar, key: 2, width: 640, height: 48, bar: 16, rank: 5, colour: '#e8c23a', share: 1, words: 'The Grey Tithe' },
  ]);
  assert.deepEqual(plate?.float, { to: 'screen', x: 10, y: 21 });
  assert.equal(plate?.through, true, 'the world is clicked through it');
  const square = plate?.children?.[0];
  assert.ok(square && square.width === 26 && square.height === 26);
  assert.ok(JSON.stringify(plate).includes('rank mark elite'), 'an Elite wears her mark');
  assert.ok(JSON.stringify(boss).includes('THE GREY TITHE'));
});
