import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DesktopUpdate } from '../../client/src/desktop.ts';
import { type CopyFacts, followsFeed, restartOf, transportOf, updateAfter } from './updates.ts';

const installed: CopyFacts = {
  packaged: true,
  platform: 'win32',
  configured: true,
  appImage: false,
  deb: false,
  signed: false,
};

test('a copy run from the source, or cut without a release, never looks for updates', () => {
  assert.equal(transportOf({ ...installed, packaged: false }), 'none');
  assert.equal(transportOf({ ...installed, configured: false }), 'none');
});

test("the Windows installer's copy replaces itself", () => {
  assert.equal(transportOf(installed), 'updater');
});

test('a Mac app replaces itself only when a developer signed it', () => {
  assert.equal(transportOf({ ...installed, platform: 'darwin' }), 'notice');
  assert.equal(transportOf({ ...installed, platform: 'darwin', signed: true }), 'updater');
});

test('on Linux an AppImage run as one, or the Debian package, replaces itself, and anything else is told', () => {
  assert.equal(transportOf({ ...installed, platform: 'linux', appImage: true }), 'updater');
  assert.equal(transportOf({ ...installed, platform: 'linux', deb: true }), 'updater');
  assert.equal(transportOf({ ...installed, platform: 'linux' }), 'notice');
});

const none: DesktopUpdate = { state: 'none' };

test('an update found downloads where the copy installs itself, and is to download by hand where it cannot', () => {
  assert.deepEqual(updateAfter(none, { kind: 'available', version: '2026.1201.930' }, 'updater'), {
    state: 'downloading',
    version: '2026.1201.930',
    percent: 0,
  });
  assert.deepEqual(updateAfter(none, { kind: 'available', version: '2026.1201.930' }, 'notice'), {
    state: 'manual',
    version: '2026.1201.930',
  });
});

test("a download's progress is a whole share between none and all of it", () => {
  const downloading: DesktopUpdate = { state: 'downloading', version: 'v', percent: 0 };
  assert.deepEqual(updateAfter(downloading, { kind: 'progress', percent: 41.6 }, 'updater'), {
    ...downloading,
    percent: 42,
  });
  assert.deepEqual(updateAfter(downloading, { kind: 'progress', percent: 140 }, 'updater'), {
    ...downloading,
    percent: 100,
  });
  assert.deepEqual(updateAfter(none, { kind: 'progress', percent: 50 }, 'updater'), none);
});

test('a ready update stays ready whatever a later check says, until the app closes and installs it', () => {
  const ready = updateAfter(none, { kind: 'downloaded', version: 'v2' }, 'updater');
  assert.deepEqual(ready, { state: 'ready', version: 'v2' });
  assert.deepEqual(updateAfter(ready, { kind: 'none' }, 'updater'), ready);
  assert.deepEqual(updateAfter(ready, { kind: 'failed' }, 'updater'), ready);
  assert.deepEqual(updateAfter(ready, { kind: 'available', version: 'v3' }, 'updater'), ready);
});

test('a download that fails is forgotten, so the next check starts afresh; a notice outlasts a failed check', () => {
  const downloading: DesktopUpdate = { state: 'downloading', version: 'v', percent: 30 };
  assert.deepEqual(updateAfter(downloading, { kind: 'failed' }, 'updater'), none);
  const manual: DesktopUpdate = { state: 'manual', version: 'v' };
  assert.deepEqual(updateAfter(manual, { kind: 'failed' }, 'notice'), manual);
  assert.deepEqual(updateAfter(manual, { kind: 'none' }, 'notice'), manual);
});

test('Restart installs a ready update once; pressed again while it installs, it does nothing else', () => {
  const ready: DesktopUpdate = { state: 'ready', version: 'v2' };
  assert.equal(restartOf(ready, false), 'install');
  assert.equal(restartOf(ready, true), 'installing');
  assert.equal(restartOf(none, false), 'relaunch');
  assert.equal(restartOf({ state: 'manual', version: 'v2' }, false), 'relaunch');
});

test('a copy follows a feed only where its update file names a provider: a trial pack writes one without', () => {
  assert.equal(followsFeed('provider: generic\nurl: https://noshores.online/download/\n'), true);
  assert.equal(followsFeed('updaterCacheDirName: no-shores-desktop-updater\n'), false);
  assert.equal(followsFeed(null), false);
});
