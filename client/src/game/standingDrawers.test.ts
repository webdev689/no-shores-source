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
  const shipModels = { draw: () => drawn.push('ships'), hang: () => undefined } as unknown as ShipModels;
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

test("the ships' lanterns and the fight's lights are hung where this frame's ships lie as it is prepared, before it draws", () => {
  const heard: string[] = [];
  const ships = [{ hull: 0 }] as never;
  const flash = { at: [1, 2, 3] as const, reachM: 26, light: [1, 1, 1] as const, seed: 9 };
  const shipModels = {
    hang: (hung: unknown, eye: unknown, more: unknown) =>
      heard.push(`hang ${hung === ships} ${JSON.stringify(eye)} ${more === fought}`),
    draw: () => heard.push('draw'),
    model: () => null,
  } as unknown as ShipModels;
  const fought = [flash];
  const seaFight = { lamps: () => fought, draw: () => heard.push('fight') } as never;
  const figureView = { drawInto: () => undefined } as unknown as FigureView;
  const parts = { city: null, nature: null, shipModels, figureView, seaFight };
  const drawers = standingDrawers(parts, ships, []);
  const shot = { eye: [4, 5, 6] } as never;
  for (const each of drawers) each.prepare?.(shot);
  assert.deepEqual(heard, ['hang true [4,5,6] true'], 'hung from the frame’s eye, nothing drawn yet');
  for (const each of drawers) each.drawInto({} as never, {} as never, shot, 0, null as never);
  assert.deepEqual(heard, ['hang true [4,5,6] true', 'draw', 'fight'], 'and never hung again as it draws');
});
