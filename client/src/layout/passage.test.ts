import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { NodeLayout } from './layouts.ts';
import { passageAt } from './passage.ts';

const layout = (id: string, areas: NodeLayout['areas']): NodeLayout =>
  ({ id, areas, ring: [], spawns: [] }) as unknown as NodeLayout;
const node = (id: string, name: string) => ({ id, name, spawns: [[0, 0]] as const, centre: [0, 0] as const });

test('a gate leads into its instance at its way in, and the way in back out to the gate', () => {
  const layouts = [
    layout('downs', [{ kind: 'gate', name: '', at: [100, 0], radius: 40, leads_to: 'mill' }]),
    layout('mill', [{ kind: 'entrance', name: 'Millrace Gate', at: [500, 0], radius: 40, leads_to: 'downs' }]),
  ];
  const nodes = [node('downs', 'The Downs'), node('mill', 'The Burned Mill')];
  const into = passageAt(layouts, nodes, 'downs', [110, 10]);
  assert.deepEqual(into, { to: 'mill', name: 'The Burned Mill', into: true, arrive: [500, 0] });
  const out = passageAt(layouts, nodes, 'mill', [505, 0]);
  assert.deepEqual(out, { to: 'downs', name: 'The Downs', into: false, arrive: [100, 0] });
  assert.equal(passageAt(layouts, nodes, 'downs', [300, 0]), null, 'away from the gate');
});
