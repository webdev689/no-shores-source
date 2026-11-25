import assert from 'node:assert/strict';
import { test } from 'node:test';
import { item, standing, state } from '../network/gearForTests.ts';
import { ASKS, type GearBounty, type GearState } from '../network/gearMessages.ts';
import type { Node } from '../ui/node.ts';
import type { Interface, UiEvent } from '../ui/ui.ts';
import { byId, fakeInterface, laidOf, nodesOf, wordsIn } from '../ui/uiForTests.ts';
import { boardPage, bountyRows, payOf, serves } from './bountyBoard.ts';
import { bountyTileNode, kindOf, stateWords } from './bountyTiles.ts';
import { sizesOf } from './gearNodes.ts';
import type { MenuContext } from './menuPage.ts';

const bounty = (
  words: string,
  [place, pool, target]: readonly [number, number, number],
  held: Partial<Pick<GearBounty, 'count' | 'held' | 'paid'>> = {},
  [tier, faction, name]: readonly [number, number, string] = [1, 0, `Sample ${place}`],
): GearBounty => ({ words, place, pool, target, tier, faction, name, count: 0, held: false, paid: false, ...held });

/** The town's six, four taken: one counting, one done, one turned in. */
const TOWN: readonly GearBounty[] = [
  bounty('Defeat 30 Grey Tithe foes.', [0, 0, 30], {}, [2, 0, 'Tithe Collector']),
  bounty('Defeat 2 foes of Miniboss rank or higher.', [1, 0, 2], { count: 1, held: true }, [3, 0, 'Big Game']),
  bounty('Sink or take 3 ships.', [2, 1, 3], { count: 3, held: true }, [2, 0, 'Broadside']),
  bounty('Sink or take a ship of Elite rank or higher.', [3, 1, 1], { count: 1, held: true, paid: true }),
  bounty('Clear a dungeon.', [4, 2, 1], {}, [1, 0, 'Into the Dark']),
  bounty('Clear 3 dungeons.', [5, 2, 3], {}, [3, 0, 'Deep Delver']),
];
/** The Lamplighters' three, the first taken. */
const LAMPLIGHTERS: readonly GearBounty[] = [
  bounty('Gather 8 resource nodes.', [9, 0, 8], { count: 3, held: true }, [1, 2, 'Lamp Oil']),
  bounty('Clear 2 dungeons.', [10, 2, 2], {}, [2, 2, 'Light the Way']),
  bounty('Sink or take 2 ships of Elite rank or higher.', [11, 1, 2], {}, [3, 2, 'Harbour Light']),
];
/** The Lamplighters' cape, worn in the cloak's slot. */
const CAPE = item({ id: 40, kind: 17, bucket: 6, at: 8, rarity: 3, named: 'lamplighters_cape' });
const PLEDGED: GearState = state({
  prologueDone: true,
  day: 20_778,
  aurem: 1_840,
  bountyXp: 3_500,
  bountyAurem: 210,
  bounties: [...TOWN, ...LAMPLIGHTERS],
  standing: standing({ pledge: 2, reputation: [0, 132_500, 0] }),
  items: [CAPE],
});
const UNPLEDGED: GearState = { ...PLEDGED, bounties: TOWN, standing: standing({}), items: [] };

test('each of the day’s bounties is taken by its place, counted, turned in once done, and then says so', () => {
  const rows = bountyRows(PLEDGED);
  assert.deepEqual(
    rows.slice(0, 4).map((row) => [row.state, row.progress, row.press?.label ?? null]),
    [
      ['open', '', 'Take'],
      ['held', '1/2', null],
      ['done', '3/3', 'Turn in'],
      ['paid', 'Turned in', null],
    ],
  );
  assert.deepEqual(rows[0]?.press?.ask, { kind: ASKS.takeBounty, node: 0, item: 20_778 }, 'by the day it was shown');
  assert.deepEqual(rows[2]?.press?.ask, { kind: ASKS.turnInBounty, node: 2, item: 20_778 });
  assert.deepEqual(rows[7]?.press?.ask, { kind: ASKS.takeBounty, node: 10, item: 20_778 }, 'a faction’s by its place');
  assert.deepEqual(
    bountyRows({ ...PLEDGED, prologueDone: false }).map((row) => row.press),
    rows.map(() => null),
    'shut until the prologue',
  );
  assert.deepEqual(bountyRows({ ...PLEDGED, bounties: undefined }), [], 'a room that sends no board');
  assert.deepEqual(rows.slice(0, 4).map(stateWords), [
    'Not taken',
    '1/2',
    'Done. Turn it in at the board.',
    'Turned in',
  ]);
});

test('the town’s bounties pay XP and Aurem, a faction’s XP and its reputation, each by its tier', () => {
  const pays = bountyRows(PLEDGED).map((row) => payOf(PLEDGED, row));
  assert.deepEqual(pays.slice(0, 3), [
    { xp: 5_250, aurem: 315, reputation: 0 },
    { xp: 7_000, aurem: 420, reputation: 0 },
    { xp: 5_250, aurem: 315, reputation: 0 },
  ]);
  assert.deepEqual(
    pays.slice(6),
    [
      { xp: 3_500, aurem: 0, reputation: 2_500 },
      { xp: 5_250, aurem: 0, reputation: 3_750 },
      { xp: 7_000, aurem: 0, reputation: 5_000 },
    ],
    'as `faction_bounty_reputation` pays it, whatever the level',
  );
});

test('a faction’s bounty counts while its cape is worn by one pledged to it', () => {
  assert.equal(serves(PLEDGED, 2), true);
  assert.equal(serves({ ...PLEDGED, items: [] }, 2), false, 'no cape');
  assert.equal(serves({ ...PLEDGED, items: [{ ...CAPE, at: 0 }] }, 2), false, 'carried, not worn');
  assert.equal(serves({ ...PLEDGED, standing: standing({ pledge: 3 }) }, 2), false, 'pledged to another');
  const another = { ...CAPE, named: 'stormcallers_cape' };
  assert.equal(serves({ ...PLEDGED, items: [another] }, 2), false, 'another faction’s cape worn');
  assert.equal(serves(PLEDGED, 0), false, 'the town’s asks no cape');
});

const FRIDAY_AT = 29_919_420 * 60_000;

/** The board's screen drawn frame by frame for `shown` on a screen `width` wide, an hour before the next board, laid
 *  in the room the menu gives a page there, the card it shows floated over it as the menu floats it; with every ask
 *  it made. */
function boardOf(shown: GearState, width = 1280) {
  const { ui, step } = fakeInterface(width, 900);
  const asked: unknown[] = [];
  // The menu's window stands 32 in from each side, its body's padding 20 inside its own 2.
  const room = { width: width - 2 * 32 - 2 * 2 - 2 * 20, height: 600 };
  let card: Node | null = null;
  const context = {
    ui,
    gear: shown,
    sizes: sizesOf(width, 900, 1),
    room,
    ask: (ask: unknown) => asked.push(ask),
    card: (id: string, content: () => Node) => {
      if (ui.hovered(id) || (ui.focused(id) && ui.keyFocused)) card = content();
    },
  } as unknown as MenuContext;
  let built: Node = {};
  const page = () => {
    card = null;
    const drawn = boardPage(
      context,
      () => FRIDAY_AT + 3_600_000,
      () => FRIDAY_AT,
    );
    const floated: Node | null = card && { ...(card as Node), float: { to: 'screen', z: 30, x: 0, y: 0 } };
    return { width: room.width, direction: 'column', children: [drawn, floated] } satisfies Node;
  };
  const frame = (events: UiEvent[] = []) => step(() => (built = page()), events);
  frame();
  frame();
  /** The pointer brought over what `id` names, laid last frame. */
  const point = (id: string) => {
    const box = ui.boxOf(id);
    assert.ok(box, `${id} is laid`);
    frame([{ kind: 'pointer', x: box.x + box.width / 2, y: box.y + box.height / 2 }]);
    frame();
  };
  return { ui, asked, frame, point, tree: () => built };
}

/** A click on what `id` names, laid last frame. */
function click(ui: Interface, frame: (events: UiEvent[]) => void, id: string): void {
  const box = ui.boxOf(id);
  assert.ok(box, `${id} is laid`);
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  frame([
    { kind: 'pointer', x, y },
    { kind: 'down', x, y, button: 0 },
    { kind: 'up', x, y, button: 0 },
  ]);
}

const TOWN_IDS = [0, 1, 2, 3, 4, 5].map((place) => `bounty-${place}`);
const THEIR_IDS = [9, 10, 11].map((place) => `bounty-${place}`);

test('the board stands beside its stage, the town’s six in a row and the faction’s three under them, no words on a tile', () => {
  const { ui, tree } = boardOf(PLEDGED);
  const said = wordsIn(tree());
  for (const words of ['THE BOUNTY BOARD', 'AVAILABLE BOUNTIES', 'NEW BOUNTIES', '1:00:00', '1,840', 'Rank 1'])
    assert.ok(said.includes(words), words);
  assert.ok((ui.boxOf('board-stage')?.x ?? 0) < (ui.boxOf('bounty-0')?.x ?? 0), 'the stage at the left');
  const top = (id: string) => ui.boxOf(id)?.y ?? -1;
  assert.equal(new Set(TOWN_IDS.map(top)).size, 1, 'the town’s six in one row');
  assert.equal(new Set(THEIR_IDS.map(top)).size, 1, 'the faction’s three in another');
  assert.ok(top('bounty-0') < top('bounty-9'), 'the town’s first');
  assert.ok(
    [...TOWN_IDS, ...THEIR_IDS].every((id) => wordsIn(byId(tree(), id)).length === 0),
    'a face and a look, no words',
  );
  const face = (id: string) => nodesOf(byId(tree(), id)).find((node) => node.picture)?.picture?.key;
  assert.deepEqual(new Set(TOWN_IDS.map(face)), new Set(['bounty face 0']), 'every town bounty wears the writ');
  assert.deepEqual(new Set(THEIR_IDS.map(face)), new Set(['bounty face 2']), 'every Lamplighters’ its emblem');
  const gauged = [...TOWN_IDS, ...THEIR_IDS].map((id) =>
    nodesOf(byId(tree(), id)).some((node) => node.role === 'track'),
  );
  assert.deepEqual(gauged, [false, true, true, false, false, false, true, false, false], 'a gauge while counted');
  assert.equal(nodesOf(byId(tree(), 'bounty-3')).filter((node) => node.picture).length, 2, 'a tick once turned in');
  assert.ok(nodesOf(tree()).some((node) => node.label === 'New bounties in 1:00:00'));
});

test('a tile’s card floats beside it while pointed at: its name, kind, task, count, rewards and press', () => {
  const { ui, asked, frame, point, tree } = boardOf(PLEDGED);
  const card = () => wordsIn(byId(tree(), 'bounty-card'));
  assert.equal(byId(tree(), 'bounty-card'), undefined, 'no card until a tile is pointed at');
  point('bounty-0');
  for (const words of [
    'TITHE COLLECTOR',
    'Land bounty',
    'Defeat 30 Grey Tithe foes.',
    'REWARDS',
    '+5,250',
    '+315 Aurem',
  ])
    assert.ok(card().includes(words), words);
  assert.ok(card().includes('E') && card().includes('Take'), 'E takes it, by its keycap');
  point('bounty-2');
  assert.ok(card().includes('BROADSIDE') && card().includes('Sea bounty') && card().includes('3/3'));
  assert.ok(card().includes('Turn in'));
  point('bounty-9');
  for (const words of [
    'LAMP OIL',
    'Lamplighters bounty',
    '3/8',
    '+2,500 reputation',
    'Counts while pledged to them and wearing their cape',
  ])
    assert.ok(card().includes(words), words);
  click(ui, frame, 'bounty-0');
  // Pointed at after the click, Broadside's card shows, and E on the tile still focused turns in the card's bounty.
  point('bounty-2');
  assert.equal(ui.focusedId, 'bounty-0');
  frame([{ kind: 'key', key: 'e' }]);
  assert.deepEqual(asked, [
    { kind: ASKS.takeBounty, node: 0, item: 20_778 },
    { kind: ASKS.turnInBounty, node: 2, item: 20_778 },
  ]);
});

test('the arrows move between tiles, along the town’s row and down to the faction’s', () => {
  const { ui, frame } = boardOf(PLEDGED);
  ui.focusOn('bounty-0');
  frame([{ kind: 'key', key: 'ArrowRight' }]);
  frame();
  assert.equal(ui.focusedId, 'bounty-1');
  frame([{ kind: 'key', key: 'ArrowDown' }]);
  frame();
  assert.equal(ui.focusedId, 'bounty-10', 'the tile under it');
});

test('pledged to none, the faction’s row is three locked slots whose card says how they open', () => {
  const { ui, asked, frame, point, tree } = boardOf(UNPLEDGED);
  const locked = nodesOf(tree()).filter((node) => node.id?.startsWith('bounty-locked-'));
  assert.equal(locked.length, 3);
  assert.ok(!wordsIn(tree()).includes('Rank 1'), 'no faction’s rank to show');
  point('bounty-locked-0');
  const card = wordsIn(byId(tree(), 'bounty-card'));
  assert.ok(card.includes('Pledge to a faction at its counter in Overlook to take its bounties.'));
  click(ui, frame, 'bounty-locked-1');
  assert.deepEqual(asked, [], 'nothing asked');
});

test('before the prologue the tiles rest grey, their cards say why, and nothing is asked', () => {
  const { ui, asked, frame, point, tree } = boardOf({ ...PLEDGED, prologueDone: false });
  point('bounty-0');
  assert.ok(wordsIn(byId(tree(), 'bounty-card')).includes('The bounty board opens after the prologue.'));
  const tint = nodesOf(byId(tree(), 'bounty-0')).find((node) => node.picture)?.picture?.tint;
  assert.equal(tint, 'rgb(110,110,110)', 'greyed');
  click(ui, frame, 'bounty-0');
  frame([{ kind: 'key', key: 'e' }]);
  assert.deepEqual(asked, []);
});

test('on a phone the stage stands over the bounties, all within the room the menu gives the board', () => {
  const { ui } = boardOf(PLEDGED, 390);
  const [board, stage, first] = [ui.boxOf('board'), ui.boxOf('board-stage'), ui.boxOf('bounty-0')];
  assert.ok(board && stage && first);
  assert.ok(board.width <= 390 - 2 * 32 - 2 * 2 - 2 * 20, 'no wider than its room');
  assert.ok(stage.y + stage.height <= first.y, 'over the tiles');
  for (const id of [...TOWN_IDS, ...THEIR_IDS]) {
    const box = ui.boxOf(id);
    assert.ok(box && box.x + box.width <= board.x + board.width, `${id} within the board`);
  }
});

test('the tile pointed at is ringed just outside its edge, over it, so its state’s edge still shows inside', () => {
  const row = bountyRows(PLEDGED)[2];
  assert.ok(row);
  const look = { lit: true, shut: false, press: true };
  const laid = laidOf({ padding: 20, children: [bountyTileNode(row, 'tile', false, look)] });
  const tile = laid.findIndex((each) => each.node.id === 'tile');
  const ring = laid.findIndex((each) => each.node.outline !== undefined);
  const [tileBox, ringBox] = [laid[tile]?.box, laid[ring]?.box];
  assert.ok(tileBox && ringBox && ring > tile, 'drawn over the tile');
  assert.ok(ringBox.x < tileBox.x && ringBox.y < tileBox.y, 'outside its top left');
  assert.ok(ringBox.x + ringBox.width > tileBox.x + tileBox.width, 'and its right');
  assert.ok(laid[tile]?.node.draw, 'its own edge kept');
  assert.equal(tileBox.width, 52, 'its face twice its 24 cells, in a 2 pixel edge');
  const plain = laidOf({ padding: 20, children: [bountyTileNode(row, 'tile', false, { ...look, lit: false })] });
  assert.ok(!plain.some((each) => each.node.outline), 'no ring on a tile not pointed at');
});

test('E acts only on the bounty whose card shows: none while the pointer rests on a locked slot or a coin', () => {
  const { ui, asked, frame, point, tree } = boardOf(UNPLEDGED);
  ui.focusOn('bounty-3');
  frame([{ kind: 'key', key: 'ArrowRight' }]);
  frame();
  assert.equal(ui.focusedId, 'bounty-4', 'the keys on an open bounty');
  point('bounty-locked-0');
  assert.ok(wordsIn(byId(tree(), 'bounty-card')).includes('FACTION BOUNTIES'), 'the locked slot’s card shows');
  frame([{ kind: 'key', key: 'e' }]);
  point('board-aurem');
  frame([{ kind: 'key', key: 'e' }]);
  assert.deepEqual(asked, [], 'no bounty taken behind another card');
});

test('opening the board takes no focus, so a pad’s A or Enter takes nothing unseen; the card says a click or E takes it', () => {
  const { ui, asked, frame, point, tree } = boardOf(PLEDGED);
  assert.equal(ui.focusedId, null, 'nothing chosen for the player');
  frame([{ kind: 'key', key: 'Enter' }]);
  frame([{ kind: 'key', key: ' ' }]);
  assert.deepEqual(asked, []);
  point('bounty-4');
  const card = wordsIn(byId(tree(), 'bounty-card'));
  assert.ok(
    ['Click', 'E', 'Take'].every((said) => card.includes(said)),
    'the card’s press, as the footer says it',
  );
});

test('E is heard while a coin or a padlock holds the focus, and acts on the bounty whose card shows', () => {
  const { ui, asked, frame, point } = boardOf(UNPLEDGED);
  ui.focusOn('bounty-locked-2');
  frame([{ kind: 'key', key: 'ArrowRight' }]);
  frame();
  point('bounty-4');
  frame([{ kind: 'key', key: 'e' }]);
  assert.deepEqual(asked, [{ kind: ASKS.takeBounty, node: 4, item: 20_778 }]);
  for (const id of ['board-aurem', 'bounty-locked-0'])
    assert.deepEqual(laidOf(boardOf(UNPLEDGED).tree()).find((each) => each.node.id === id)?.node.keys, ['e'], id);
});

test('the bounties and the time to the next board stand in a scroll of their own, the time just under the tiles', () => {
  const { ui, tree } = boardOf(PLEDGED);
  const scroll = byId(tree(), 'board-bounties');
  assert.equal(scroll?.scroll, true, 'reachable on a short screen');
  assert.ok(
    nodesOf(scroll).some((node) => node.id === 'board-refresh'),
    'the time inside it',
  );
  const [faction, refresh] = [ui.boxOf('bounty-9'), ui.boxOf('board-refresh')];
  assert.ok(faction && refresh);
  assert.ok(refresh.y - (faction.y + faction.height) < 40, 'under the tiles, as the Tracker lays it');
});

test('a faction’s card is marked by its faction’s emblem, and ticks its requirement only while it is met', () => {
  const { point, tree } = boardOf(PLEDGED);
  point('bounty-10');
  const keys = () => nodesOf(byId(tree(), 'bounty-card')).map((node) => node.picture?.key ?? '');
  const kindLine = nodesOf(byId(tree(), 'bounty-card')).find((node) =>
    (node.children ?? []).some((child) => child && child.text?.words === 'Lamplighters bounty'),
  );
  const mark = (kindLine?.children ?? []).find((child) => child && child.picture);
  assert.equal(mark && mark.picture?.key, 'emblem lamplighters sign 24', 'the Lamplighters’ emblem by its kind');
  assert.ok(
    keys().some((key) => key.startsWith('journal icon taken')),
    'ticked: pledged, its cape worn',
  );
  const bare = boardOf({ ...PLEDGED, items: [] });
  bare.point('bounty-10');
  const ticks = nodesOf(byId(bare.tree(), 'bounty-card')).filter((node) =>
    node.picture?.key?.startsWith('journal icon taken'),
  );
  assert.equal(ticks.length, 0, 'no cape, no tick');
});

test('a tile reads to a screen reader what it pays and what pressing it does, and why the board is shut', () => {
  const label = (shown: GearState, id: string) => byId(boardOf(shown).tree(), id)?.label ?? '';
  assert.match(label(PLEDGED, 'bounty-0'), /Pays 5,250 XP and 315 Aurem\. Press to take it\./);
  assert.match(label(PLEDGED, 'bounty-2'), /Press to turn it in\./);
  assert.match(label(PLEDGED, 'bounty-10'), /Pays 5,250 XP and 3,750 Lamplighters reputation\./);
  assert.match(label(PLEDGED, 'bounty-10'), /Counts now\./);
  assert.match(
    label({ ...PLEDGED, items: [] }, 'bounty-10'),
    /Counts only while pledged to them and wearing their cape\./,
  );
  assert.match(label({ ...PLEDGED, prologueDone: false }, 'bounty-0'), /The bounty board opens after the prologue\./);
});

test('a faction’s kind drops its name’s “The”: Veiled bounty, Stormcallers bounty', () => {
  assert.deepEqual(
    [1, 3].map((faction) => kindOf({ pool: 0, faction })),
    ['Stormcallers bounty', 'Veiled bounty'],
  );
  assert.equal(kindOf({ pool: 1, faction: 0 }), 'Sea bounty');
});
