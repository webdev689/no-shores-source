import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AccountLink, GuildFace, KeptPlot, OutpostsFace, Roster } from '../../network/accounts.ts';
import { ASKS, type GearAsk } from '../../network/gearMessages.ts';
import { drawn } from '../menuForTests.ts';
import { edgeId } from './guildHome.ts';
import { GuildPage, guildPage } from './guildPage.ts';
import { RAISE_AUREM } from './outpostLaw.ts';
import { cellId, kindId } from './outpostPlan.ts';
import { COLLECT_ID, RAISE_ID, deliverId, outpostTabId, takeId } from './outpostsView.ts';
import { DEPOSIT_FIELD, DEPOSIT_ID, agoWords, ledgerWords } from './treasuryView.ts';

Object.assign(globalThis, { dispatchEvent: () => true });
const settle = () => new Promise((done) => setTimeout(done, 0));
const NOW = Date.UTC(2026, 10, 21, 12);
const SITE = 'gull-cove-outpost';

const face = (rank: number): GuildFace => ({
  name: 'Salt Kings',
  tag: 'SALT',
  motto: '',
  description: '',
  banner: {},
  rank,
  members: 2,
  level: 4,
  xp: 90_000,
  levelXp: 80_000,
  nextXp: 140_000,
  week: 2_916,
  weekEnds: NOW + 86_400_000,
});

const structure = (id: number, kind: string, x: number, y: number, tier = 1, building = 0) => ({
  id,
  kind,
  tier,
  building,
  x,
  y,
  turn: 0,
  spent: 0,
  delivered: {},
});

const PLOT: KeptPlot = {
  structures: [
    structure(1, 'hall', 6, 6, 2),
    structure(2, 'standard', 7, 11),
    structure(3, 'counting', 0, 0),
    { ...structure(4, 'camp', 12, 0, 0, 1), delivered: { timber: 10 } },
  ],
  decor: [],
};

const outposts = (more: Partial<OutpostsFace> = {}): OutpostsFace => ({
  treasury: 12_000,
  ledger: [
    { kind: 'deposit', amount: 500, balance: 12_000, at: NOW - 2 * 3_600_000, name: 'Ada' },
    { kind: 'build camp', amount: -2_000, balance: 11_500, at: NOW - 30 * 3_600_000, name: 'Ben' },
  ],
  allowed: 2,
  at: SITE,
  outposts: [
    {
      site: SITE,
      room: `node-${SITE}--guild-0a1b2c3d`,
      raisedAt: NOW,
      plot: PLOT,
      strongbox: 240,
      stores: { iron: 16 },
      here: true,
    },
  ],
  ...more,
});

/** The Guild tab over a fake of the accounts, opened at its Outposts or Treasury page. */
async function opened(rank: number, held: OutpostsFace, page: 'outposts' | 'treasury' = 'outposts') {
  const asked: string[] = [];
  const link = {
    guild: async () => ({ guild: face(rank) }),
    roster: async () => ({ guild: null }) as unknown as Roster,
    outposts: async () => held,
    social: async (path: string, body: Record<string, unknown>) => {
      asked.push(`${path} ${JSON.stringify(body)}`);
      return null;
    },
  };
  const here = { ask: (ask: GearAsk) => void asked.push(`room ${JSON.stringify(ask)}`) };
  const guild = new GuildPage({ link: link as unknown as AccountLink, here: () => here, now: () => NOW });
  const drawing = drawn((context) => guildPage(context, guild));
  await settle();
  drawing.frame();
  drawing.click(edgeId(page));
  return { ...drawing, asked };
}

test("the Outposts page shows each outpost's plan, strongbox and stores, and a member there empties and takes", async () => {
  const { shows, click, asked } = await opened(2, outposts());
  for (const part of ['OUTPOSTS', 'Gull Cove · here', '240 / 1,440 Aurem · 30 an hour', 'Iron 16'])
    assert.ok(shows().includes(part), `shows ${part}`);
  click(COLLECT_ID);
  click(takeId('iron'));
  await settle();
  assert.deepEqual(asked, [
    `outpost/collect ${JSON.stringify({ site: SITE })}`,
    `room ${JSON.stringify({ kind: ASKS.outpostTake, slot: 2, count: 16 })}`,
  ]);
});

test('a founder there places a structure on free cells and the room is told; on the hall the law refuses it', async () => {
  const { click, ui, shows, asked } = await opened(0, outposts());
  click(kindId('war-table'));
  click(cellId(6, 6));
  assert.ok(shows().includes('Something already stands there.'), "the law's own words");
  assert.deepEqual(asked, []);
  click(cellId(0, 4));
  await settle();
  assert.deepEqual(asked, [
    `outpost/place ${JSON.stringify({ site: SITE, kind: 'war-table', x: 0, y: 4, turn: 0 })}`,
    `room ${JSON.stringify({ kind: ASKS.outpostChanged })}`,
  ]);
  assert.equal(ui.boxOf(kindId('lodge')), null, 'the Lodge opens at level 5');
  assert.ok(shows().includes("Captain's Lodge at level 5"));
});

test('a structure being built shows what it still needs, and a member delivers it through the room', async () => {
  const { click, shows, asked } = await opened(2, outposts());
  click(cellId(12, 0));
  assert.ok(shows().includes('Timber 10 / 40'), `shows its timber: ${shows()}`);
  click(deliverId('timber'));
  assert.deepEqual(asked, [`room ${JSON.stringify({ kind: ASKS.outpostDeliver, item: 4, slot: 0, count: 30 })}`]);
});

test('a member away from the outpost sees its plan but no press to build, deliver or collect', async () => {
  const away = outposts({ at: null, outposts: outposts().outposts.map((outpost) => ({ ...outpost, here: false })) });
  const { ui, shows } = await opened(0, away);
  assert.equal(ui.boxOf(kindId('war-table')), null);
  assert.equal(ui.boxOf(COLLECT_ID), null);
  assert.ok(shows().includes('Stand at the outpost to build, deliver or collect.'));
});

test('standing at a site the guild has not raised, a founder raises an outpost there for its Aurem', async () => {
  const { click, shows, asked } = await opened(0, outposts({ at: 'salt-hythe-outpost' }));
  click(outpostTabId('salt-hythe-outpost'));
  assert.ok(shows().includes('Salt Hythe is unclaimed by your guild.'));
  click(RAISE_ID);
  await settle();
  assert.deepEqual(asked, [
    `outpost/raise ${JSON.stringify({ site: 'salt-hythe-outpost', turn: 0 })}`,
    `room ${JSON.stringify({ kind: ASKS.outpostChanged })}`,
  ]);
  const poor = await opened(0, outposts({ at: 'salt-hythe-outpost', treasury: RAISE_AUREM - 1 }));
  poor.click(outpostTabId('salt-hythe-outpost'));
  assert.ok(poor.shows().includes('The treasury holds 4,999 Aurem.'));
});

test('the Treasury page reads the ledger in words, and a member at an outpost puts Aurem in through the room', async () => {
  const { shows, type, click, asked } = await opened(2, outposts(), 'treasury');
  for (const part of [
    '12,000 Aurem',
    'Ada: Put Aurem in',
    '+500',
    'Ben: Built the Island Camp',
    '−2,000',
    '2 hours ago',
  ])
    assert.ok(shows().includes(part), `shows ${part}`);
  type(DEPOSIT_FIELD, '750');
  click(DEPOSIT_ID);
  assert.deepEqual(asked, [`room ${JSON.stringify({ kind: ASKS.outpostDeposit, count: 750 })}`]);
});

test('ledger lines and times read plainly', () => {
  assert.equal(ledgerWords('take down counting'), 'Took down the Counting House');
  assert.equal(ledgerWords('raise hall'), 'Raised the Hall a tier');
  assert.equal(ledgerWords('raise'), 'Raised an outpost');
  assert.equal(ledgerWords('decorate well'), 'Set a Well');
  assert.equal(agoWords(NOW, NOW - 50 * 3_600_000), '2 days ago');
});
