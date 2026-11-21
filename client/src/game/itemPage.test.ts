import assert from 'node:assert/strict';
import { test } from 'node:test';
import { item, state } from '../network/gearForTests.ts';
import { KINDS } from '../player/gear.ts';
import { cardOf, intrinsicOf } from './gearCards.ts';
import { traitNode } from './gearDom.ts';
import { itemPage } from './itemPage.ts';
import { type FakeElement, fakePage } from './pageForTests.ts';

const reefwall = item({ named: 'the_reefwall', kind: KINDS.indexOf('sword_and_shield'), rarity: 4, attack: 200 });

test('an Atheric names its intrinsic, and no other item has one', () => {
  assert.equal(intrinsicOf(reefwall)?.name, 'Coral Guard');
  assert.match(intrinsicOf(reefwall)?.words ?? '', /15 stamina/);
  assert.equal(intrinsicOf(item({ named: 'harpooner' })), null, "a Legendary's");
  assert.equal(intrinsicOf(item({})), null, 'a rolled piece');
});

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

/** The page's left column's nodes, laid as the page lays them. */
function leftOf(shown: typeof reefwall): FakeElement {
  fakePage();
  const { page } = itemPage(context as never, shown, () => {});
  const left = (page as unknown as FakeElement).all().find((node) => node.className === 'gear-item-left');
  assert.ok(left);
  return left;
}

const own = (chosen: number) => ({
  ...reefwall,
  columns: [{ kind: 4, traits: ['riptide'], xp: 0, aurem: 1000, fragments: 0, essence: 1, resource: 0 }],
  bought: chosen === 0 ? 1 : 0,
  chosen: [chosen],
});

test("an Atheric's page shows both its perks at its head, its own node's even before it is chosen", () => {
  const left = leftOf(own(255));
  const [heading, intrinsic, riptide] = left.children;
  assert.equal(heading?.textContent, 'Atheric');
  assert.match(intrinsic?.textContent ?? '', /^Coral Guard.*Intrinsic: always on/);
  assert.match(riptide?.textContent ?? '', /^Riptide.*not yet chosen/);
  assert.match(riptide?.className ?? '', /gear-trait-off/, 'dim until it is chosen');
  const headings = left.children.filter((node) => node.tagName === 'H3').map((node) => node.textContent);
  assert.equal(headings[0], 'Atheric', 'first, before the perks and the nodes');
  const chosen = leftOf(own(0));
  assert.doesNotMatch(chosen.children[2]?.className ?? '', /gear-trait-off/);
  const perks = chosen.children.filter((node) => node.tagName === 'H3').map((node) => node.textContent);
  assert.ok(!perks.includes('Perks'), 'its own node is no perk listed twice');
});

test("an Atheric's card names its intrinsic first", () => {
  assert.equal(cardOf(own(255)).traits[0]?.name, 'Coral Guard');
  assert.equal(cardOf(item({ named: 'harpooner' })).traits.length, 0, "a Legendary's lists only what it gives now");
});

test('a perk that gives and takes sets its cost apart', () => {
  fakePage();
  const line = traitNode({
    name: 'Hair Trigger',
    words: '',
    kind: 1,
    gives: 'Reloads 25% faster.',
    takes: 'An aimed shot strikes 10% softer.',
  }) as unknown as FakeElement;
  const cost = line.all().find((node) => node.className === 'gear-trait-takes');
  assert.equal(cost?.textContent, 'An aimed shot strikes 10% softer.');
  assert.ok(line.textContent?.includes('Reloads 25% faster.'));
});
