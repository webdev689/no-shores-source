import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { CONFIG_NAME, Config, DEFAULT_KEPT, keptOf } from './config.ts';

const failure = { backend: 'vulkan', gpu: '10de:2786@566.36', chromium: '154.0.1', reason: 'no adapter', at: 'then' };

test('nothing kept, or a file that does not read, is every default', () => {
  assert.deepEqual(keptOf(null), DEFAULT_KEPT);
  assert.deepEqual(keptOf('{ not json'), DEFAULT_KEPT);
  assert.deepEqual(keptOf('[1, 2]'), DEFAULT_KEPT);
});

test('each field is read on its own: one that does not read is its default, the rest are kept', () => {
  const kept = keptOf(JSON.stringify({ graphics: 'webgl', failures: [failure], updateChecks: false }));
  assert.equal(kept.graphics, 'auto');
  assert.deepEqual(kept.failures, [failure]);
  assert.equal(kept.updateChecks, false);
});

test('a failure or sighting missing what it needs is dropped, and the others kept', () => {
  const kept = keptOf(
    JSON.stringify({
      failures: [failure, { backend: 'vulkan' }, { ...failure, backend: 'opengl' }],
      seen: [
        { backend: 'vulkan', gpu: 'card', chromium: '154' },
        { backend: 'vulkan', gpu: '', chromium: '154' },
      ],
    }),
  );
  assert.deepEqual(kept.failures, [failure]);
  assert.deepEqual(kept.seen, [{ backend: 'vulkan', gpu: 'card', chromium: '154' }]);
});

test('a failure never learning its card keeps a card of none', () => {
  assert.equal(keptOf(JSON.stringify({ failures: [{ ...failure, gpu: null }] })).failures[0]?.gpu, null);
});

test('only the newest sixteen failures are kept', () => {
  const many = Array.from({ length: 20 }, (_unused, index) => ({ ...failure, reason: `reason ${index}` }));
  const kept = keptOf(JSON.stringify({ failures: many }));
  assert.equal(kept.failures.length, 16);
  assert.equal(kept.failures[0]?.reason, 'reason 4');
});

test('a window place without whole numbers and a size is no place', () => {
  assert.equal(keptOf(JSON.stringify({ window: { x: 1.5, y: 0, width: 800, height: 600 } })).window, null);
  assert.equal(keptOf(JSON.stringify({ window: { x: 0, y: 0, width: 0, height: 600 } })).window, null);
  assert.deepEqual(keptOf(JSON.stringify({ window: { x: -10, y: 5, width: 800, height: 600, maximized: 1 } })).window, {
    x: -10,
    y: 5,
    width: 800,
    height: 600,
    maximized: false,
    fullScreen: false,
  });
});

test('what is set is read back by the next launch, and no file is left beside it', () => {
  const folder = mkdtempSync(path.join(tmpdir(), 'noshores-config-'));
  try {
    const config = new Config(folder);
    assert.equal(config.set({ graphics: 'vulkan', updateChecks: false }), true);
    assert.equal(new Config(folder).get().graphics, 'vulkan');
    assert.equal(new Config(folder).get().updateChecks, false);
    assert.deepEqual(readdirSync(folder), [CONFIG_NAME]);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test('a folder that cannot be written keeps the change for this launch and says so', () => {
  const folder = mkdtempSync(path.join(tmpdir(), 'noshores-config-'));
  try {
    const blocked = path.join(folder, 'file');
    writeFileSync(blocked, '');
    const config = new Config(path.join(blocked, 'inside'));
    assert.equal(config.set({ graphics: 'vulkan' }), false);
    assert.equal(config.get().graphics, 'vulkan');
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
