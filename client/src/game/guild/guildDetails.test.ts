import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GuildFace, Roster } from '../../network/accounts.ts';
import type { Child } from '../../ui/node.ts';
import { drawn } from '../menuForTests.ts';
import { bannerOfName } from './bannerLaw.ts';
import { DETAILS_BACK_ID, FIELDS, FOUND_ID, detailsNode, foundNode } from './guildDetails.ts';

const FACE: GuildFace = {
  name: 'Salt Kings',
  tag: 'SALT',
  motto: 'No tithe, no master.',
  description: 'We sail from Overlook.',
  banner: {},
  rank: 0,
  members: 3,
  level: 2,
  xp: 20_000,
  levelXp: 15_000,
  nextXp: 40_000,
  week: 2_916,
  weekEnds: 0,
};

const INVITES = {
  guildInvites: [
    { name: 'Salt Kings', tag: 'SALT', from: 'Ada' },
    { name: 'Brine Wolves', tag: 'BW', from: 'Ben' },
  ],
} as unknown as Roster;

/** The founding page drawn alone, keeping what it asks. */
function founding() {
  const asked: string[] = [];
  const page = drawn((context) =>
    foundNode(
      context,
      INVITES,
      bannerOfName('Guild'),
      (path) => asked.push(path),
      () => undefined,
    ),
  );
  page.frame();
  return { ...page, asked };
}

/** The details page drawn alone, keeping what it asks and how often it went back. */
function details(face: GuildFace = FACE) {
  const asked: string[] = [];
  const went = { back: 0 };
  const page = drawn((context) =>
    detailsNode(
      context,
      face,
      context.holds,
      (path) => asked.push(path),
      () => (went.back += 1),
    ),
  );
  page.frame();
  page.frame();
  return { ...page, asked, went };
}

/** How many presses of a role a tree holds. */
const rolesIn = (node: Child, role: string): number =>
  !node
    ? 0
    : Number(node.press === true && node.role === role) +
      (node.children ?? []).reduce((sum: number, child) => sum + rolesIn(child, role), 0);

test('founding with no name or tag greys "Found the guild" and says why; with both it founds', () => {
  const { click, type, shows, asked } = founding();
  assert.ok(shows().includes('Found the guild'), shows());
  assert.ok(shows().includes('Give the guild a name and a tag first.'), shows());
  click(FOUND_ID);
  assert.deepEqual(asked, [], 'nothing is asked with the fields empty');
  type(FIELDS.name[0], 'Brine Wolves');
  type(FIELDS.tag[0], 'BW');
  click(FOUND_ID);
  assert.deepEqual(asked, ['guild/found']);
});

test('the founding page has one primary press, the founding, whatever invites wait', () => {
  let count = 0;
  const page = drawn((context) => {
    const node = foundNode(
      context,
      INVITES,
      bannerOfName('Guild'),
      () => undefined,
      () => undefined,
    );
    count = rolesIn(node, 'primary');
    return node;
  });
  page.frame();
  assert.equal(count, 1);
});

test('the details start from the motto and description the guild has, the description read whole with its count', () => {
  const { ui, shows } = details();
  assert.equal(ui.fieldText(FIELDS.motto[0]), FACE.motto);
  assert.equal(ui.fieldText(FIELDS.description[0]), FACE.description);
  assert.ok(shows().includes(`${FACE.description.length} / 300`), shows());
});

test("the details' fields end at one edge, their presses one width", () => {
  const { ui } = details();
  const fields = (['motto', 'description', 'invite'] as const).map((field) => ui.boxOf(FIELDS[field][0]));
  const ends = new Set(fields.map((box) => box && box.x + box.width));
  assert.equal(ends.size, 1, `the fields end at ${[...ends].join(', ')}`);
});

test('the details have a Back press, as the banner editor has', () => {
  const { click, went } = details();
  click(DETAILS_BACK_ID);
  assert.equal(went.back, 1);
});

test('a member reads the motto and description, with a placeholder for none', () => {
  const { shows } = details({ ...FACE, rank: 2, motto: '' });
  assert.ok(shows().includes('No motto yet.'), shows());
  assert.ok(shows().includes(FACE.description));
});

test("the fields' placeholders count characters, as the accounts do", () => {
  const placeholders: string[] = [];
  const walk = (node: Child): void => {
    if (!node) return;
    if (node.field?.placeholder) placeholders.push(node.field.placeholder);
    for (const child of node.children ?? []) walk(child);
  };
  const page = drawn((context) => {
    const node = detailsNode(context, FACE, context.holds, () => undefined);
    walk(node);
    return node;
  });
  page.frame();
  assert.ok(
    placeholders.length > 0 && placeholders.every((said) => said.endsWith('characters at most')),
    placeholders.join(' | '),
  );
});
