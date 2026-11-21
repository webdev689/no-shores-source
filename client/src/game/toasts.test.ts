import assert from 'node:assert/strict';
import { test } from 'node:test';
import { glyphDrawn } from '../ui/glyphs.ts';
import type { Face } from '../ui/text.ts';
import { keptToasts, layToasts, MOST_TOASTS } from './toasts.ts';

/** A face whose every glyph is a 600-unit block. */
const block = glyphDrawn({ rows: ['##', '##'], advance: 600 });
const face: Face = { glyph: () => block };

test('a toast still said keeps its moment, a new one comes now, and only the newest three stand', () => {
  const first = keptToasts([], ['The Brig is boarded!'], 1);
  const both = keptToasts(first, ['The Brig is boarded!', 'You will rise.'], 2);
  assert.deepEqual(both, [
    { text: 'The Brig is boarded!', since: 1 },
    { text: 'You will rise.', since: 2 },
  ]);
  assert.equal(keptToasts([], ['a', 'b', 'c', 'd'], 0).length, MOST_TOASTS);
  assert.equal(keptToasts([], ['a', 'b', 'c', 'd'], 0)[0]?.text, 'b');
});

test('toasts stand centred, the newest last, the column 268 px above the foot; narrow beside the ship panel', () => {
  const toasts = keptToasts([], ['One', 'Two words'], 0);
  const view = { width: 1200, height: 800, panelShown: false };
  const [one, two] = layToasts(face, toasts, view, 1, false);
  assert.ok(one && two);
  assert.equal(two.box.y + two.box.height, 800 - 268, 'the foot of the column');
  assert.equal(two.box.y - (one.box.y + one.box.height), 4, 'a 4 px gap');
  assert.equal(one.box.x, Math.round((1200 - one.box.width) / 2), 'centred');
  assert.equal(one.box.height, 26 + 12, 'a line of 26 and 6 each side');
  assert.equal(one.come, 1, 'risen once the rise is over');
  const beside = layToasts(face, toasts, { width: 800, height: 800, panelShown: true }, 1, false);
  assert.equal(beside[0]?.box.x, 292, 'right of the panel');
  const wide = layToasts(face, toasts, { width: 1200, height: 800, panelShown: true }, 1, false);
  assert.notEqual(wide[0]?.box.x, 292, 'wide, still centred');
});

test('a new toast rises in over a fifth of a second, still where motion is reduced; one too long wraps full width', () => {
  const [rising] = layToasts(
    face,
    keptToasts([], ['Now'], 1),
    { width: 1200, height: 800, panelShown: false },
    1.02,
    false,
  );
  assert.ok(rising && rising.come > 0 && rising.come < 1);
  const [still] = layToasts(face, keptToasts([], ['Now'], 1), { width: 1200, height: 800, panelShown: false }, 1, true);
  assert.equal(still?.come, 1);
  const long = Array.from({ length: 40 }, () => 'word').join(' ');
  const [wrapped] = layToasts(
    face,
    keptToasts([], [long], 0),
    { width: 600, height: 800, panelShown: false },
    1,
    false,
  );
  assert.ok(wrapped && wrapped.lines.length > 1);
  assert.equal(wrapped.box.width, 600 - 56, 'the column’s whole width');
});
