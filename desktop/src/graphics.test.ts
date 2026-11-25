import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GraphicsFailure } from './config.ts';
import {
  BACKEND_ARGUMENT,
  type Desk,
  backendsOf,
  choicesOf,
  gpuKeyOf,
  isWayland,
  launchFor,
  orderOf,
  reviewFailures,
} from './graphics.ts';

const windows: Desk = { platform: 'win32', wayland: false };
const mac: Desk = { platform: 'darwin', wayland: false };
const wayland: Desk = { platform: 'linux', wayland: true };
const x11: Desk = { platform: 'linux', wayland: false };
const chromium = '156.0.8078.109';
const failed = (backend: GraphicsFailure['backend'], under = chromium): GraphicsFailure => ({
  backend,
  gpu: '10de:2786@566.36',
  chromium: under,
  reason: 'no adapter',
  at: 'then',
});
const plain = { chosen: 'auto', failures: [], chromium, argv: [], variable: undefined } as const;

test('each platform reaches WebGPU by its own API: Direct3D on Windows, Metal on a Mac, Vulkan on Linux', () => {
  assert.deepEqual(orderOf(windows), ['d3d12', 'd3d11']);
  assert.deepEqual(orderOf(mac), ['metal']);
  assert.deepEqual(orderOf(wayland), ['vulkan', 'vulkan-unlisted', 'vulkan-skia']);
  assert.deepEqual(orderOf(x11), ['vulkan-skia'], "Chromium's own way to Vulkan is Wayland's alone");
});

test('a player chooses an API only where there is more than one', () => {
  assert.deepEqual(choicesOf(windows), ['auto', 'd3d12', 'd3d11']);
  assert.deepEqual(choicesOf(wayland), ['auto'], 'three ways to Vulkan are one API');
  assert.deepEqual(choicesOf(mac), ['auto']);
});

test('the app opens on Wayland as Electron picks it: by the session, or as the player told it', () => {
  assert.equal(isWayland({ XDG_SESSION_TYPE: 'wayland' }, []), true);
  assert.equal(isWayland({ XDG_SESSION_TYPE: 'x11', DISPLAY: ':0' }, []), false);
  // A compositor started from a console sets a display but no Wayland session: Electron then opens on X11.
  assert.equal(isWayland({ XDG_SESSION_TYPE: 'tty', WAYLAND_DISPLAY: 'wayland-1' }, []), false);
  assert.equal(isWayland({ XDG_SESSION_TYPE: 'wayland' }, ['--ozone-platform=x11']), false);
  assert.equal(isWayland({ XDG_SESSION_TYPE: 'wayland' }, ['--ozone-platform-hint=x11']), false);
  assert.equal(isWayland({ XDG_SESSION_TYPE: 'tty' }, ['--ozone-platform=wayland']), true);
  assert.equal(isWayland({ WAYLAND_DISPLAY: 'wayland-1' }, ['--ozone-platform-hint=wayland']), true);
  assert.equal(isWayland({}, ['--ozone-platform-hint=wayland']), false);
});

test("Auto takes the platform's default, with the rest still to try", () => {
  assert.deepEqual(launchFor({ ...plain, desk: windows }), {
    backend: 'd3d12',
    next: ['d3d11'],
    chosen: 'auto',
    held: null,
    named: false,
    afresh: false,
  });
});

test("a backend that failed on record is passed over for the next, and Auto's choice is never held", () => {
  const launch = launchFor({ ...plain, desk: wayland, failures: [failed('vulkan')] });
  assert.equal(launch.backend, 'vulkan-unlisted');
  assert.deepEqual(launch.next, ['vulkan-skia']);
  assert.equal(launch.held, null);
});

test("the player's own choice comes first, and is held where every way to it failed", () => {
  const chosen = launchFor({ ...plain, desk: windows, chosen: 'd3d11' });
  assert.deepEqual([chosen.backend, chosen.next], ['d3d11', ['d3d12']]);
  const held = launchFor({ ...plain, desk: windows, chosen: 'd3d11', failures: [failed('d3d11')] });
  assert.equal(held.backend, 'd3d12');
  assert.equal(held.held?.backend, 'd3d11');
});

test('a failure under another Chromium holds nothing: an update of the app tries the backend again', () => {
  assert.equal(launchFor({ ...plain, desk: windows, failures: [failed('d3d12', '150.0')] }).backend, 'd3d12');
});

test('with every backend failed, as the player was told, opening the app again tries them all afresh', () => {
  const launch = launchFor({ ...plain, desk: windows, failures: [failed('d3d12'), failed('d3d11')] });
  assert.deepEqual([launch.backend, launch.next, launch.afresh, launch.held], ['d3d12', ['d3d11'], true, null]);
  const chosen = launchFor({ ...plain, desk: windows, chosen: 'd3d11', failures: [failed('d3d12'), failed('d3d11')] });
  assert.deepEqual([chosen.backend, chosen.next], ['d3d11', ['d3d12']], "the player's choice first");
  assert.equal(launchFor({ ...plain, desk: windows, failures: [failed('d3d12')] }).afresh, false);
});

test('an API the desk does not have is no choice there', () => {
  assert.equal(launchFor({ ...plain, desk: mac, chosen: 'd3d11' }).backend, 'metal');
});

test('the argument or the variable names one launch over every choice and record', () => {
  const argued = launchFor({
    ...plain,
    desk: windows,
    argv: ['app', `${BACKEND_ARGUMENT}d3d11`],
    failures: [failed('d3d11')],
  });
  assert.deepEqual([argued.backend, argued.next, argued.named], ['d3d11', [], true]);
  assert.equal(launchFor({ ...plain, desk: x11, variable: 'swiftshader' }).backend, 'swiftshader');
  assert.equal(launchFor({ ...plain, desk: x11, variable: 'opengl' }).backend, 'vulkan-skia');
});

test('choosing an API again names the backends it is, to try them again', () => {
  assert.deepEqual(backendsOf('vulkan', wayland), ['vulkan', 'vulkan-unlisted', 'vulkan-skia']);
  assert.deepEqual(backendsOf('d3d11', windows), ['d3d11']);
  assert.deepEqual(backendsOf('auto', windows), []);
});

test('once a launch knows its card, failures on another card or Chromium go, and one with no card learns it', () => {
  const kept = reviewFailures(
    [
      failed('d3d12'),
      { ...failed('d3d11'), gpu: '1002:73bf@31.0' },
      failed('d3d12', '150.0'),
      { ...failed('vulkan'), gpu: null },
    ],
    '10de:2786@566.36',
    chromium,
  );
  assert.deepEqual(
    kept.map((failure) => [failure.backend, failure.gpu]),
    [
      ['d3d12', '10de:2786@566.36'],
      ['vulkan', '10de:2786@566.36'],
    ],
  );
  assert.equal(reviewFailures([failed('d3d12')], null, chromium).length, 1, 'a card not learned clears nothing');
});

test("a card is its vendor, device and driver: the active one, never a software renderer's", () => {
  assert.equal(
    gpuKeyOf([
      { vendorId: 0x1414, deviceId: 0x8c, driverVersion: '10.0' },
      { vendorId: 0x8086, deviceId: 0x46a6, driverVersion: '31.0.101' },
      { vendorId: 0x10de, deviceId: 0x2786, driverVersion: '566.36', active: true },
    ]),
    '10de:2786@566.36',
  );
  assert.equal(gpuKeyOf([{ vendorId: 0x8086, deviceId: 0x46a6 }]), '8086:46a6@?');
  assert.equal(gpuKeyOf([{ vendorId: 0xffff, deviceId: 0xc0de }]), null);
  assert.equal(gpuKeyOf([]), null);
});

test('the argument may name the backends left in turn, as a restart that could not keep its failure does', () => {
  const launch = launchFor({
    ...plain,
    desk: wayland,
    argv: ['app', `${BACKEND_ARGUMENT}vulkan-unlisted,vulkan-skia`],
  });
  assert.deepEqual([launch.backend, launch.next, launch.named], ['vulkan-unlisted', ['vulkan-skia'], true]);
  const unknown = launchFor({ ...plain, desk: wayland, argv: ['app', `${BACKEND_ARGUMENT}vulkan,opengl`] });
  assert.equal(unknown.named, false, 'a list with a backend the app does not know names nothing');
});
