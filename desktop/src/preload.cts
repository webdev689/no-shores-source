// The bridge the game's page finds as `noShoresDesktop`, put there before any of the page's own script runs. The
// window is sandboxed, so this file loads nothing of its own and names the shell's channels itself (`bridge.ts`, held
// equal by test). It is put on the game's own pages alone: a page the window passes through to sign in with Discord
// gets nothing. Every ask goes to the shell, which checks it again (`bridge.ts` askOf).
import type * as Electron from 'electron';
import type { DesktopAsk, DesktopBridge, DesktopInfo } from '../../client/src/desktop.ts';

const { contextBridge, ipcRenderer } = require('electron') as typeof Electron;

const CHANNELS = { info: 'noshores:info', changed: 'noshores:info-changed', ask: 'noshores:ask' };
const ORIGIN_ARGUMENT = '--noshores-game-origin=';

const gameOrigin = process.argv.find((arg) => arg.startsWith(ORIGIN_ARGUMENT))?.slice(ORIGIN_ARGUMENT.length);

if (gameOrigin !== undefined && globalThis.location.origin === gameOrigin) {
  let told = ipcRenderer.sendSync(CHANNELS.info) as DesktopInfo;
  const listeners: ((info: DesktopInfo) => void)[] = [];
  ipcRenderer.on(CHANNELS.changed, (_event, info: DesktopInfo) => {
    told = info;
    for (const listener of listeners) listener(info);
  });
  const bridge: DesktopBridge = {
    info: () => told,
    onInfo: (listener) => void listeners.push(listener),
    ask: (ask: DesktopAsk) => ipcRenderer.send(CHANNELS.ask, ask),
  };
  contextBridge.exposeInMainWorld('noShoresDesktop', bridge);
}
