import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Details } from '../network/accounts.ts';
import { sizesOf } from './gearNodes.ts';
import { detailsNode } from './playerDetails.ts';

/** Every word a tree shows, in order. */
function wordsOf(node: unknown): string[] {
  if (!node || typeof node !== 'object') return [];
  const { text, children } = node as { text?: { words: unknown }; children?: unknown[] };
  const own = text && typeof text.words === 'string' ? [text.words] : [];
  return [...own, ...(children ?? []).flatMap(wordsOf)];
}

test("another player's details show their guild's description under its motto", () => {
  const ui = { hovered: () => false, focused: () => false, keyFocused: false, clicked: () => false };
  const found: Details = {
    name: 'Bo',
    tag: 'SALT',
    emblem: null,
    level: 3,
    place: null,
    playing: false,
    guild: {
      name: 'Salt Kings',
      tag: 'SALT',
      motto: 'No tithe, no master.',
      description: 'We sail from Overlook.',
      rank: 'Member',
    },
    shown: null,
  };
  const said = wordsOf(
    detailsNode({ ui: ui as never, room: { width: 900, height: 700 }, sizes: sizesOf(1280, 720, 1) }, found, () => {}),
  );
  const motto = said.indexOf('No tithe, no master.');
  assert.ok(motto >= 0, said.join(' | '));
  assert.ok(said.indexOf('We sail from Overlook.') > motto, said.join(' | '));
});
