import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ShipModels } from '../ships/shipModels.ts';
import type { FigureView } from './figureView.ts';
import type { Drawer } from './scene.ts';
import { standingDrawers } from './standingDrawers.ts';

const drawer = (name: string, drawn: string[]): Drawer =>
  ({ drawInto: () => drawn.push(name), castInto: () => undefined }) as unknown as Drawer;

test('the city, its layouts and nature draw first, then a fight’s blood, the ships, the figures, and the fight’s marks over them', () => {
  const drawn: string[] = [];
  const shipModels = { draw: () => drawn.push('ships') } as unknown as ShipModels;
  const figureView = { drawInto: () => drawn.push('figures') } as unknown as FigureView;
  const parts = {
    city: drawer('city', drawn),
    layouts: drawer('layouts', drawn),
    nature: drawer('nature', drawn),
    shipModels,
    figureView,
    seaFight: null,
  };
  const fight = { under: drawer('blood', drawn), over: drawer('marks', drawn) };
  const shot = { eye: [0, 0, 0] } as never;
  for (const each of standingDrawers(parts, [], [], fight))
    each.drawInto({} as never, {} as never, shot, 0, null as never);
  assert.deepEqual(drawn, ['city', 'layouts', 'nature', 'blood', 'ships', 'figures', 'marks']);
  assert.equal(
    standingDrawers({ ...parts, city: null, layouts: null, nature: undefined }, [], []).length,
    2,
    'none for what is missing',
  );
});
