import assert from 'node:assert/strict';
import { test } from 'node:test';
import { item, state } from '../network/gearForTests.ts';
import { KINDS } from '../player/gear.ts';
import { intrinsicOf, itemPage } from './itemPage.ts';
import { type FakeElement, fakePage } from './pageForTests.ts';

const reefwall = item({ named: 'the_reefwall', kind: KINDS.indexOf('sword_and_shield'), rarity: 4, attack: 200 });

test('an Atheric names its intrinsic, and no other item has one', () => {
  assert.equal(intrinsicOf(reefwall)?.name, 'Coral Guard');
  assert.match(intrinsicOf(reefwall)?.words ?? '', /15 stamina/);
  assert.equal(intrinsicOf(item({ named: 'harpooner' })), null, "a Legendary's");
  assert.equal(intrinsicOf(item({})), null, 'a rolled piece');
});

test("an Atheric's page shows its intrinsic at its head, under its own heading, apart from its nodes and perks", () => {
  fakePage();
  const context = {
    gear: state({}),
    ask: () => {},
    tip: { over: () => {}, hide: () => {} },
    picture: () => null,
    figure: null,
    room: 600,
    inspect: () => {},
    atVault: false,
  };
  const { page } = itemPage(context as never, reefwall, () => {});
  const left = (page as unknown as FakeElement).all().find((node) => node.className === 'gear-item-left');
  assert.ok(left);
  const [heading, trait] = left.children;
  assert.equal(heading?.textContent, 'Intrinsic');
  assert.match(trait?.textContent ?? '', /^Coral Guard/);
  const headings = left.children.filter((node) => node.tagName === 'H3').map((node) => node.textContent);
  assert.equal(headings[0], 'Intrinsic', 'first, before the perks and the nodes');
  assert.equal(headings.filter((text) => text === 'Intrinsic').length, 1);
});
