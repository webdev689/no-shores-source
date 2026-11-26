import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Node } from '../ui/node.ts';
import { NOTICE_S, Obtained, WITH_KEY_S, noticeNode } from './obtained.ts';

const notice = (title: string, more = {}) => ({ title, line: `${title}, given`, icon: null, ...more });

test('what is obtained is noticed one at a time, in order, each its while, a repeat merged and none lost', () => {
  const heard: string[] = [];
  const obtained = new Obtained((said) => heard.push(said));
  obtained.notify(notice('The Sloop'), notice('The Bay Horse'), notice('The Sloop'));
  assert.equal(obtained.waiting, 2, 'the repeat merged into the one waiting');
  assert.equal(obtained.shown(0, false)?.notice.title, 'The Sloop');
  assert.deepEqual(heard, ['The Sloop. The Sloop, given'], 'read to a screen reader as it stands');
  assert.equal(obtained.shown(NOTICE_S - 0.1, false)?.notice.title, 'The Sloop', 'it stands its while');
  assert.equal(obtained.shown(NOTICE_S + 0.1, false)?.notice.title, 'The Bay Horse', 'then the next');
  assert.equal(obtained.shown(NOTICE_S * 3, false), null, 'then none');
});

test('a notice waits while someone speaks, its clock held, and one with a key stands longer', () => {
  const obtained = new Obtained(() => undefined);
  obtained.notify(notice('Inventory', { key: 'inventory', line: 'Press {key} to open your inventory.' }));
  assert.equal(obtained.shown(0, true), null, 'held while the dialogue box speaks');
  assert.equal(obtained.shown(30, true), null);
  assert.equal(obtained.shown(31, false)?.notice.title, 'Inventory', 'shown once the words end');
  assert.ok(WITH_KEY_S > NOTICE_S);
  assert.equal(obtained.shown(31 + WITH_KEY_S - 0.1, false)?.notice.title, 'Inventory', 'a key to press: longer');
});

/** Every word a node holds, in order. */
function said(node: Node | null | undefined): string[] {
  if (!node) return [];
  const own = node.text
    ? [typeof node.text.words === 'string' ? node.text.words : node.text.words.map((span) => span.words).join('')]
    : [];
  return [...own, ...(node.children ?? []).flatMap((child) => (child ? said(child) : []))];
}

test("the notice's band names it, its key on a keycap in its line, and the key and what it opens at the far right", () => {
  const band = noticeNode(
    {
      title: 'Your gear',
      line: 'Press {key} to open your character screen.',
      icon: null,
      key: 'character',
      opens: 'Open Character',
    },
    { width: 1920, height: 1080 },
    1,
  );
  const words = said(band);
  assert.ok(words.includes('Your gear'));
  assert.ok(words.includes('Press') && words.includes('to open your character screen.'), 'the line round its key');
  assert.ok(words.includes('Open Character'), 'what the key opens, at the right');
  assert.equal(band.through, true, 'the pointer passes to what is under it');
  const phone = noticeNode(notice('The Sloop'), { width: 390, height: 844 }, 1);
  assert.ok(!said(phone).includes('Open Character'), 'no key: no hint at the right');
});
