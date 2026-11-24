import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AccountLink, GuildFace, KeptPlot, OutpostFace, OutpostsFace, Roster } from '../../network/accounts.ts';
import type { Node } from '../../ui/node.ts';
import { sizesOf } from '../gearNodes.ts';
import type { PlainContext } from '../menuPage.ts';
import { drawn } from '../menuForTests.ts';
import { edgeId } from './guildHome.ts';
import { GuildPage, guildPage } from './guildPage.ts';
import { kindOf } from './outpostLaw.ts';
import { LOOKS, PLAN_ID, cellId, kindId } from './outpostPlan.ts';
import { AWAY_WORDS, SIDE_ID, outpostTabId } from './outpostsView.ts';

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
  view: readonly [number, number] = [1280, 720],
  outposts = OUTPOSTS(),
  wrap: (page: Node) => Node = (page) => ({ width: room.width, height: room.height, children: [page] }),
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

const SIZES: readonly { room: { width: number; height: number }; view: [number, number] }[] = [
  { room: { width: 710, height: 470 }, view: [800, 720] },
  { room: { width: 710, height: 350 }, view: [800, 600] },
  { room: { width: 1180, height: 350 }, view: [1280, 600] },
  { room: { width: 1180, height: 470 }, view: [1280, 720] },
  { room: { width: 1180, height: 600 }, view: [1600, 900] },
];

for (const { room, view } of SIZES)
  test(`at ${view.join(' by ')} nothing of the Outposts page passes the room's edge`, async () => {
    for (const here of [true, false]) {
      const { laid } = await opened(room, view, OUTPOSTS(here));
      const past = laid()
        .filter((each) => (each.node.press || each.node.text) && each.box.x + each.box.width > room.width + 0.5)
        .map((each) => `${each.node.id ?? each.node.text?.words} to ${Math.round(each.box.x + each.box.width)}`);
      assert.deepEqual(past, [], `here ${here}`);
    }
  });

test('where the page runs past the room, a More below cue shows', async () => {
  const { page } = await opened({ width: 710, height: 350 }, [800, 600]);
  assert.ok(page.shows().includes('More below: scroll'), page.shows());
});

test('away from the outpost, the reason nothing can be pressed stands beside the plan, not under it', async () => {
  const { laid } = await opened({ width: 1180, height: 470 }, [1280, 720], OUTPOSTS(false));
  const plan = laid().find((each) => each.node.id === PLAN_ID);
  const away = laid().find((each) => each.node.text?.words === AWAY_WORDS);
  assert.ok(plan && away);
  assert.ok(away.box.x >= plan.box.x + plan.box.width, 'beside the plan');
  assert.ok(away.box.y < plan.box.y + plan.box.height, 'level with it');
});

test('the column beside the plan keeps its width whatever is chosen', async () => {
  const { page, laid } = await opened({ width: 1180, height: 470 }, [1280, 720]);
  const columnOf = () => {
    const plan = laid().find((each) => each.node.id === PLAN_ID);
    const beside = laid().find((each) => each.node.id === SIDE_ID);
    assert.ok(plan && beside);
    return beside.box.width;
  };
  const widths = [columnOf()];
  for (const cell of [cellId(0, 0), cellId(6, 0), cellId(12, 0), cellId(7, 11)]) {
    page.click(cell);
    widths.push(columnOf());
  }
  assert.equal(new Set(widths).size, 1, widths.join(', '));
});

test("at 1600 by 900 the Outposts page's words take the menu's label size, as the home's do", async () => {
  // The test's view is 1280 by 720, so the room stays inside it; the sizes are 1600 by 900's.
  const { laid } = await opened({ width: 1180, height: 600 }, [1600, 900]);
  const plan = laid().find((each) => each.node.id === PLAN_ID);
  assert.ok(plan);
  const inside = (box: Laid['box']) =>
    box.x >= plan.box.x &&
    box.y >= plan.box.y &&
    box.x < plan.box.x + plan.box.width &&
    box.y < plan.box.y + plan.box.height;
  const texts = laid().filter((each) => each.node.text && !inside(each.box));
  const small = texts.filter((each) => (each.node.text as { size?: number }).size !== 2 && !inside(each.box));
  assert.ok(small.length <= 1, small.map((each) => each.node.text?.words).join('; '));
});

test("a structure chosen on one outpost's tab is not carried to another's by its id", async () => {
  const other = 'salt-hythe-outpost';
  const two: OutpostsFace = {
    ...OUTPOSTS(),
    outposts: [
      ...OUTPOSTS().outposts,
      {
        ...{ site: other, room: 'r2', raisedAt: 0, strongbox: 0, stores: {}, here: false },
        plot: { structures: [structure(1, 'hall', 6, 6), structure(3, 'war-table', 0, 0)], decor: [] },
      },
    ],
  };
  const { page } = await opened({ width: 1180, height: 470 }, [1280, 720], two);
  page.click(cellId(0, 0));
  assert.ok(page.shows().includes(kindOf('counting')?.words ?? '?'), 'the Counting House is chosen');
  page.click(outpostTabId(other));
  assert.ok(!page.shows().includes(kindOf('war-table')?.words ?? '?'), 'the other outpost opens on nothing chosen');
});

test("the plan's arrows speak the cell and the ghost's refusal", async () => {
  const { page } = await opened({ width: 1180, height: 470 });
  const spoken: string[] = [];
  page.ui.speak = (said: string) => void spoken.push(said);
  page.click(kindId('war-table'));
  page.ui.focusOn(PLAN_ID);
  // Up from the plot's middle to its top row, into the hall's cells.
  for (let step = 0; step < 8; step++) page.frame([{ kind: 'key', key: 'arrowup' }]);
  const keyed = spoken.filter((said) => !said.startsWith('The plan'));
  assert.ok(keyed.at(-1)?.endsWith(': Something already stands there.'), keyed.join(' / '));
});

test('every block says its mark and tier as the key does, the key naming each by the law and every mark it draws', async () => {
  const plot: KeptPlot = {
    structures: [
      structure(1, 'hall', 6, 6, 1),
      structure(2, 'standard', 7, 11),
      structure(3, 'war-table', 0, 0, 0, 1),
      structure(4, 'dock', 12, 0, 2, 3),
    ],
    decor: [{ id: 1, piece: 'well', x: 10, y: 10, turn: 0, paid: 95 }],
  } as unknown as KeptPlot;
  const outposts: OutpostsFace = { ...OUTPOSTS(), outposts: [{ ...OUTPOSTS().outposts[0], plot } as OutpostFace] };
  for (const [room, view] of [
    [{ width: 1180, height: 470 }, [1280, 720]],
    [{ width: 1180, height: 600 }, [1600, 900]],
    [{ width: 710, height: 350 }, [800, 600]],
  ] as const) {
    const { page, laid } = await opened(room, view, outposts);
    const shows = page.shows();
    const blocks = laid()
      .filter(
        (each) =>
          each.node.float &&
          Object.values(LOOKS).some(([colour]) => each.node.fill === colour || each.node.outline?.colour === colour),
      )
      .map((each) =>
        (each.node.children ?? []).flatMap((child) => (child && child.text ? [child.text.words] : [])).join(' '),
      )
      // A blueprint's front bar floats in its colour too, with no words.
      .filter((said) => said !== '');
    assert.deepEqual(blocks.sort(), ['D2', 'H1', 'S', 'W'], `${view.join(' by ')}: ${blocks.join(', ')}`);
    for (const key of [
      'H1 Command Tent',
      'S Banner Standard',
      'W War Table, being built',
      'D2 Dockyard II, rising to tier 3',
    ])
      assert.ok(shows.includes(key), `${key} in ${shows}`);
    for (const mark of ['Hollow: being built', 'Banded: rising a tier', 'Dot: decoration'])
      assert.ok(shows.includes(mark), `${mark} in the key`);
  }
});

test('the Delve Gate, the raise panel and the heading each say a thing once', async () => {
  const gated: KeptPlot = { structures: [...PLOT.structures, structure(6, 'gate', 10, 10, 2)], decor: [] };
  const outposts: OutpostsFace = {
    ...OUTPOSTS(),
    outposts: [{ ...OUTPOSTS().outposts[0], plot: gated } as OutpostFace],
  };
  const { page } = await opened({ width: 1180, height: 470 }, [1280, 720], outposts);
  page.click(cellId(10, 10));
  const count = (said: string) => page.shows().split(said).length - 1;
  assert.equal(count('laid afresh each week'), 1, page.shows());
  assert.ok(!page.shows().includes('| 1/3 |'), 'no count chip repeating the line under the heading');
  const poor = await opened({ width: 1180, height: 470 }, [1280, 720], {
    ...OUTPOSTS(),
    treasury: 4_999,
    at: 'salt-hythe-outpost',
  });
  poor.page.click(outpostTabId('salt-hythe-outpost'));
  const said = poor.page.shows();
  assert.equal(said.split('5,000').length - 1, 1, said);
  assert.equal(said.split('4,999').length - 1, 2, 'the heading and the panel, once each');
});

test('too narrow for a column beside it, the plan stands over the rest at its full cells', async () => {
  const { laid } = await opened({ width: 560, height: 470 }, [800, 720]);
  const plan = laid().find((each) => each.node.id === PLAN_ID);
  const beside = laid().find((each) => each.node.id === SIDE_ID);
  assert.ok(plan && beside);
  assert.equal(plan.box.width, 20 * 16, 'the cells the height allows');
  assert.ok(beside.box.y >= plan.box.y + plan.box.height, 'the rest under it');
});
