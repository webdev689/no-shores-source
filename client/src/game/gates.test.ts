import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { NodeLayout } from '../layout/layouts.ts';
import { gateWay } from './gates.ts';
import type { NodeInfo, NodeKind } from './worldData.ts';

type Point = readonly [number, number];

const layout = (id: string, way: { kind: string; at: Point; to: string }[]): NodeLayout =>
  ({
    id,
    ring: [],
    spawns: [],
    areas: way.map(({ kind, at, to }) => ({ kind, name: '', at, radius: 40, leads_to: to })),
  }) as unknown as NodeLayout;
const node = (id: string, kind: NodeKind, name: string, locked: boolean): NodeInfo => ({
  ...{ id, kind, name, continent: 'continent-1', ring: [], spawns: [[0, 0]], centre: [0, 0] },
  locked,
});

test('a gate into a locked node is shut: its offer says the place beyond is locked, and it takes no one', () => {
  const landmass = {
    layouts: [
      layout('downs', [
        { kind: 'gate', at: [100, 0], to: 'mill' },
        { kind: 'gate', at: [-100, 0], to: 'grotto' },
      ]),
      layout('mill', [{ kind: 'entrance', at: [500, 0], to: 'downs' }]),
      layout('grotto', [{ kind: 'entrance', at: [-500, 0], to: 'downs' }]),
    ],
    nodes: [
      node('downs', 'patrol', 'The Downs', false),
      node('mill', 'mission', 'The Burned Mill', true),
      node('grotto', 'dungeon', "Kraken's Grotto", false),
    ],
  };
  const shut = gateWay(landmass, 'downs', [110, 0]);
  assert.deepEqual([shut?.offer, shut?.happening], ['The Burned Mill is locked', null]);
  const open = gateWay(landmass, 'downs', [-110, 0]);
  assert.equal(open?.offer, "Enter Kraken's Grotto  E");
  assert.deepEqual(open?.happening, { kind: 'pass', node: 'grotto', name: "Kraken's Grotto", into: true });
});

test('the way out of an instance to a locked patrol area is shut the same way', () => {
  const landmass = {
    layouts: [
      layout('moors', [{ kind: 'gate', at: [0, 0], to: 'tomb' }]),
      layout('tomb', [{ kind: 'entrance', at: [900, 0], to: 'moors' }]),
    ],
    nodes: [node('moors', 'patrol', 'The Moors', true), node('tomb', 'dungeon', 'The Pearl Tomb', false)],
  };
  const out = gateWay(landmass, 'tomb', [905, 0]);
  assert.deepEqual([out?.offer, out?.happening], ['The Moors is locked', null]);
});

test('a gate toward another patrol area offers to go there, arriving at its gate toward the one left', () => {
  const landmass = {
    layouts: [
      layout('downs', [{ kind: 'gate', at: [100, 0], to: 'vale' }]),
      layout('vale', [{ kind: 'gate', at: [-700, 0], to: 'downs' }]),
    ],
    nodes: [node('downs', 'patrol', 'The Downs', false), node('vale', 'patrol', 'The Vale', false)],
  };
  const across = gateWay(landmass, 'downs', [105, 0]);
  assert.equal(across?.offer, 'Go to The Vale  E');
  assert.deepEqual(across?.happening, { kind: 'cross', node: 'vale', name: 'The Vale' });
  assert.deepEqual(across?.node.spawns, [[-700, 0]], "at the Vale's gate toward the Downs");
});
