import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AccountLink, GuildFace, KeptPlot, OutpostsFace, Roster } from '../../network/accounts.ts';
import type { Node } from '../../ui/node.ts';
import { sizesOf } from '../gearNodes.ts';
import type { PlainContext } from '../menuPage.ts';
import { drawn } from '../menuForTests.ts';
import { edgeId } from './guildHome.ts';
import { GuildPage, guildPage } from './guildPage.ts';
import { LOOKS } from './outpostPlan.ts';

Object.assign(globalThis, { dispatchEvent: () => true });
const settle = () => new Promise((done) => setTimeout(done, 0));
const SITE = 'gull-cove-outpost';

const FACE = {
  ...{ name: 'Salt Kings', tag: 'SALT', motto: '', description: '', banner: {}, rank: 0, members: 2 },
  ...{ level: 10, xp: 900_000, levelXp: 800_000, nextXp: null, week: 2_916, weekEnds: 9e15 },
} as unknown as GuildFace;
const structure = (id: number, kind: string, x: number, y: number, tier = 1, building = 0, spent = 0) => ({
  ...{ id, kind, tier, building, x, y, turn: 0, spent, delivered: {} },
});
const PLOT: KeptPlot = {
  structures: [
    structure(1, 'hall', 6, 0, 3),
    structure(2, 'standard', 7, 11),
    structure(3, 'counting', 0, 0, 1, 0, 3000),
    structure(4, 'horn', 12, 0, 1),
    structure(5, 'camp', 0, 12, 1),
  ],
  decor: [],
};
const OUTPOSTS = (here = true): OutpostsFace => ({
  treasury: 12_000,
  ledger: [],
  allowed: 3,
  at: here ? SITE : null,
  outposts: [{ site: SITE, room: 'r', raisedAt: 0, strongbox: 240, stores: { iron: 9, timber: 20 }, here, plot: PLOT }],
});

type Laid = {
  node: Node & { text?: { words: string } };
  box: { x: number; y: number; width: number; height: number };
  clip: { x: number; y: number; width: number; height: number };
};

/** The Guild tab drawn inside `body`, its Outposts page open; the view's size gives the menu's sizes. */
async function opened(
  room: { width: number; height: number },
  view: [number, number] = [1280, 720],
  outposts = OUTPOSTS(),
  wrap: (page: Node) => Node = (page) => page,
) {
  const link = {
    guild: async () => ({ guild: FACE }),
    roster: async () => ({ guild: null }) as unknown as Roster,
    outposts: async () => outposts,
    social: async () => null,
  } as unknown as AccountLink;
  const guild = new GuildPage({ link, here: () => ({ ask: () => undefined }), now: () => 0 });
  const sizes = sizesOf(view[0], view[1], 1);
  const page = drawn((context: PlainContext) => wrap(guildPage({ ...context, sizes }, guild)), room);
  await settle();
  page.frame();
  page.click(edgeId('outposts'));
  await settle();
  page.frame();
  page.frame();
  const laid = () => (page.ui as unknown as { laid: readonly Laid[] }).laid;
  return { page, laid };
}

test('scrolled, the plan blocks are clipped to the scrolling body, not drawn over the head', async () => {
  const { page, laid } = await opened({ width: 1180, height: 300 }, [1280, 720], OUTPOSTS(), (inner) => ({
    direction: 'column',
    children: [
      { height: 200 },
      { id: 'gear-body', width: 'grow', height: 300, direction: 'column', scroll: true, children: [inner] },
    ],
  }));
  page.ui.scrollBy('gear-body', 150);
  page.frame();
  page.frame();
  const body = laid().find((each) => each.node.id === 'gear-body');
  const hall = laid().find((each) => each.node.float && each.node.fill === LOOKS['hall']?.[0]);
  assert.ok(body && hall);
  assert.ok(hall.clip.y >= body.box.y, `the hall's clip starts at ${hall.clip.y}, the body at ${body.box.y}`);
});
