import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type FakeElement, findAll, onFakePage } from '../combat/page.test.ts';
import type { GearStanding } from '../network/gearMessages.ts';
import { levelOf, shareWords } from './artLevels.ts';
import { artOf } from './artsCards.ts';
import { type ArtsPageContext, levelBlock, levelPips } from './artsPage.ts';
import type { HoverCard } from './gearDom.ts';

/** The stand-in page with what the Art's screen writes beyond it: attributes, and a canvas's picture. */
function onPage<Result>(run: () => Result): Result {
  return onFakePage(() => {
    const holder = globalThis as unknown as { document: { createElement: (tag: string) => FakeElement } };
    const made = holder.document.createElement;
    holder.document.createElement = (tag) =>
      Object.assign(made(tag), {
        attributes: {} as Record<string, string>,
        setAttribute(this: { attributes: Record<string, string> }, name: string, value: string) {
          this.attributes[name] = value;
        },
        toDataURL: () => 'data:,',
      });
    return run();
  });
}

const attributes = (node: FakeElement): Record<string, string> =>
  (node as unknown as { attributes: Record<string, string> }).attributes;
const standing = (level: number, earned: number): GearStanding => ({
  pledge: 0,
  reputation: [0, 0, 0],
  packages: [0, 0, 0],
  artLevels: [level, 1, 1],
  artXp: [earned, 0, 0],
  artOwned: [0, 0, 0],
});
const context = (shown: GearStanding): ArtsPageContext => ({
  worn: 1,
  cores: {},
  standing: shown,
  ask: () => undefined,
  tip: { over: () => undefined, hide: () => undefined } as unknown as HoverCard,
  close: () => undefined,
});

test('the pips light up to the level and say it aloud', () => {
  onPage(() => {
    for (const level of [1, 3, 5]) {
      const pips = levelPips(level) as unknown as FakeElement;
      assert.equal(pips.children.length, 5);
      assert.equal(findAll(pips as unknown as HTMLElement, 'arts-pip-lit').length, level);
      assert.equal(attributes(pips)['aria-label'], `Level ${level}`);
    }
  });
});

test('the bar is empty at level 1, part full, full and ready to rise, and full at level 5, with its share', () => {
  const storm = artOf(1);
  assert.ok(storm);
  const cases: [GearStanding, string, string, string][] = [
    [standing(1, 0), '0%', '0 of 8,000', 'Spells at 60%'],
    [standing(2, 4000), '25%', '4,000 of 16,000', 'Spells at 70%'],
    [standing(1, 8000), '100%', "Ready to rise at the Stormcallers' counter", 'Spells at 60%'],
    [standing(5, 0), '100%', 'Highest level', 'Spells at 100%'],
  ];
  for (const [shown, , , share] of cases) assert.equal(shareWords(levelOf(shown, 1).level), share);
  onPage(() => {
    for (const [shown, width, words] of cases) {
      const block = levelBlock(context(shown), storm, levelOf(shown, 1));
      const [fill] = findAll(block, 'arts-bar-fill');
      const [bar] = findAll(block, 'arts-bar');
      assert.ok(fill && bar);
      assert.equal(fill.style['width'], width, words);
      assert.equal(findAll(block, 'arts-bar-words')[0]?.textContent, words);
      assert.equal(attributes(bar)['aria-valuetext'], words);
      assert.equal(attributes(findAll(block, 'arts-faction')[0] as FakeElement)['aria-label'], 'Stormcallers');
    }
  });
});
