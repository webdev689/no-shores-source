import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GuildFace } from '../../network/accounts.ts';
import type { Child, Node } from '../../ui/node.ts';
import { sizesOf, words } from '../gearNodes.ts';
import { drawn } from '../menuForTests.ts';
import { bannerOfName } from './bannerLaw.ts';
import { EDGE, type Home, type Member, edgeId, homeNode } from './guildHome.ts';
import { bountiesNode } from './guildWeek.ts';

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
  weekEnds: Date.UTC(2026, 10, 24, 9),
  bounties: [
    {
      name: 'The Long Cull',
      words: 'Defeat 1,500 foes.',
      target: 1500,
      together: false,
      count: 1500,
      done: true,
      claimed: true,
    },
    {
      name: 'Shoulder to Shoulder',
      words: 'Clear a dungeon at Elite or harder, two of the guild together.',
      target: 1,
      together: true,
      count: 0,
      done: false,
      claimed: false,
    },
    {
      name: 'Broadsides',
      words: 'Sink or take 50 ships.',
      target: 50,
      together: false,
      count: 31,
      done: false,
      claimed: false,
    },
    {
      name: 'Trophy Wall',
      words: 'Defeat 25 foes of Miniboss rank.',
      target: 25,
      together: false,
      count: 4,
      done: false,
      claimed: false,
    },
  ],
};

/** A real outpost room's name, as a member standing in one is placed. */
const OUTPOST_ROOM = 'node-gull-cove-outpost--guild-0a1b2c3d4e5f60718293a4b5c6d7e8f9';

const member = (name: string, rank: string, place: string | null): Member => ({
  name,
  tag: 'SALT',
  emblem: null,
  level: 12,
  place,
  rank,
});
const MEMBERS = [member('Ada', 'Founder', OUTPOST_ROOM), member('Ben', 'Admin', null), member('Cal', 'Member', null)];

/** The home drawn alone, in `room`, at the sizes of a `view` wide window. */
function home(face: GuildFace, room: { width: number; height: number }, view: [number, number] = [1280, 720]) {
  const turn = { page: 0 };
  let last: Node = {};
  const drawing = drawn((context) => {
    const sized = { ...context, sizes: sizesOf(view[0], view[1], 1) };
    const shown: Home = {
      face,
      banner: bannerOfName(face.name),
      members: MEMBERS,
      now: Date.UTC(2026, 10, 21, 9),
      said: '',
      bounties: bountiesNode(context.ui, face, sized.sizes.label, () => undefined),
    };
    last = homeNode(sized, shown, turn);
    // The menu's body holds the page to its room.
    return { width: room.width, height: room.height, children: [last] };
  }, room);
  drawing.frame();
  drawing.frame();
  return { ...drawing, tree: () => last };
}

/** Every text in a tree with its size, the home's own words (not what the week's parts hand it). */
function sizesIn(node: Child, into: { words: string; size: number }[] = []) {
  if (!node) return into;
  if (node.text) into.push({ words: String(node.text.words), size: node.text.size ?? 1 });
  for (const child of node.children ?? []) sizesIn(child, into);
  return into;
}

test('the roster says where a member plays in words, never the room it is named by', () => {
  const { shows } = home(FACE, { width: 1180, height: 520 });
  assert.ok(shows().includes('Founder · Gull Cove Outpost'), shows());
  assert.ok(!shows().includes('node-'), 'no room name shows');
});

test('the edge presses say what they open', () => {
  const { shows } = home(FACE, { width: 1180, height: 520 });
  for (const said of ['Banner', 'Details', 'Outposts', 'Treasury']) assert.ok(shows().includes(said), said);
});

test('at 800 px wide, with a 24-letter name, every press stays in the room', () => {
  const room = { width: 710, height: 470 };
  const { ui } = home({ ...FACE, name: 'The Brine Wardens Wester' }, room, [800, 720]);
  for (const icon of EDGE) {
    const box = ui.boxOf(edgeId(icon));
    assert.ok(box && box.x + box.width <= room.width, `${icon} ends at ${box && box.x + box.width}`);
  }
  const next = ui.boxOf('guild-roster-next');
  assert.ok(next && next.x + next.width <= room.width, 'the roster arrows stay in the room');
});

test('at 1280 by 720 the whole home fits, and at 1280 by 600 a cue says more lies below', () => {
  assert.ok(!home(FACE, { width: 1180, height: 470 }).shows().includes('More below'), 'it fits at 720 tall');
  assert.ok(home(FACE, { width: 1180, height: 350 }).shows().includes('More below'), 'a cue where it cannot');
});

test('at 1600 by 900 the home keeps one type scale: nothing smaller than the label step, the motto as the description', () => {
  const { tree } = home(FACE, { width: 1500, height: 650 }, [1600, 900]);
  const texts = sizesIn(tree());
  // A chip's count and the page between the arrows stand as the Journal's.
  const own = texts.filter((text) => text.size < 2 && !/^\d+(\/\d+)?$/.test(text.words));
  assert.deepEqual(own, [], 'every word of the home at the label step or larger');
  const motto = texts.find((text) => text.words === FACE.motto);
  const description = texts.find((text) => text.words === FACE.description);
  assert.equal(motto?.size, description?.size, 'the motto as large as the description');
});

test('a bounty done together says what its brass means', () => {
  assert.ok(home(FACE, { width: 1180, height: 520 }).shows().includes('Brass: a bounty the guild does together.'));
});

test('at 800 by 600 every edge press lies in the room, and the side says when more of it lies below', () => {
  const room = { width: 710, height: 350 };
  const { ui, shows } = home(FACE, room, [800, 600]);
  for (const icon of EDGE) {
    const box = ui.boxOf(edgeId(icon));
    assert.ok(box && box.y + box.height <= room.height, `${icon} ends at ${box && box.y + box.height}`);
  }
  assert.ok(shows().includes('More below'), 'a cue for the roster and outposts under the presses');
});

test('the longest name the guilds allow is shown whole, never cut short', () => {
  const name = 'Wardens of the Wide Wake';
  const { tree } = home({ ...FACE, name }, { width: 710, height: 350 }, [800, 600]);
  const found = (node: Child): Node | null =>
    !node ? null : node.text?.words === name ? node : ((node.children ?? []).map(found).find(Boolean) ?? null);
  const text = found(tree())?.text;
  assert.ok(text && !text.ellipsis && text.wrap, 'the name wraps to a second line instead of ending in an ellipsis');
});

test('the roster puts those playing first, and within each the founder and admins before the members', () => {
  const members = [
    member('Ada', 'Member', OUTPOST_ROOM),
    member('Zed', 'Founder', null),
    member('Yan', 'Admin', OUTPOST_ROOM),
    member('Bo', 'Member', null),
    member('Xia', 'Admin', null),
  ];
  const drawing = drawn((context) =>
    homeNode(context, { face: FACE, banner: bannerOfName(FACE.name), members, now: 0, said: '' }, { page: 0 }),
  );
  drawing.frame();
  const order = ['Yan', 'Ada', 'Zed', 'Xia', 'Bo'].map((name) => drawing.shows().indexOf(` ${name} |`));
  assert.ok(
    order.every((spot, index) => spot > 0 && (index === 0 || spot > order[index - 1])),
    drawing.shows(),
  );
});

test('at 1280 by 720 with two outposts the roster shows five rows, and the outposts still end in the room', () => {
  const room = { width: 1180, height: 470 };
  const members = Array.from({ length: 15 }, (_unused, index) => member(`M${index}`, 'Member', null));
  const outposts: Node = { direction: 'column', children: [words('Gull Cove', 1), words('Salt Hythe', 1)] };
  const drawing = drawn(
    (context) => ({
      width: room.width,
      height: room.height,
      children: [
        homeNode(
          context,
          { face: FACE, banner: bannerOfName(FACE.name), members, now: 0, said: '', outposts },
          { page: 0 },
        ),
      ],
    }),
    room,
  );
  drawing.frame();
  drawing.frame();
  assert.ok(drawing.shows().includes('1/3'), drawing.shows());
  const laid = (drawing.ui as unknown as { laid: { node: Node; box: { y: number; height: number } }[] }).laid;
  const salt = laid.find((each) => each.node.text?.words === 'Salt Hythe');
  assert.ok(
    salt && salt.box.y + salt.box.height <= room.height,
    `the outposts end at ${salt && salt.box.y + salt.box.height}`,
  );
});
