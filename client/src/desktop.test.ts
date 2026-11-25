import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  type DesktopAsk,
  type DesktopInfo,
  askDesktop,
  desktop,
  desktopChanged,
  onDesktop,
  useDesktop,
} from './desktop.ts';

const told: DesktopInfo = {
  version: '2026.1125.1230',
  platform: 'windows',
  graphics: {
    chosen: 'auto',
    choices: ['auto', 'd3d12', 'vulkan'],
    launched: 'd3d12',
    running: '',
    adapter: '',
    held: false,
    restart: false,
  },
  update: { state: 'none' },
};

test('in a browser there is no shell, and an ask goes nowhere', () => {
  const asked: DesktopAsk[] = [];
  useDesktop(null, (ask) => asked.push(ask));
  assert.equal(desktop(), null);
  askDesktop({ ask: 'restart' });
  assert.deepEqual(asked, []);
});

test('in the app the game reads what the shell told, hears each change, and its asks reach the shell', () => {
  const asked: DesktopAsk[] = [];
  useDesktop(told, (ask) => asked.push(ask));
  assert.equal(desktop()?.platform, 'windows');
  const heard: string[] = [];
  const stop = onDesktop((info) => heard.push(info.update.state));
  desktopChanged({ ...told, update: { state: 'ready', version: '2026.1201.900' } });
  stop();
  desktopChanged(told);
  assert.deepEqual(heard, ['ready']);
  assert.equal(desktop()?.update.state, 'none');
  askDesktop({ ask: 'graphics', api: 'vulkan' });
  assert.deepEqual(asked, [{ ask: 'graphics', api: 'vulkan' }]);
});
