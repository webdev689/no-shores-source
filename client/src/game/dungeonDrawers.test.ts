import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Gpu } from '../gpu.ts';
import type { SkyLook } from '../sky/skyUniform.ts';
import { skyUniformFor } from '../sky/skyUniform.ts';
import { DungeonDrawers } from './dungeonDrawers.ts';
import type { DungeonLayout } from './dungeonLayout.ts';
import { DUNGEON_MAP } from './dungeonMap/dungeonMap.ts';
import { STOREYED } from './dungeonMap/mapStoreys.test.ts';
import type { FigureView } from './figureView.ts';
import type { Foot, FootFrame } from './foot.ts';

test('each frame writes the sky it is drawn under: a dungeon entered straight from a run draws under none of the run', () => {
  // A device whose every call answers another such stand-in.
  const stand: object = new Proxy(function stub() {}, {
    get: (_target, key) => (key === 'then' ? undefined : key === Symbol.toPrimitive ? () => 0 : stand),
    apply: () => stand,
  });
  const device = stand as unknown as GPUDevice;
  const written: SkyLook[] = [];
  const sky = skyUniformFor(device);
  sky.write = (look) => void written.push(look);
  const figures = { drawInto: () => undefined } as unknown as FigureView;
  const drawers = new DungeonDrawers(
    { device, context: stand, format: 'bgra8unorm' } as unknown as Gpu,
    figures,
    new Promise(() => undefined),
    () => null,
  );
  const shot = { eye: [0, 0, 50], yaw: 0, pitch: 0, fov: 1, near: 0.1, far: 500 } as const;
  const shown = { figures: [], shot } as unknown as FootFrame;
  const fight = { under: { drawInto: () => undefined }, over: { drawInto: () => undefined } };
  const size = { width: 64, height: 36 };
  drawers.drawRun(shown, size, 1, fight, { drawInto: () => undefined });
  assert.ok((written.at(-1)?.darkM ?? 0) > 0, 'the run draws under its own dark');
  const foot = { held: { cache: null, encounter: null }, finds: { drawn: [] } } as unknown as Foot;
  drawers.draw(foot, shown, size, 2, fight);
  assert.equal(written.length, 2, 'the dungeon frame writes its own sky');
  assert.equal(written.at(-1)?.darkM ?? 0, 0, "with none of the run's dark");
});

test('a player who falls with the map open has it shut, so the death screen shows', () => {
  const stand: object = new Proxy(function stub() {}, {
    get: (_target, key) => (key === 'then' ? undefined : key === Symbol.toPrimitive ? () => 0 : stand),
    apply: () => stand,
  });
  const device = stand as unknown as GPUDevice;
  const figures = { drawInto: () => undefined } as unknown as FigureView;
  const gpu = { device, context: stand, format: 'bgra8unorm' } as unknown as Gpu;
  const drawers = new DungeonDrawers(gpu, figures, new Promise(() => undefined), () => null);
  const layout = {
    ...STOREYED,
    name: 'The Test Halls',
    arrival: { x: 1.6, y: 1.6, bearing: 0 },
    portal: { x: 18, y: 1.6, side: 0, width: 2, height: 3 },
    rooms: [{ storey: 0 }, { storey: 1 }],
    end: 1,
  } as unknown as DungeonLayout;
  const ask = { dungeon: 'test halls' };
  const standing = { held: { cache: null, encounter: null }, finds: { drawn: [] }, dungeon: { ask, layout } };
  const otherPlayers = { placed: new Map() };
  const shot = { eye: [1.6, 1.6, 1.7], yaw: 0, pitch: 0, fov: 1, near: 0.1, far: 500 } as const;
  const shown = { figures: [], shot } as unknown as FootFrame;
  const fight = { under: { drawInto: () => undefined }, over: { drawInto: () => undefined } };
  const you = { feet: [1.6, 1.6, 0] as const, facing: 0, name: 'You', seconds: 0.2 };
  try {
    DUNGEON_MAP.enter(JSON.stringify(ask), layout);
    DUNGEON_MAP.toggle();
    assert.equal(DUNGEON_MAP.open, true);
    const fallen = { ...standing, fallen: true, otherPlayers } as unknown as Foot;
    drawers.draw(fallen, shown, { width: 64, height: 36 }, 1, fight, undefined, 0, null, you);
    assert.equal(DUNGEON_MAP.open, false);
  } finally {
    DUNGEON_MAP.leave();
  }
});
