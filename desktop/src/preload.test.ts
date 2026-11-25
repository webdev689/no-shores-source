import assert from 'node:assert/strict';
import Module, { createRequire } from 'node:module';
import { test } from 'node:test';
import { BRIDGE_NAME, type DesktopBridge, type DesktopInfo } from '../../client/src/desktop.ts';
import { CHANNELS, ORIGIN_ARGUMENT } from './bridge.ts';

const require = createRequire(import.meta.url);
const told = { version: 'dev' } as DesktopInfo;

/** Runs the preload as a page at `origin` would, with a stand-in for Electron's renderer side: what it put on the
 *  page, what it asked the shell synchronously, and what it sent. */
function preloadAt(origin: string) {
  const exposed = new Map<string, unknown>();
  const sent: [string, unknown][] = [];
  const asked: string[] = [];
  const listeners = new Map<string, (event: unknown, value: unknown) => void>();
  const electron = {
    contextBridge: { exposeInMainWorld: (name: string, value: unknown) => exposed.set(name, value) },
    ipcRenderer: {
      sendSync: (channel: string) => (asked.push(channel), told),
      send: (channel: string, value: unknown) => sent.push([channel, value]),
      on: (channel: string, listener: (event: unknown, value: unknown) => void) => listeners.set(channel, listener),
    },
  };
  const electronPath = require.resolve('electron');
  const preloadPath = require.resolve('./preload.cts');
  const stand = new Module(electronPath);
  stand.exports = electron;
  stand.loaded = true;
  const kept = require.cache[electronPath];
  require.cache[electronPath] = stand;
  delete require.cache[preloadPath];
  const argument = `${ORIGIN_ARGUMENT}https://noshores.online`;
  process.argv.push(argument);
  Object.assign(globalThis, { location: { origin } });
  try {
    require(preloadPath);
  } finally {
    process.argv.splice(process.argv.indexOf(argument), 1);
    Reflect.deleteProperty(globalThis, 'location');
    if (kept) require.cache[electronPath] = kept;
    else delete require.cache[electronPath];
  }
  return { exposed, sent, asked, listeners };
}

test("on the game's own pages the bridge is put on the page, on the shell's own channels", () => {
  const { exposed, sent, asked, listeners } = preloadAt('https://noshores.online');
  const bridge = exposed.get(BRIDGE_NAME) as DesktopBridge;
  assert.ok(bridge);
  assert.deepEqual(asked, [CHANNELS.info]);
  assert.equal(bridge.info(), told);
  bridge.ask({ ask: 'restart' });
  assert.deepEqual(sent, [[CHANNELS.ask, { ask: 'restart' }]]);
  const heard: string[] = [];
  bridge.onInfo((info) => heard.push(info.version));
  listeners.get(CHANNELS.changed)?.(null, { version: '2026.1201.930' });
  assert.deepEqual(heard, ['2026.1201.930']);
  assert.equal(bridge.info().version, '2026.1201.930');
});

test('a page the window passes through to sign in gets nothing, and nothing is asked of the shell', () => {
  const { exposed, sent, asked } = preloadAt('https://discord.com');
  assert.equal(exposed.size, 0);
  assert.deepEqual([sent, asked], [[], []]);
});
