import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AccountLink, GuildFace, KeptPlot, OutpostsFace, Roster } from '../../network/accounts.ts';
import { ASKS, type GearAsk, type GearState } from '../../network/gearMessages.ts';
import { answerText } from '../../player/gear.ts';
import { drawn } from '../menuForTests.ts';
import { edgeId } from './guildHome.ts';
import { AGAIN_ID, GuildPage, guildPage } from './guildPage.ts';
import { bountiesNode } from './guildWeek.ts';
import { TREASURY_MOST } from './outpostLaw.ts';
import { BLUEPRINT, DARK_INK, LOOKS, PLAN_ID, blockWords, cellId, kindId } from './outpostPlan.ts';
import {
  ABANDON_ID,
  AWAY_WORDS,
  COLLECT_ID,
  HORN_ID,
  REMOVE_ID,
  RISE_ID,
  deliverId,
  outpostTabId,
  takeId,
} from './outpostsView.ts';
import { DEPOSIT_FIELD, DEPOSIT_ID, ledgerWords } from './treasuryView.ts';

Object.assign(globalThis, { dispatchEvent: () => true });
/** What was laid with an id last frame. */
const nodeOf = (ui: { laid: readonly { node: { id?: string } }[] }, id: string) =>
  ui.laid.find((laid) => laid.node.id === id)?.node as
    { label?: string; disabled?: boolean; role?: string } | undefined;
const settle = () => new Promise((done) => setTimeout(done, 0));
const SITE = 'gull-cove-outpost';
const OTHER = 'salt-hythe-outpost';

const face = (rank = 0): GuildFace => ({
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
  weekEnds: 9e15,
});
const structure = (id: number, kind: string, x: number, y: number, tier = 1, building = 0, spent = 0) => ({
  id,
  kind,
  tier,
  building,
  x,
  y,
  turn: 0,
  spent,
  delivered: {},
});
const PLOT: KeptPlot = {
  structures: [structure(1, 'hall', 6, 6), structure(2, 'standard', 7, 11), structure(3, 'counting', 0, 0, 1, 0, 3000)],
  decor: [],
};
const held = (here: boolean, more: Partial<OutpostsFace> = {}, plot: KeptPlot = PLOT): OutpostsFace => ({
  treasury: 12_000,
  ledger: [],
  allowed: 2,
  at: here ? SITE : null,
  outposts: [{ site: SITE, room: 'r', raisedAt: 0, strongbox: 240, stores: { iron: 9 }, here, plot }],
  ...more,
});

/** The Guild tab over a fake of the accounts whose outposts answer from `answers` in turn, the last kept; the first
 *  answers both the tab's first read and the Outposts press's. */
async function page(answers: (OutpostsFace | string)[], rank = 0, gear?: GearState | null) {
  let now = 0;
  let reads = 0;
  const asked: string[] = [];
  const link = {
    guild: async () => ({ guild: face(rank) }),
    roster: async () => ({ guild: null }) as unknown as Roster,
    outposts: async () => answers[Math.min(Math.max(0, reads++ - 1), answers.length - 1)],
    social: async (path: string) => (asked.push(path), null),
  } as unknown as AccountLink;
  const room = { ask: (ask: GearAsk) => void asked.push(`room ${ask.kind}`), ...(gear !== undefined && { gear }) };
  const guild = new GuildPage({ link, here: () => room, now: () => now });
  const drawing = drawn((context) => guildPage(context, guild));
  await settle();
  drawing.frame();
  drawing.click(edgeId('outposts'));
  return { guild, ...drawing, asked, reads: () => reads, later: (millis: number) => (now += millis) };
}

test('the Outposts page reads again every 15 s while it is seen, and on open; a failed read offers Try again', async () => {
  const away = await page([held(false), held(true)]);
  assert.ok(away.shows().includes(AWAY_WORDS));
  away.later(15_000);
  away.frame();
  await settle();
  assert.equal(away.reads(), 3, 'read again on the Outposts page');
  away.guild.open('outposts', { site: SITE, structure: 3 });
  await settle();
  away.frame();
  assert.equal(away.reads(), 4, 'opening it reads');
  assert.notEqual(away.ui.boxOf(COLLECT_ID), null, 'the Counting House shows its own Empty press');
  const failed = await page(['Too many asks. Wait a while.', held(true)]);
  assert.ok(failed.shows().includes('Too many asks. Wait a while.'), failed.shows());
  failed.click(AGAIN_ID);
  await settle();
  failed.frame();
  assert.notEqual(failed.ui.boxOf(COLLECT_ID), null);
});

test("a structure's own panel holds its presses: Take at a Camp, Sound at a horn, or that it has sounded", async () => {
  const plot = {
    structures: [...PLOT.structures, structure(4, 'camp', 12, 0), structure(5, 'horn', 0, 12)],
    decor: [],
  };
  const camp = await page([held(true, {}, plot)]);
  camp.click(cellId(12, 0));
  assert.ok(camp.shows().includes('Take 9'), camp.shows());
  assert.equal(nodeOf(camp.ui, takeId('iron'))?.label, 'Take 9 Iron', 'the press names its material');
  camp.click(cellId(0, 12));
  assert.notEqual(camp.ui.boxOf(HORN_ID), null);
  const sounded = await page([held(true, { hornSounded: true }, plot)]);
  sounded.click(cellId(0, 12));
  assert.equal(sounded.ui.boxOf(HORN_ID), null);
  assert.ok(sounded.shows().includes('Sounded this week'));
});

test('a strongbox left after its Counting House is taken down still shows and empties, saying what stays', async () => {
  const bare = { structures: PLOT.structures.slice(0, 2), decor: [] };
  const { shows, click, asked, frame } = await page([held(true, { treasury: TREASURY_MOST - 100 }, bare)]);
  assert.ok(shows().includes('240 Aurem, with no Counting House to fill it more'), shows());
  click(COLLECT_ID);
  await settle();
  assert.deepEqual(asked, ['outpost/collect']);
  frame();
  assert.ok(shows().includes('100 Aurem went into the treasury. 140 stays in the strongbox'), shows());
});

test('the page weighs the treasury: a red ghost and no ask at 0 Aurem, a greyed rise, the hold saying what comes back', async () => {
  const poor = await page([held(true, { treasury: 0 })]);
  poor.click(kindId('war-table'));
  poor.click(cellId(0, 4));
  await settle();
  assert.deepEqual(poor.asked, []);
  assert.ok(poor.shows().includes('The treasury lacks the 4,000 Aurem the War Table takes.'), poor.shows());
  poor.click(kindId('war-table'));
  poor.click(cellId(6, 6));
  assert.equal(nodeOf(poor.ui, RISE_ID)?.disabled, true);
  assert.ok(poor.shows().includes('The treasury lacks the 15,000 Aurem that tier takes.'), poor.shows());
  const full = await page([held(true, { treasury: TREASURY_MOST - 1000 })]);
  full.click(cellId(0, 0));
  assert.ok(full.shows().includes('Hold to take it down (1,000 Aurem back)'), full.shows());
  full.guild.back();
  full.frame();
  assert.ok(full.shows().includes('Hold to abandon this outpost (1,000 Aurem back)'), full.shows());
  assert.notEqual(full.ui.boxOf(ABANDON_ID), null);
  assert.equal(REMOVE_ID, 'outpost-remove');
});

test('abandoning from away asks only the accounts, never the room the player stands in', async () => {
  const { asked, ui, frame } = await page([held(false)]);
  const box = ui.boxOf(ABANDON_ID);
  assert.ok(box);
  const point = { x: box.x + 4, y: box.y + 4 };
  frame([
    { kind: 'pointer', ...point },
    { kind: 'down', ...point, button: 0 },
  ]);
  for (let step = 0; step < 200; step++) frame([], 1 / 30);
  await settle();
  assert.deepEqual(asked, ['outpost/abandon']);
});

test('by keys the plan is one Tab stop, its arrows move a cursor that shows the ghost and the law, and Enter places', async () => {
  const { ui, frame, click, shows, asked } = await page([held(true)]);
  click(kindId('war-table'));
  ui.focusOn(PLAN_ID);
  frame([{ kind: 'key', key: 'tab' }]);
  frame([{ kind: 'key', key: 'tab', shift: true }]);
  assert.equal(ui.focusedId, PLAN_ID);
  frame([{ kind: 'key', key: 'arrowleft' }]);
  frame();
  assert.ok(shows().includes('Something already stands there.'), shows());
  for (let step = 0; step < 7; step++) frame([{ kind: 'key', key: 'arrowleft' }]);
  for (let step = 0; step < 4; step++) frame([{ kind: 'key', key: 'arrowup' }]);
  frame([{ kind: 'key', key: 'enter' }]);
  await settle();
  assert.deepEqual(asked, ['outpost/place', `room ${ASKS.outpostChanged}`]);
  ui.focusOn(PLAN_ID);
  frame();
  let tabs = 0;
  while (ui.focusedId !== kindId('standard') && ui.focusedId !== kindId('war-table') && tabs < 40) {
    frame([{ kind: 'key', key: 'tab' }]);
    tabs++;
  }
  assert.ok(tabs < 10, `Tabs from the plan to the first Build press: ${tabs}`);
});

test('after a click on the plan, the arrows move the ghost, and Enter places where the cursor stands', async () => {
  const { frame, click, shows, asked } = await page([held(true)]);
  click(kindId('war-table'));
  click(cellId(0, 4));
  await settle();
  asked.length = 0;
  click(kindId('war-table'));
  click(cellId(6, 6));
  assert.ok(shows().includes('Something already stands there.'));
  for (let step = 0; step < 6; step++) frame([{ kind: 'key', key: 'arrowleft' }]);
  frame();
  assert.ok(!shows().includes('Something already stands there.'), shows());
  frame([{ kind: 'key', key: 'enter' }]);
  await settle();
  assert.deepEqual(asked, ['outpost/place', `room ${ASKS.outpostChanged}`]);
});

test('a refused read again keeps the outposts last heard on the page', async () => {
  const drawing = await page([held(true), 'Too many asks. Wait a while.']);
  drawing.later(15_000);
  drawing.frame();
  await settle();
  drawing.frame();
  assert.notEqual(drawing.ui.boxOf(COLLECT_ID), null, drawing.shows());
});

test('the Outposts page opens on the outpost the player stands at', async () => {
  const two = (stood: string | null): OutpostsFace => ({
    ...held(false),
    at: stood,
    outposts: [
      { ...(held(false).outposts[0] as OutpostsFace['outposts'][number]) },
      { ...(held(false).outposts[0] as OutpostsFace['outposts'][number]), site: OTHER, here: stood === OTHER },
    ],
  });
  const drawing = await page([two(null), two(OTHER)]);
  assert.ok(drawing.shows().includes(AWAY_WORDS));
  drawing.guild.open('outposts');
  await settle();
  drawing.frame();
  assert.equal(nodeOf(drawing.ui, outpostTabId(OTHER))?.role, 'primary', 'the site stood at is shown');
});

test('Deliver names its material, and is greyed with a reason when the player carries none', async () => {
  const plot = { structures: [...PLOT.structures, { ...structure(4, 'camp', 12, 0, 0, 1) }], decor: [] };
  const gear = { ship: { stocks: [0, 5, 0, 0] }, resources: [] } as unknown as GearState;
  const { click, ui, shows, asked } = await page([held(true, {}, plot)], 2, gear);
  click(cellId(12, 0));
  assert.equal(nodeOf(ui, deliverId('timber'))?.disabled, true);
  assert.ok(shows().includes('Timber 0 / 40 · you carry none'), shows());
  assert.equal(nodeOf(ui, deliverId('canvas'))?.label, 'Deliver Canvas');
  click(deliverId('timber'));
  assert.deepEqual(asked, []);
});

test('away from the outpost a structure being built says its materials are delivered there', async () => {
  const plot = { structures: [...PLOT.structures, { ...structure(4, 'camp', 12, 0, 0, 1) }], decor: [] };
  const { click, shows } = await page([held(false, {}, plot)]);
  click(cellId(12, 0));
  assert.ok(shows().includes('Building tier 1: its materials are delivered at the outpost.'), shows());
});

test('at sea no claim press shows, since no room there answers one', async () => {
  const bounty = {
    name: 'Sink',
    words: 'Sink ships',
    count: 5,
    target: 5,
    done: true,
    claimed: false,
    together: false,
  };
  const drawing = drawn((context) =>
    bountiesNode(context.ui, { ...face(), bounties: [bounty] }, 1, () => undefined, true),
  );
  drawing.frame();
  assert.ok(!drawing.shows().includes('Claim |'), drawing.shows());
  assert.ok(drawing.shows().includes('Claim a done bounty ashore.'));
});

test('the plan draws above the menu window that holds it, and its blocks say their tier at every size', async () => {
  const drawing = await page([held(true)]);
  const inMenu = drawn((context) => ({
    float: { to: 'screen', z: 20 },
    children: [guildPage(context, drawing.guild)],
  }));
  inMenu.frame();
  inMenu.frame();
  const hall = inMenu.ui.laid.find((laid) => laid.node.float && laid.node.fill === LOOKS['hall']?.[0]);
  assert.ok(hall && hall.z > 20, `the hall block at z ${hall?.z}`);
  const stronghold = structure(1, 'hall', 6, 6, 3);
  for (const room of [40, 80, 200]) assert.match(blockWords(stronghold, room), /3/, `at ${room} px`);
});

test('every word on a plan block is at least 4.5:1 against its block', () => {
  const lum = (hex: string) => {
    const [red, green, blue] = [1, 3, 5].map((place) => {
      const value = Number.parseInt(hex.slice(place, place + 2), 16) / 255;
      return value <= 0.039_28 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * (red ?? 0) + 0.7152 * (green ?? 0) + 0.0722 * (blue ?? 0);
  };
  const ratio = (one: string, two: string) => {
    const [high, low] = [lum(one), lum(two)].sort((first, second) => second - first);
    return ((high ?? 0) + 0.05) / ((low ?? 0) + 0.05);
  };
  for (const [kind, [colour]] of Object.entries(LOOKS)) {
    assert.ok(ratio(colour, DARK_INK) >= 4.5, `${kind} dark ink ${ratio(colour, DARK_INK)}`);
    assert.ok(ratio(colour, BLUEPRINT) >= 4.5, `${kind} blueprint ${ratio(colour, BLUEPRINT)}`);
  }
});

test("the ledger and the deposit speak in the world's words", async () => {
  assert.equal(ledgerWords('decorate well'), 'Placed the Well');
  assert.equal(ledgerWords('take down well'), 'Took up the Well');
  assert.equal(ledgerWords('raise hall'), "Began the Hall's next tier");
  assert.equal(answerText(157), 'The treasury cannot hold that much.');
  assert.equal(answerText(156), "Do that at your guild's outpost.");
  const { type, click, shows, asked, guild, frame } = await page([held(true, { treasury: TREASURY_MOST - 500 })]);
  guild.open('treasury');
  await settle();
  frame();
  type(DEPOSIT_FIELD, '750');
  click(DEPOSIT_ID);
  assert.ok(shows().includes('The treasury holds at most 1,000,000 Aurem: put in 500 or less.'), shows());
  assert.deepEqual(asked, []);
});
