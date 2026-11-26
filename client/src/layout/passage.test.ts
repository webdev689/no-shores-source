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
  assert.deepEqual(into, { to: 'mill', name: 'The Burned Mill', into: true, across: false, arrive: [500, 0] });
  const out = passageAt(layouts, nodes, 'mill', [505, 0]);
  assert.deepEqual(out, { to: 'downs', name: 'The Downs', into: false, across: false, arrive: [100, 0] });
  assert.equal(passageAt(layouts, nodes, 'downs', [300, 0]), null, 'away from the gate');
});

test('a gate between two patrol areas crosses to the other, arriving at its gate toward the one left', () => {
  const patrol = (id: string, name: string) => ({ ...node(id, name), kind: 'patrol' });
  const layouts = [
    layout('downs', [{ kind: 'gate', name: '', at: [100, 0], radius: 10, leads_to: 'vale', crosses: true }]),
    layout('vale', [{ kind: 'gate', name: '', at: [-700, 0], radius: 10, leads_to: 'downs', crosses: true }]),
  ];
  const nodes = [patrol('downs', 'The Downs'), patrol('vale', 'The Vale')];
  const across = passageAt(layouts, nodes, 'downs', [105, 5]);
  assert.deepEqual(across, { to: 'vale', name: 'The Vale', into: false, across: true, arrive: [-700, 0] });
  // Only the layout's mark makes a gate a crossing, never its reach.
  const unmarked = [
    layout('downs', [{ kind: 'gate', name: '', at: [100, 0], radius: 10, leads_to: 'vale' }]),
    layouts[1],
  ];
  assert.equal(passageAt(unmarked, nodes, 'downs', [105, 5])?.across, false);
});
