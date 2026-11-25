import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Playing } from './gameFrame.ts';
import { helmControls } from './helmControls.ts';
import type { LandSheet } from '../heldmap/landSheet.ts';

Object.assign(globalThis, { document: { exitPointerLock: () => undefined } });

/** Controls over a player on foot in a dungeon, the map raised written down, the web's map `passage` where given. */
function underGround(passage: LandSheet | null) {
  const opened: LandSheet[] = [];
  const playing = {
    flow: { mode: 'foot', node: 'passage-continent-1-w1-z3' },
    foot: { fallen: false, dungeon: {}, node: {} },
    helmMap: { openLand: (sheet: LandSheet) => void opened.push(sheet) },
  } as unknown as Playing;
  const game = { landAt: () => undefined, change: () => undefined, groundAt: () => null, passageMap: () => passage };
  return { opened, controls: helmControls(playing, { lock: () => undefined }, game) };
}

test('under ground the map opens on a passage zone’s web, and on no other dungeon', () => {
  const web = { name: 'The passages' } as LandSheet;
  const zone = underGround(web);
  zone.controls.openMap();
  assert.deepEqual(zone.opened, [web]);
  const dungeon = underGround(null);
  dungeon.controls.openMap();
  assert.deepEqual(dungeon.opened, []);
});
