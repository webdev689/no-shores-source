import assert from 'node:assert/strict';
import { test } from 'node:test';
import islands from '../content/world/islands.json' with { type: 'json' };
import layout from '../content/world/layout.json' with { type: 'json' };
import { SEA_PORTS, SEA_REQUEST } from './seaPorts.ts';

test('the sea room is opened with the layout, every port city and the islands’ names, so unnamed islands’ seas are locked', () => {
  const request = JSON.parse(SEA_REQUEST) as { layout: unknown; ports: unknown; islands: unknown };
  assert.deepEqual(request.islands, islands);
  assert.deepEqual(
    request.ports,
    JSON.parse(JSON.stringify(SEA_PORTS)),
    'all three port cities: the merchants still sail',
  );
  assert.deepEqual(request.layout, layout);
});
