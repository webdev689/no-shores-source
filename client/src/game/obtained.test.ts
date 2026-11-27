import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Node } from '../ui/node.ts';
import { laidOf, wordsIn } from '../ui/uiForTests.ts';
import { BINDS } from '../player/input.ts';
import { LINE_INK, NOTICE_FILL, NOTICE_S, Obtained, type Standing, WITH_KEY_S, noticeNode } from './obtained.ts';

const notice = (title: string, more = {}) => ({ title, line: `${title}, given`, icon: null, ...more });

test('what is obtained is noticed one at a time, in order, each its while, a repeat merged', () => {
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

test('at most 12 wait: past them the oldest waiting is let go, so a flood never stands for minutes', () => {
  const obtained = new Obtained(() => undefined);
  obtained.notify(...Array.from({ length: 14 }, (_unused, place) => notice(`Find ${place}`)));
  assert.equal(obtained.waiting, 12);
  assert.equal(obtained.shown(0, false)?.notice.title, 'Find 2', 'the two oldest let go');
});

test('a repeat of the notice standing is merged into it, not shown again after it', () => {
  const obtained = new Obtained(() => undefined);
  obtained.notify(notice('The Sloop'));
  assert.equal(obtained.shown(0, false)?.notice.title, 'The Sloop');
  obtained.notify(notice('The Sloop'));
  assert.equal(obtained.waiting, 1, 'the one standing alone');
  assert.equal(obtained.shown(NOTICE_S + 0.1, false), null);
});

/** How opaque a notice stands: the lesser of how far it has come and how far it has yet to go. */
const opacity = (standing: Standing | null) => (standing ? Math.min(standing.come, 1 - standing.gone) : 0);

test('a notice standing as someone begins to speak fades out, its clock held, and fades back in once they end', () => {
  const obtained = new Obtained(() => undefined);
  obtained.notify(notice('The Sloop'));
  obtained.shown(0, false);
  assert.equal(opacity(obtained.shown(1, false)), 1);
  const fading = opacity(obtained.shown(1.1, true));
  assert.ok(fading > 0 && fading < 1, `fading out as the words come up (${fading})`);
  assert.equal(obtained.shown(2, true), null, 'gone while they are up');
  assert.equal(obtained.shown(20, true), null);
  const back = obtained.shown(20.05, false);
  assert.equal(back?.notice.title, 'The Sloop', 'the same notice, its while held');
  assert.ok(opacity(back) < 1, `fading back in, not at full at once (${opacity(back)})`);
  assert.equal(opacity(obtained.shown(21, false)), 1);
  // Stood 1 s before the words came up: it stands its 3.5 s more after them.
  assert.equal(obtained.shown(19 + NOTICE_S - 0.1, false)?.notice.title, 'The Sloop', 'its while held while gone');
  assert.equal(obtained.shown(19 + NOTICE_S + 0.1, false), null);
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
  assert.match(words.join(' '), /Press I to open your character screen\./, 'the line round its key on its keycap');
  assert.ok(words.includes('Open Character'), 'what the key opens, at the right');
  assert.equal(band.through, true, 'the pointer passes to what is under it');
  const phone = noticeNode(notice('The Sloop'), { width: 390, height: 844 }, 1);
  assert.ok(!said(phone).includes('Open Character'), 'no key: no hint at the right');
});

/** A channel's share of a colour's relative luminance, as WCAG reckons it. */
const linear = (channel: number) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
const luminance = ([red, green, blue]: readonly number[]) =>
  0.2126 * linear((red ?? 0) / 255) + 0.7152 * linear((green ?? 0) / 255) + 0.0722 * linear((blue ?? 0) / 255);
/** `top` at `alpha` laid over `under`. */
const blend = (top: readonly number[], alpha: number, under: readonly number[]) =>
  top.map((channel, index) => channel * alpha + (under[index] ?? 0) * (1 - alpha));

test("the notice's band is a translucent grey the screen shows through, its words reading on it over white or black", () => {
  const [red = 0, green = 0, blue = 0, alpha = 1] = (NOTICE_FILL.match(/[\d.]+/g) ?? []).map(Number);
  assert.ok(alpha <= 0.8 && alpha >= 0.5, `translucent, as the reference's (${alpha})`);
  for (const under of [
    [255, 255, 255],
    [0, 0, 0],
    [128, 128, 128],
  ]) {
    const ground = blend([red, green, blue], alpha, under);
    // The line, and the key and what it opens at the right, the dimmest of its words.
    const [lineRed = 0, lineGreen = 0, lineBlue = 0, lineAlpha = 1] = (LINE_INK.match(/[\d.]+/g) ?? []).map(Number);
    const line = blend([lineRed, lineGreen, lineBlue], lineAlpha, ground);
    const ratio = (luminance(line) + 0.05) / (luminance(ground) + 0.05);
    assert.ok(ratio >= 4.5, `the line reads at 4.5:1 over ${under.join(',')} (${ratio.toFixed(2)}:1)`);
  }
});

test("on a phone a notice's long line wraps inside the view, none of it cut off at the right", () => {
  const view = { width: 412, height: 915 };
  const lines = [
    notice('Quest acquired', { line: 'A House of Your Own. Follow its steps in the tracker.' }),
    notice('Your horse', { key: 'mount', line: 'Press {key} to call your horse wherever you stand.', opens: 'Mount' }),
  ];
  for (const one of lines)
    for (const laid of laidOf(noticeNode(one, view, 1), view.width, view.height).filter((each) => each.node.text))
      assert.ok(
        laid.box.x + laid.box.width <= view.width,
        `${wordsIn(laid.node)} ends at ${laid.box.x + laid.box.width}`,
      );
});

test('a notice names the key on the keys or the pad played last, and asks for no press where none is bound', () => {
  const inventory = notice('Storm Pistol', {
    key: 'inventory',
    line: 'Legendary. Press {key} to open your inventory.',
    opens: 'Open Inventory',
  });
  const horse = notice('Your horse', { key: 'mount', line: 'The Bay Horse. Press {key} to ride.', opens: 'Mount' });
  const view = { width: 1920, height: 1080 };
  const heard: string[] = [];
  const obtained = new Obtained((words) => heard.push(words));
  try {
    assert.match(noticeNode(horse, view, 1).label ?? '', /^Your horse\. The Bay Horse\. Press \S+ to ride\.$/);
    BINDS.device = 'pad';
    const band = noticeNode(inventory, view, 1);
    assert.equal(band.label, 'Storm Pistol. Legendary.', 'no pad button opens the inventory: no press asked');
    assert.ok(!said(band).some((each) => /Press|Open Inventory/.test(each)), said(band).join(' | '));
    assert.equal(noticeNode(horse, view, 1).label, 'Your horse. The Bay Horse. Press Up to ride.');
    obtained.notify(inventory);
    obtained.shown(0, false);
    assert.deepEqual(heard, ['Storm Pistol. Legendary.']);
  } finally {
    BINDS.device = 'keys';
  }
});

test('from a phone to a wide screen nothing in a notice with a key overlaps, all of it inside its band', () => {
  const keyed = [
    notice("The Armorsmith's gift", {
      key: 'character',
      line: 'Head, torso, arm and leg armour. Press {key} to put it on.',
      opens: 'Open Character',
    }),
    notice('A Stormcallers fragment to choose', {
      key: 'character',
      line: "Press {key}, then choose it on the Art's screen.",
      opens: 'Open Character',
    }),
    notice('Tidewarden Greathelm of the Drowned', {
      key: 'inventory',
      line: 'Legendary. Press {key} to open your inventory.',
      opens: 'Open Inventory',
    }),
  ];
  for (const one of keyed)
    for (const width of [412, 600, 640, 700, 768, 800, 900, 1024, 1152, 1240, 1280, 1366, 1600, 1920]) {
      const height = Math.round(width * 0.6);
      const laid = laidOf(noticeNode(one, { width, height }, 1), width, height);
      const band = laid[0]?.box.height ?? 0;
      const boxes = laid
        .filter((each) => each.node.text)
        .map((each) => ({ words: wordsIn(each.node).join(''), ...each.box }));
      for (const box of boxes) {
        const where = `${width}: “${box.words}” of ${one.title}`;
        assert.ok(box.x >= 0 && box.x + box.width <= width, `${where} inside the view`);
        assert.ok(
          box.y >= 0 && box.y + box.height <= band,
          `${where} inside the band (${box.y + box.height} > ${band})`,
        );
        for (const other of boxes) {
          if (other === box) continue;
          const apart =
            box.x + box.width <= other.x ||
            other.x + other.width <= box.x ||
            box.y + box.height <= other.y ||
            other.y + other.height <= box.y;
          assert.ok(apart, `${where} overlaps “${other.words}”`);
        }
      }
    }
});

test("the far right's hint stands clear of a window's footer, whose presses take the screen's bottom 77 px", () => {
  const keyed = notice("The Armorsmith's gift", {
    key: 'character',
    line: 'Head, torso, arm and leg armour. Press {key} to put it on.',
    opens: 'Open Character',
  });
  // Measured at 1920x1080: the menu's Close stands from y 1003, 77 px over the foot; less at smaller sizes.
  for (const [width, height] of [
    [900, 600],
    [1024, 768],
    [1920, 1080],
    [2560, 1440],
  ] as const) {
    const laid = laidOf(noticeNode(keyed, { width, height }, 1), width, height);
    const band = laid[0]?.box.height ?? 0;
    const hint = laid.filter((each) => wordsIn(each.node).join(' ') === 'Open Character');
    assert.ok(hint.length > 0, `${width}: the hint is laid`);
    for (const each of hint)
      assert.ok(
        each.box.y + each.box.height <= band - 77,
        `${width}: the hint ends ${band - each.box.y - each.box.height} px over the foot`,
      );
  }
});
