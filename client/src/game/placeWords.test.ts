import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ruinedName } from '../ruinedName.ts';
import { placeWords } from './hudLaw.ts';
import type { NodeInfo } from './worldData.ts';

const node = (name: string, continent: string): NodeInfo =>
  ({ id: 'x-social', name, kind: 'social', continent, centre: [0, 0] }) as unknown as NodeInfo;

test('a ruined city’s place line says it lies in ruins, never that it is a social space', () => {
  assert.equal(placeWords(node(ruinedName('Mistfall'), 'continent-4')), 'Ruins');
  assert.equal(placeWords(node('Overlook', 'continent-1')), 'Social space · Saltmere');
});
