import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import { standing } from '../network/gearForTests.ts';
import type { GearState } from '../network/gearMessages.ts';
import type { QuestState } from '../network/questMessages.ts';
import { BANNER_KEYS, bannerSvg } from '../plus/journalArt.ts';
import type { Node } from '../ui/node.ts';
import type { Interface, UiEvent } from '../ui/ui.ts';
import { byId, fakeInterface, laidOf, laidWith, nodesOf, wordsIn } from '../ui/uiForTests.ts';
import type { ThisWeek } from './activityWords.ts';
import { sizesOf } from './gearNodes.ts';
import { HOURGLASS, Journal, type JournalSource } from './journalPage.ts';
import { QUESTS } from './quests/questBook.ts';

const FRIDAY_AT = 29_919_420 * 60_000;
const bounty = (words: string, target: number, count = 0, held = false, paid = false, pool = 0) => ({
  words,
  target,
  count,
  held,
  paid,
  pool,
  name: `Sample ${pool}`,
  tier: 1,
  faction: 0,
  tale: 'A line of its tale.',
});
const BOARD = [
  bounty('Defeat 30 Grey Tithe foes.', 30),
  bounty('Defeat 2 foes of Miniboss rank or higher.', 2, 1, true),
  bounty('Sink or take 3 ships.', 3, 3, true, false, 1),
  bounty('Sink or take a ship of Elite rank or higher.', 1, 1, true, true, 1),
  bounty('Clear 2 dungeons.', 2, 0, false, false, 2),
  bounty('Clear 3 dungeons.', 3, 0, false, false, 2),
].map((one, place) => ({ ...one, place }));
/** The Lamplighters' three, the first taken, for one pledged to them. */
const THEIRS = [
  { ...bounty('Gather 8 resource nodes.', 8, 2, true), name: 'Lamp Oil', place: 9, faction: 2 },
  { ...bounty('Clear 2 dungeons.', 2, 0, false, false, 2), name: 'Light the Way', place: 10, faction: 2 },
  { ...bounty('Sink or take 3 ships.', 3, 0, false, false, 1), name: 'Calm Waters', place: 11, faction: 2 },
];
/** Where a character stands on the houses' roads: walking quest `quest` (from 1, 0 none) at `task`, `done` by place. */
const roads = (quest: number, task: number, done: readonly number[] = [0, 0, 0, 0]): QuestState => ({
  ...{ quest, task, counts: [], done, choices: [], at: null },
});
const geared = (quest: QuestState | null, bounties = BOARD) =>
  ({ prologueDone: true, day: 20_778, bounties, quest, bountyXp: 3_500, bountyAurem: 210 }) as unknown as GearState;
/** A day's and a week's word with nothing on but their resets. */
const weekEnding = (endsAt: number, day = 20_778): ThisWeek => ({
  today: { day, endsAt, pays: '', rewards: [], modifier: null, tiers: [], dungeons: [] },
  week: { endsAt: endsAt + 3 * 86_400_000, dungeons: [], boon: null },
});

/** The Journal drawn frame by frame as the menu frames it: its hourglass over its page in a solid window floated over
 *  the world, the page given `tall` pixels of room; the last tree built, a step of frames hearing `events`, and a
 *  click on what an id names. */
function journalOf(source: JournalSource, now = () => FRIDAY_AT, width = 1280, tall = 700) {
  const { ui, step } = fakeInterface(width, 900);
  const journal = new Journal(source, now);
  const sizes = sizesOf(width, 900, 1);
  let built: Node = {};
  // The card the menu floats over everything while its tile is pointed at or holds the keys.
  let card: Node | null = null;
  const shows = (id: string, content: () => Node) => {
    if (ui.hovered(id) || (ui.focused(id) && ui.keyFocused)) card = content();
  };
  const room = { width: width - 120, height: tall };
  const page = () => journal.page({ ui, sizes, room, holds: null as never, card: shows });
  const window: () => Node = () => {
    card = null;
    const children = [journal.hourglass(ui), page()];
    const floated: Node | null = card && { ...(card as Node), float: { to: 'screen', z: 30, x: 0, y: 0 } };
    return {
      role: 'window',
      solid: true,
      width,
      height: 900,
      direction: 'column',
      float: { to: 'screen', z: 20 },
      children: [...children, floated],
    };
  };
  const tree = (): Node => ({ width: 'grow', height: 'grow', children: [window()] });
  const frame = (events: UiEvent[] = []) => step(() => (built = tree()), events);
  const click = (id: string) => {
    const box = ui.boxOf(id);
    assert.ok(box, `${id} is laid`);
    const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
    frame([
      { kind: 'pointer', x, y },
      { kind: 'down', x, y, button: 0 },
      { kind: 'up', x, y, button: 0 },
    ]);
    frame();
  };
  /** The pointer brought over what `id` names, laid last frame. */
  const point = (id: string) => {
    const box = ui.boxOf(id);
    assert.ok(box, `${id} is laid`);
    frame([{ kind: 'pointer', x: box.x + box.width / 2, y: box.y + box.height / 2 }]);
    frame();
  };
  frame();
  frame();
  return { ui, journal, frame, click, point, tree: () => built };
}

/** What `id` names, its words. */
const wordsOf = (tree: Node, id: string) => wordsIn(byId(tree, id));
const keyed = (ui: Interface, id: string) => ui.boxOf(id) !== null;

test('with no road walked the Journal says so plainly, the bounties at its side, and its timers wait above', () => {
  const open = BOARD.map((one) => ({ ...one, held: false, paid: false, count: 0 }));
  const { ui, tree } = journalOf({ week: () => null, kept: () => geared(roads(0, 0), open) });
  const said = wordsIn(tree());
  assert.ok(said.includes('No quests held. Quests you take up are kept here.'));
  assert.ok(!keyed(ui, 'quests-back') && !keyed(ui, 'quests-next'), 'no pages to turn');
  assert.ok(said.includes('0/6'));
  const slots = nodesOf(byId(tree(), 'journal-bounties')).filter((node) => node.role === 'well');
  assert.equal(slots.length, 6, 'six empty frames');
  assert.ok(said.includes('None taken yet. Take them at the bounty board in Overlook’s plaza.'));
  assert.ok(!keyed(ui, 'journal-timers'), 'the timers wait above');
  assert.ok(!said.includes('This Week'));
});

test('the Journal shows the houses’ roads: the opening at its task before the pledge, each road begun and each done', () => {
  const [opening, storm] = [QUESTS[0], QUESTS[1]];
  assert.ok(opening && storm);
  const before = journalOf({ week: () => null, kept: () => geared(roads(1, 0)) });
  assert.ok(keyed(before.ui, `quest-${opening.id}`), 'the opening, walked before any pledge');
  const card = wordsIn(byId(before.tree(), `quest-${opening.id}`));
  for (const words of [opening.name, '1', opening.tasks[0]?.task ?? ''])
    assert.ok(card.includes(words), `${words} on its card`);
  assert.ok(
    card.includes("You there, the one the stranger brought in. You can't walk about unarmed."),
    'a line of its tale: the opening line its first scene says',
  );
  const banner = nodesOf(byId(before.tree(), `quest-${opening.id}`)).find((node) => node.picture)?.picture;
  const pennants = BANNER_KEYS.filter((key) => key.startsWith('story-')).map((key) => bannerSvg(key));
  assert.ok(
    pennants.some((svg) => isDeepStrictEqual(banner?.source, { svg })),
    'a story mission’s banner',
  );
  const pledged = journalOf({ week: () => null, kept: () => geared(roads(2, 3, [1, 0, 0, 0])) });
  const cards = nodesOf(pledged.tree()).filter((node) => node.id?.startsWith('quest-'));
  assert.deepEqual(
    cards.map((one) => one.id),
    [`quest-${opening.id}`, `quest-${storm.id}`],
    'the opening done, the house’s road at its task',
  );
  const done = nodesOf(byId(pledged.tree(), `quest-${opening.id}`));
  assert.equal(done.filter((node) => node.picture).length, 2, 'its banner, and a tick once done');
  assert.ok(wordsIn(byId(pledged.tree(), `quest-${storm.id}`)).includes(storm.tasks[3]?.task ?? ''), 'its task now');
  assert.ok(wordsIn(pledged.tree()).includes('2'), 'how many show, by the title');
  const unclaimed = journalOf({ week: () => null, kept: () => geared({ ...roads(1, 0), claimed: false }) });
  assert.ok(!keyed(unclaimed.ui, `quest-${opening.id}`), 'nothing from a word not on the player’s own character');
});

test('each bounty taken is a tile, its state its look; the rest empty frames; its card beside it, with no press', () => {
  const { ui, point, tree } = journalOf({ week: () => null, kept: () => geared(roads(0, 0)) });
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5].map((place) => keyed(ui, `bounty-${place}`)),
    [false, true, true, true, false, false],
    'those taken, done and turned in',
  );
  const wells = nodesOf(byId(tree(), 'journal-bounties')).filter((node) => node.role === 'well');
  assert.equal(wells.length, 3);
  assert.ok(wordsIn(tree()).includes('3/6'));
  assert.equal(byId(tree(), 'bounty-card'), undefined, 'no card until a tile is pointed at');
  const said = () => wordsOf(tree(), 'bounty-card');
  point('bounty-1');
  assert.ok(said().includes('Defeat 2 foes of Miniboss rank or higher.') && said().includes('1/2'));
  assert.ok(said().includes('Land bounty') && said().includes('+3,500'), 'its kind, and its XP by its glyph');
  point('bounty-2');
  assert.ok(said().includes('Sink or take 3 ships.') && said().includes('Done. Turn it in at the board.'));
  point('bounty-3');
  assert.ok(said().includes('Turned in'));
  assert.ok(!nodesOf(tree()).some((node) => node.press && node.id?.startsWith('bounty-')), 'taken at the board alone');
});

test('one pledged to a faction has a slot for each of its three, its bounty taken worn on its own face', () => {
  const pledged = { ...geared(roads(0, 0), [...BOARD, ...THEIRS]), standing: standing({ pledge: 2 }), items: [] };
  const { ui, point, tree } = journalOf({ week: () => null, kept: () => pledged });
  assert.ok(wordsIn(tree()).includes('4/9'), 'the town’s six and the faction’s three');
  const face = (id: string) => nodesOf(byId(tree(), id)).find((node) => node.picture)?.picture?.key;
  assert.equal(face('bounty-9'), 'bounty face 2', 'the Lamplighters’ emblem');
  assert.equal(face('bounty-1'), 'bounty face 0', 'the town’s writ');
  assert.ok(keyed(ui, 'bounty-9') && !keyed(ui, 'bounty-10'));
  point('bounty-9');
  const card = wordsOf(tree(), 'bounty-card');
  for (const words of [
    'LAMP OIL',
    'Lamplighters bounty',
    '+2,500 reputation',
    'Counts while pledged to them and wearing their cape',
  ])
    assert.ok(card.includes(words), words);
  assert.ok(!card.some((words) => words.includes('Aurem')), 'a faction pays reputation in the town’s Aurem’s place');
});

test('gear of another day’s board, kept at sea through the reset, shows no bounty until a room sends today’s', () => {
  const { ui, tree } = journalOf({ week: () => weekEnding(FRIDAY_AT, 20_779), kept: () => geared(null) });
  assert.ok(!keyed(ui, 'bounty-1'));
  assert.ok(wordsIn(tree()).includes('Posted each day on the board in Overlook’s plaza.'));
  assert.ok(!wordsIn(tree()).includes('0/0'), 'no count without a board to count');
});

test('the hourglass drops the timers over the page, the focus going in; Close takes them up and the focus back', () => {
  const { ui, journal, click, frame, tree } = journalOf({ week: () => weekEnding(FRIDAY_AT), kept: () => null });
  click(HOURGLASS);
  frame();
  assert.equal(journal.down, true);
  assert.ok(keyed(ui, 'journal-timers'));
  assert.equal(ui.focusedId, 'timers-close', 'the focus goes in');
  assert.equal(byId(tree(), 'journal-timers')?.modal, true, 'the page under it out of the keys’ reach');
  const glass = nodesOf(byId(tree(), HOURGLASS)).find((node) => node.picture);
  assert.equal(glass?.picture?.turn, 180, 'the hourglass turned');
  click('timers-close');
  frame();
  assert.ok(!keyed(ui, 'journal-timers'));
  assert.equal(ui.focusedId, HOURGLASS);
  journal.toggle();
  frame();
  assert.equal(journal.up(), true, 'taken up as Escape steps back or the Journal is left');
  assert.equal(journal.up(), false, 'with them up, Escape is the menu’s');
});

test('the timers stay down as the minute, the day and the gear change under them', () => {
  let [now, week, gear] = [FRIDAY_AT - 2_000, weekEnding(FRIDAY_AT), geared(null)];
  const { journal, frame, tree } = journalOf({ week: () => week, kept: () => gear }, () => now);
  journal.toggle();
  frame();
  assert.equal(wordsOf(tree(), 'timer-day-reset')[0], '0:02');
  now = FRIDAY_AT + 1_000;
  frame();
  assert.equal(wordsOf(tree(), 'timer-day-reset')[0], '0:00', 'never below nothing until the new day comes');
  [week, gear] = [weekEnding(FRIDAY_AT + 86_400_000, 20_779), { ...geared(null), day: 20_779 } as GearState];
  frame();
  assert.equal(wordsOf(tree(), 'timer-day-reset')[0], '23:59:59');
  assert.equal(journal.down, true, 'still down');
});

test('two columns of cards where the page is wide, one where it is not; a card alone in its row keeps its width', () => {
  const wide = journalOf({ week: () => null, kept: () => geared(roads(3, 0, [1, 1, 0, 0])) });
  const narrow = journalOf({ week: () => null, kept: () => geared(roads(2, 0, [1, 0, 0, 0])) }, () => FRIDAY_AT, 800);
  const [first, second, third] = QUESTS.map((quest) => `quest-${quest.id}`);
  assert.ok(first && second && third);
  assert.equal(wide.ui.boxOf(first)?.y, wide.ui.boxOf(second)?.y, 'side by side');
  assert.ok((narrow.ui.boxOf(first)?.y ?? 0) < (narrow.ui.boxOf(second)?.y ?? 0), 'one over the other');
  assert.ok((wide.ui.boxOf(third)?.y ?? 0) > (wide.ui.boxOf(first)?.y ?? 0), 'the third on a row of its own');
  assert.equal(wide.ui.boxOf(third)?.width, wide.ui.boxOf(first)?.width, 'as wide as the cards above it');
});

test('the timers stand within the room the menu gives the page, however many rows they hold', () => {
  const { ui, journal, frame } = journalOf(
    { week: () => weekEnding(FRIDAY_AT), kept: () => null },
    () => FRIDAY_AT,
    1280,
    240,
  );
  journal.toggle();
  frame();
  const [page, timers] = [ui.boxOf('journal'), ui.boxOf('journal-timers')];
  assert.ok(page && timers);
  assert.ok(timers.y + timers.height <= page.y + 240, 'no lower than the page’s room');
});

test('a bounty’s card keeps its name within its edge, cut short where it is too long', () => {
  const long = BOARD.map((one, place) => (place === 1 ? { ...one, name: 'A Name Far Too Long For Any Card' } : one));
  const { point, tree } = journalOf({ week: () => null, kept: () => geared(null, long) });
  point('bounty-1');
  const laid = laidOf(tree(), 1280, 900);
  const card = laidWith(laid, 'bounty-card');
  const name = laid.find((each) => each.node.text?.words === 'A NAME FAR TOO LONG FOR ANY CARD');
  assert.ok(card && name);
  assert.ok(name.box.x + name.box.width <= card.box.x + card.box.width, 'within the card');
  assert.equal(name.node.text?.ellipsis, true, 'cut short');
});

test('the keys’ focus on a quest’s card edges it white, and no other card', () => {
  const { ui, frame, tree } = journalOf({ week: () => null, kept: () => geared(roads(2, 0, [1, 0, 0, 0])) });
  const [first, second] = QUESTS.map((quest) => `quest-${quest.id}`);
  assert.ok(first && second);
  assert.equal(byId(tree(), first)?.outline, undefined, 'none before the keys come to it');
  ui.focusOn(HOURGLASS);
  frame([{ kind: 'key', key: 'Tab' }]);
  frame();
  assert.equal(ui.focusedId, first);
  assert.ok(byId(tree(), first)?.outline, 'edged');
  assert.equal(byId(tree(), second)?.outline, undefined);
});
