import assert from 'node:assert/strict';
import { test } from 'node:test';
import { item, state } from '../network/gearForTests.ts';
import { HORSE, KINDS } from '../player/gear.ts';
import { glyphDrawn } from '../ui/glyphs.ts';
import type { Child, Node } from '../ui/node.ts';
import { QuadList } from '../ui/quads.ts';
import { type Face, widthOf } from '../ui/text.ts';
import { Interface } from '../ui/ui.ts';
import type { UiRenderer } from '../ui/uiRenderer.ts';
import { traitNode } from './gearCard.ts';
import { cardOf, intrinsicOf } from './gearCards.ts';
import { Holds } from './gearHold.ts';
import { INK, sizesOf } from './gearNodes.ts';
import { itemPage } from './itemPage.ts';
import type { MenuContext } from './menuPage.ts';

const reefwall = item({ named: 'the_reefwall', kind: KINDS.indexOf('sword_and_shield'), rarity: 4, attack: 200 });

test('an Atheric names its intrinsic, and no other item has one', () => {
  assert.equal(intrinsicOf(reefwall)?.name, 'Coral Guard');
  assert.match(intrinsicOf(reefwall)?.words ?? '', /15 stamina/);
  assert.equal(intrinsicOf(item({ named: 'harpooner' })), null, "a Legendary's");
  assert.equal(intrinsicOf(item({})), null, 'a rolled piece');
});

const block = glyphDrawn({ rows: ['##', '##'], advance: 600 });
const face: Face = { glyph: () => block };
const renderer = {
  face,
  quads: new QuadList(),
  tileTexels: () => null,
  glyphTexels: () => null,
  picture: () => undefined,
  measure: (words: string, size: number) => widthOf(face, words, size),
} as unknown as UiRenderer;

const context = {
  ui: new Interface(renderer),
  gear: state({}),
  ask: () => {},
  picture: () => null,
  figure: null,
  room: { width: 1180, height: 520 },
  sizes: sizesOf(1280, 720, 1),
  holds: new Holds(() => 0),
  card: () => {},
  inspect: () => {},
  details: () => {},
  atVault: false,
} as unknown as MenuContext;

/** Every text a tree shows, in order, with its colour. */
function textsOf(node: Child): { words: string; colour: string | undefined }[] {
  if (!node) return [];
  const own = node.text
    ? [
        {
          words:
            typeof node.text.words === 'string' ? node.text.words : node.text.words.map((span) => span.words).join(''),
          colour: node.text.colour,
        },
      ]
    : [];
  return [...own, ...(node.children ?? []).flatMap(textsOf)];
}

const own = (chosen: number) => ({
  ...reefwall,
  columns: [{ kind: 4, traits: ['riptide'], xp: 0, aurem: 1000, fragments: 0, essence: 1, resource: 0 }],
  bought: chosen === 0 ? 1 : 0,
  chosen: [chosen],
});

const pageTexts = (shown: ReturnType<typeof own>) => textsOf(itemPage(context, shown, () => {}).page as Node);

test("an Atheric's page shows both its perks at its head, its own node's even before it is chosen", () => {
  const texts = pageTexts(own(255));
  const place = (said: string | RegExp) =>
    texts.findIndex((text) => (typeof said === 'string' ? text.words === said : said.test(text.words)));
  assert.ok(place('ATHERIC') >= 0, 'its heading');
  assert.ok(place('ATHERIC') < place('Coral Guard') && place('Coral Guard') < place('Riptide'), 'the intrinsic first');
  assert.ok(place(/^INTRINSIC: ALWAYS ON$/) > place('Coral Guard'), 'marked always on');
  assert.ok(place('Riptide') < place('NODES'), 'before the nodes');
  assert.equal(texts[place('Riptide')]?.colour, INK.faint, 'dim until it is chosen');
  const chosen = pageTexts(own(0));
  assert.equal(chosen.find((text) => text.words === 'Riptide')?.colour, INK.brassLit, 'lit once chosen');
  assert.equal(chosen.filter((text) => text.words === 'Riptide').length, 1, 'its own node is no perk listed twice');
  assert.ok(!chosen.some((text) => text.words === 'PERKS'));
});

test("an Atheric's card names its intrinsic first", () => {
  assert.equal(cardOf(own(255)).traits[0]?.name, 'Coral Guard');
  assert.equal(cardOf(item({ named: 'harpooner' })).traits.length, 0, "a Legendary's lists only what it gives now");
});

test('a perk that gives and takes sets its cost apart, in the colour of a loss', () => {
  const texts = textsOf(
    traitNode(
      {
        name: 'Hair Trigger',
        words: '',
        kind: 1,
        gives: 'Reloads 25% faster.',
        takes: 'An aimed shot strikes 10% softer.',
      },
      1,
    ),
  );
  assert.deepEqual(
    texts.map((text) => text.words),
    ['Hair Trigger', 'Reloads 25% faster.', 'An aimed shot strikes 10% softer.'],
  );
  assert.equal(texts[2]?.colour, INK.loss);
});

test('two presses of one name on an item’s page, as two like modules to infuse, each have their own id', () => {
  const kept = item({ id: 1, kind: 25, level: 2, at: 0 });
  const twins = [item({ id: 5, kind: 25, level: 5, at: 0 }), item({ id: 6, kind: 25, level: 5, at: 0 })];
  const { presses } = itemPage({ ...context, gear: state({ items: [kept, ...twins] }) }, kept, () => {});
  const ids = presses.map((press) => press.id);
  assert.equal(ids.filter((id) => id?.startsWith('press-Hold to infuse')).length, 2);
  assert.equal(new Set(ids).size, ids.length, ids.join(', '));
});

test("a horse's page names no level, as its card does not: a horse has no stats", () => {
  const horse = item({ id: 7, kind: HORSE, name: 1 });
  assert.ok(!cardOf(horse).rows.some(([label]) => label === 'Level'), 'its card');
  const texts = textsOf(itemPage(context, horse, () => {}).page as Node);
  assert.ok(!texts.some((text) => /^Level /.test(text.words)), 'its page');
});
