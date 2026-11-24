import assert from 'node:assert/strict';
import { test } from 'node:test';
import manifest from '../../../../content/modules/modules.json' with { type: 'json' };
import {
  boonsOf,
  DECOR_TURNS,
  decorCap,
  decorPrice,
  KINDS,
  PIECES,
  type Plot,
  type Standing,
  tierAllowed,
} from './outpostLaw.ts';

const standing = (kind: string, tier: number): Standing => ({ id: 1, kind, tier, building: 0, x: 0, y: 0, turn: 0 });
const plot = (...structures: Standing[]): Plot => ({ structures, decor: [] });

test("every piece's reach holds its module turned to any step, so a turned piece never overhangs a structure", () => {
  const sizes = new Map(manifest.modules.map((module) => [module.name, module.size]));
  for (const piece of PIECES) {
    const [width = 0, depth = 0] = sizes.get(piece.piece) ?? [];
    for (let step = 0; step < DECOR_TURNS; step += 1) {
      const angle = (step * 2 * Math.PI) / DECOR_TURNS;
      const across = (width / 2) * Math.abs(Math.cos(angle)) + (depth / 2) * Math.abs(Math.sin(angle));
      const down = (width / 2) * Math.abs(Math.sin(angle)) + (depth / 2) * Math.abs(Math.cos(angle));
      assert.ok(Math.max(across, down) <= piece.reach + 1e-9, `${piece.piece} at step ${step} reaches past its reach`);
    }
  }
});

test('a piece of decoration costs 50 Aurem a metre of reach, never under 25 or over 500', () => {
  for (const piece of PIECES)
    assert.equal(decorPrice(piece.piece), Math.min(500, Math.max(25, Math.round(piece.reach * 50))), piece.piece);
  assert.equal(decorPrice('bench'), 63, 'a reach of 1.25 m');
  assert.equal(decorPrice('no-such-piece'), 25, 'the least for what reaches nothing');
});

test('a hall holds 40, 80 and 150 pieces by its tier, and a tier past the last holds none', () => {
  assert.deepEqual([1, 2, 3].map(decorCap), [40, 80, 150]);
  assert.equal(decorCap(4), 0);
});

test('a guild builds tier 2 from level 3 and tier 3 from level 6', () => {
  assert.deepEqual([1, 2, 3, 5, 6, 10].map(tierAllowed), [1, 1, 2, 2, 3, 3]);
});

test("a guild's boons are the best of each kind standing at any outpost, and a scaffold gives none", () => {
  assert.deepEqual(boonsOf([]), { xp: 0, aurem: 0, reputation: 0 });
  const first = plot(standing('war-table', 1), standing('assay', 3), standing('counting', 3));
  const second = plot(standing('war-table', 3), standing('lodge', 0));
  assert.deepEqual(boonsOf([first, second]), { xp: 15, aurem: 15, reputation: 0 });
  assert.deepEqual(boonsOf([plot(standing('lodge', 2), standing('lodge', 1))]), { xp: 0, aurem: 0, reputation: 10 });
});

test('an outpost asks Timber, Canvas and Iron within 1.3 to 1 of each other, and Heartwood only of four tier 3s', () => {
  const asked = (stuff: 'timber' | 'canvas' | 'iron' | 'heartwood') =>
    KINDS.flatMap((kind) => kind.tiers).reduce((sum, tier) => sum + (tier.materials[stuff] ?? 0), 0);
  const common = [asked('timber'), asked('canvas'), asked('iron')];
  assert.ok(Math.max(...common) <= 1.3 * Math.min(...common), `Timber, Canvas, Iron: ${common.join(', ')}`);
  assert.ok(asked('heartwood') <= 90, `Heartwood ${asked('heartwood')}`);
  const askers = KINDS.filter((kind) => kind.tiers.some((tier, index) => tier.materials.heartwood && index !== 2));
  assert.deepEqual(askers, [], 'Heartwood only at tier 3');
  const heartwood = KINDS.filter((kind) => kind.tiers.some((tier) => tier.materials.heartwood)).map((kind) => kind.id);
  assert.deepEqual(heartwood.sort(), ['assay', 'gate', 'hall', 'horn']);
});
