import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GearState } from '../network/gearMessages.ts';
import type { Placed } from '../player/figures.ts';
import { KEEPERS } from './keepers.ts';
import { PlazaLife } from './plazaLife.ts';
import { awayFromCounters } from './townsfolk.ts';
import { POSTS, SOCIAL, STATIONS } from './welcome/plazaForTests.ts';

test('Shape is placed at his week’s spot while the room says he is here, and Maren’s counter empties while she walks', () => {
  const placed: Placed[] = [];
  const others = {
    place: (dress: Placed['dress'], x: number, y: number, facing: number) => {
      const figure = { id: placed.length, x, y, z: 0, facing, dress, anim: 'idle', frame: null, spin: false };
      placed.push(figure);
      return figure;
    },
    remove: (figure: Placed) => void placed.splice(placed.indexOf(figure), 1),
  };
  const visitorSpots = [
    [955, 2002.5],
    [1045, 2002.5],
  ] as const;
  const life = new PlazaLife({ ...SOCIAL, visitorSpots }, others, () => 30);
  const here = { shape: { place: 1, wares: [] } } as unknown as GearState;
  life.frame(0.25, here);
  const townsfolk = POSTS.filter((post) => post.keep === 'kept').length + 1 + 14;
  assert.equal(placed.length, STATIONS.length + townsfolk + 1);
  const shape = placed.find((figure) => figure.dress === KEEPERS.shape.dress);
  assert.deepEqual([shape?.x, shape?.y, shape?.anim], [1045, 2002.5, 'idle']);
  life.frame(0.25, { ...here, shape: null });
  assert.ok(!placed.some((figure) => figure.dress === KEEPERS.shape.dress), 'gone when he leaves');
  awayFromCounters.add('lamplighters');
  life.frame(0.25, null);
  assert.ok(!placed.some((figure) => figure.dress === KEEPERS.lamplighters.dress), 'never two of her');
  awayFromCounters.delete('lamplighters');
  life.frame(0.25, null);
  assert.equal(placed.filter((figure) => figure.dress === KEEPERS.lamplighters.dress).length, 1, 'back at her counter');
  life.close();
});
