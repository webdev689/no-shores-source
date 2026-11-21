import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GearState } from '../network/gearMessages.ts';
import { layout } from '../ui/layout.ts';
import { glyphDrawn } from '../ui/glyphs.ts';
import type { Node } from '../ui/node.ts';
import type { Face } from '../ui/text.ts';
import { AcquiredFeed } from './acquiredFeed.ts';
import { companyNode } from './companyHud.ts';
import { sizesOf } from './gearNodes.ts';
import { sampleGear } from './gearShots.ts';

const face: Face = { glyph: () => glyphDrawn({ rows: ['#'], advance: 600 }) };
const VIEW = { width: 1280, height: 720 };
const sizes = sizesOf(VIEW.width, VIEW.height, 1);

/** The feed over gear the test sets, on a clock moved by hand. */
function feed() {
  let now = 0;
  let gear: GearState | null = sampleGear();
  const shown = new AcquiredFeed(
    () => gear && { gear, ask: () => undefined, forge: null, dress: null },
    () => {
      throw new Error('no forge here');
    },
    () => now,
  );
  const rows = () => {
    const node = shown.node(sizes, VIEW, false);
    return node ? (node.children ?? []).length : 0;
  };
  return { rows, set: (next: GearState) => (gear = next), wait: (span: number) => (now += span) };
}

test('what a room first says, and what changes in the ten seconds after, is not a gain', () => {
  const { rows, set, wait } = feed();
  rows();
  set({ ...sampleGear(), aurem: 99_999 });
  wait(5_000);
  assert.equal(rows(), 0);
});

test('gains show a row each, a gain like one shown adds to its row, and the rows leave after a few seconds', () => {
  const { rows, set, wait } = feed();
  rows();
  wait(11_000);
  const base = sampleGear();
  set({ ...base, aurem: base.aurem + 10 });
  assert.equal(rows(), 1);
  set({ ...base, aurem: base.aurem + 20, shapes: (base.shapes ?? 0) + 1 });
  assert.equal(rows(), 2, 'more Aurem joins its row; Shapes take one of their own');
  wait(5_000);
  assert.equal(rows(), 0, 'gone after four and a half seconds and their fade');
});

test('the company shows each other member’s nameplate and the first invite, laid 240 by 48', () => {
  const person = (name: string, place: string | null) => ({ name, tag: null, emblem: null, level: 1, place });
  const none = companyNode(null);
  assert.equal(none, null);
  const node = companyNode({
    me: person('Me', null),
    privacy: 'open',
    company: { leader: 'Ansel', members: [person('Me', null), person('Ansel', 'sea')] },
    invites: [person('Corra', null)],
    nearby: [],
    guests: 0,
    friends: [],
    asking: [],
    asked: [],
    guild: null,
    guildInvites: [],
    blocked: [],
  });
  assert.ok(node);
  const laid = layout({ width: 'grow', height: 'grow', children: [node] } as Node, { x: 0, y: 0, ...VIEW }, { face });
  const plates = laid.filter((each) => each.node.width === 240);
  assert.equal(plates.length, 1, 'one plate: the player’s own is left out');
  assert.deepEqual([plates[0]?.box.width, plates[0]?.box.height], [240, 48]);
});
