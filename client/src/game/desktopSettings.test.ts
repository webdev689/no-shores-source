import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type DesktopAsk, type DesktopGraphics, type DesktopInfo, useDesktop } from '../desktop.ts';
import { drawingWords, updateWords } from './desktopSettings.ts';
import { drawn, fakePage } from './menuPagesForTests.ts';
import { Rebinding } from './rebinding.ts';
import { Settings } from './settingsPage.ts';

const graphics: DesktopGraphics = {
  chosen: 'auto',
  choices: ['auto', 'd3d12', 'd3d11'],
  launched: 'd3d12',
  running: '',
  adapter: '',
  held: false,
  restart: false,
};

test('what the app draws with is said as far as the game has learned it', () => {
  assert.equal(drawingWords(graphics), 'Drawing with Direct3D 12.');
  assert.equal(
    drawingWords({ ...graphics, running: 'D3D11', adapter: 'AMD Radeon RX 7800 XT' }),
    'Drawing with Direct3D 11 on AMD Radeon RX 7800 XT.',
  );
  assert.equal(drawingWords({ ...graphics, launched: 'auto' }), '');
  assert.equal(drawingWords({ ...graphics, launched: 'auto', adapter: 'Apple M3' }), 'Drawing on Apple M3.');
});

test('an update is said by where it stands, and nothing where there is none', () => {
  assert.equal(updateWords({ state: 'none' }), '');
  assert.equal(
    updateWords({ state: 'downloading', version: '2026.1201.930', percent: 40 }),
    'Downloading version 2026.1201.930: 40%.',
  );
  assert.equal(
    updateWords({ state: 'ready', version: '2026.1201.930' }),
    'Version 2026.1201.930 is ready. It installs when you close the app.',
  );
  assert.equal(
    updateWords({ state: 'manual', version: '2026.1201.930' }),
    'Version 2026.1201.930 is out. Download it to update.',
  );
});

/** Settings' Graphics drawn while the shell tells `info`, and what the game then asked of it. */
function graphicsWith(info: DesktopInfo | null) {
  const asked: DesktopAsk[] = [];
  useDesktop(info, (ask) => asked.push(ask));
  const settings = new Settings(() => null, fakePage().page, new Rebinding());
  settings.show('graphics');
  const page = drawn((context) => settings.node(context));
  page.frame();
  return { page, asked };
}

const windows: DesktopInfo = {
  version: '2026.1125.1230',
  platform: 'windows',
  graphics: { ...graphics, running: 'D3D12', adapter: 'NVIDIA GeForce RTX 4070' },
  update: { state: 'none' },
};

test('in a browser Graphics has no App part', () => {
  const { page } = graphicsWith(null);
  assert.doesNotMatch(page.shows(), /APP|Version/);
});

test('on Windows the App part offers the graphics API, says what it draws with, and the version', () => {
  const { page, asked } = graphicsWith(windows);
  try {
    assert.match(
      page.shows(),
      /APP \| Graphics API \| Auto .*Drawing with Direct3D 12 on NVIDIA GeForce RTX 4070\. \| Version \| 2026\.1125\.1230/,
    );
    page.click('graphics-api');
    page.click('graphics-api:d3d11');
    assert.deepEqual(asked, [{ ask: 'graphics', api: 'd3d11' }]);
  } finally {
    useDesktop(null, () => undefined);
  }
});

test('a choice waiting on a restart, or an update ready, offers Restart now; one to download, Download', () => {
  const restart = graphicsWith({ ...windows, graphics: { ...windows.graphics, chosen: 'd3d11', restart: true } });
  try {
    assert.match(restart.page.shows(), /The change comes into force when the app starts again\./);
    restart.page.click('desktop-restart');
    assert.deepEqual(restart.asked, [{ ask: 'restart' }]);
    const ready = graphicsWith({ ...windows, update: { state: 'ready', version: '2026.1201.930' } });
    ready.page.click('desktop-restart');
    assert.deepEqual(ready.asked, [{ ask: 'restart' }]);
    const manual = graphicsWith({ ...windows, update: { state: 'manual', version: '2026.1201.930' } });
    assert.doesNotMatch(manual.page.shows(), /Restart now/);
    manual.page.click('desktop-download');
    assert.deepEqual(manual.asked, [{ ask: 'download' }]);
  } finally {
    useDesktop(null, () => undefined);
  }
});

test('on Linux and the Mac there is no choice to make, only what the app draws with', () => {
  const { page } = graphicsWith({
    ...windows,
    platform: 'linux',
    graphics: {
      ...windows.graphics,
      choices: ['auto'],
      launched: 'vulkan',
      running: 'vulkan',
      adapter: 'AMD Radeon RX 7800 XT',
    },
  });
  try {
    assert.doesNotMatch(page.shows(), /Graphics API/);
    assert.match(page.shows(), /Drawing with Vulkan on AMD Radeon RX 7800 XT\./);
  } finally {
    useDesktop(null, () => undefined);
  }
});

test('a choice whose every way failed on this card says so', () => {
  const { page } = graphicsWith({ ...windows, graphics: { ...windows.graphics, chosen: 'd3d11', held: true } });
  try {
    assert.match(page.shows(), /Direct3D 11 could not start on this card, so the app draws with another\./);
  } finally {
    useDesktop(null, () => undefined);
  }
});
