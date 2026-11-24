// The Guild tab's own page, after Destiny 2's clan screen: the banner hung on its staff at the left; the guild's name
// and tag, its members and its motto; the week, with the guild's level as a diamond on a rule, and its bounties
// beneath, framed as the Journal frames its parts; the roster at the right with its page arrows, the outposts under
// it; and the presses down the edge, each named.

import type { GuildFace, Person } from '../../network/accounts.ts';
import { TONES } from '../../plus/tones.ts';
import type { Child, Node } from '../../ui/node.ts';
import type { Interface } from '../../ui/ui.ts';
import { emblemOf } from '../emblemArt.ts';
import { INK, emblemNode, words } from '../gearNodes.ts';
import type { PlainContext } from '../menuPage.ts';
import { placeWords } from '../rosterRows.ts';
import type { Banner } from './bannerLaw.ts';
import {
  type ICONS,
  arrowsNode,
  headNode,
  iconNode,
  levelNode,
  panelNode,
  scrollNode,
  standardNode,
} from './guildNodes.ts';

/** A member as the roster column lists them. */
export type Member = Person & { readonly rank: string };

/** The presses down the edge, in order, and what each opens. */
export const EDGE: readonly (keyof typeof ICONS)[] = ['banner', 'details', 'outposts', 'treasury'];
const EDGE_NAMES: Readonly<Record<keyof typeof ICONS, string>> = {
  banner: 'Banner',
  details: 'Details',
  outposts: 'Outposts',
  treasury: 'Treasury',
};
export const edgeId = (icon: keyof typeof ICONS) => `guild-edge-${icon}`;
const ROSTER_BACK = 'guild-roster-back';
const ROSTER_NEXT = 'guild-roster-next';
/** A roster row's height, its emblem's sign at twice its cells, and the room the panel's head and frame take. */
const ROW_PX = 48;
const ROSTER_HEAD_PX = 72;
/** The roster's width from which its page arrows stand in its head's line. */
const ROSTER_ROOMY_PX = 300;
/** What a together bounty's brass words mean. */
/** The room the edge's presses take, two to a line under the roster, and the outposts' panel there, at the label's
 *  first step. */
const EDGE_GRID_PX = 128;
const OUTPOSTS_PX = 90;
const BRASS_WORDS = 'Brass: a bounty the guild does together.';

/** The roster column's page, kept across frames. */
export interface RosterTurn {
  page: number;
}

/** What the home page shows: the guild, its banner, its members, its week, bounties and outposts, and what was said. */
export interface Home {
  readonly face: GuildFace;
  readonly banner: Banner;
  readonly members: readonly Member[];
  readonly now: number;
  readonly said: string;
  /** The player's part in the week, the week's bounties, and the guild's outposts, each none where it has none. */
  readonly week?: Child;
  readonly bounties?: Child;
  readonly outposts?: Child;
}

/** Days and hours until a time, in the plain words the week's heading reads. */
export function untilWords(now: number, then: number): string {
  const hours = Math.max(0, Math.ceil((then - now) / 3_600_000));
  if (hours < 24) return `Turns in ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  const days = Math.floor(hours / 24);
  return `Turns in ${days} ${days === 1 ? 'day' : 'days'}`;
}

/** A number with its thousands marked, as the game writes them. */
export const counted = (amount: number) => amount.toLocaleString('en-GB');

/** The page: the banner, the middle column (scrolled where the room is short), the roster over the outposts, and the
 *  edge's presses. */
export function homeNode(context: PlainContext, home: Home, turn: RosterTurn): Node {
  const { ui, room, sizes } = context;
  // Below 1000 px of room the banner hangs smaller and the edge's presses stand under the roster, so nothing runs off
  // the room.
  const narrow = room.width < 1000;
  const scale = Math.max(2, Math.min(narrow ? 2 : 4, Math.floor((room.height - 30) / 100)));
  const besideRoster = (narrow ? EDGE_GRID_PX : 0) + OUTPOSTS_PX * sizes.label;
  const rosterWidth = Math.min(260 + 80 * sizes.label, Math.max(180, Math.floor(room.width * 0.24)));
  const headPx = ROSTER_HEAD_PX + (rosterWidth < ROSTER_ROOMY_PX ? 40 : 0);
  const rowPx = ROW_PX + 12 * (sizes.label - 1) + 6;
  const rows = Math.max(2, Math.floor((room.height - headPx - besideRoster) / rowPx));
  const height = room.height - 6;
  const outposts = panelNode([
    headNode('Outposts'),
    home.outposts ?? words('No outposts yet.', sizes.label, INK.faint),
  ]);
  const column: Child[] = [
    rosterNode(ui, home.members, turn, rows, sizes.label, rosterWidth),
    outposts,
    narrow && edgeNode(sizes.label, 2),
  ];
  return {
    id: 'guild-home',
    width: 'grow',
    height,
    gap: narrow ? 14 : 22,
    padding: [6, 4, 0, 4],
    children: [
      { direction: 'column', alignX: 'center', children: [standardNode(home.banner, scale)] },
      scrollNode(ui, 'guild-home-middle', height, middleNodes(home, sizes.label, sizes.name)),
      { width: rosterWidth, direction: 'column', gap: 10, children: column },
      !narrow && edgeNode(sizes.label, 1),
    ],
  };
}

/** The middle column's parts: the guild's face, then its week and bounties framed as the Journal's parts; every word at
 *  the menu's label step, the name at its name step. */
function middleNodes(home: Home, size: number, named: number): Child[] {
  const { face } = home;
  const toNext = face.nextXp === null ? null : face.nextXp - face.levelXp;
  const xpWords = toNext === null ? 'The highest level' : `${counted(face.xp - face.levelXp)} / ${counted(toNext)} XP`;
  const share = toNext === null ? 1 : (face.xp - face.levelXp) / toNext;
  const bounties = face.bounties ?? [];
  const week = panelNode([
    headNode('This week', null, words(untilWords(home.now, face.weekEnds), size, INK.faint)),
    levelNode(face.level, share, xpWords, size, home.week),
  ]);
  const bountyPanel = panelNode([
    headNode(
      'Bounties',
      bounties.length > 0 ? `${bounties.filter((each) => each.done).length}/${bounties.length}` : null,
    ),
    home.bounties,
    bounties.some((each) => each.together) && words(BRASS_WORDS, size, TONES.brassHi, { wrap: true }),
  ]);
  return [
    {
      width: 'grow',
      direction: 'column',
      gap: 2,
      children: [
        {
          width: 'grow',
          gap: 10,
          alignY: 'end',
          label: face.name,
          children: [
            words(face.name, named + 1, INK.word, { edge: 'shadow', edgeColour: '#000', ellipsis: true }),
            words(`[${face.tag}]`, size, INK.faint),
            words(`// ${face.members} ${face.members === 1 ? 'MEMBER' : 'MEMBERS'}`, size, INK.faint, { tracking: 2 }),
          ],
        },
        face.motto !== '' && { width: 'grow', ...words(face.motto, size, INK.faint, { wrap: true }) },
        face.description !== '' && { width: 'grow', ...words(face.description, size, INK.word, { wrap: true }) },
      ],
    },
    week,
    bountyPanel,
    home.said !== '' && { width: 'grow', ...words(home.said, size, INK.answer, { wrap: true }) },
  ];
}

/** The roster's panel, `width` wide: its head with its count and page arrows, and a page of members, those playing
 *  first. */
function rosterNode(
  ui: Interface,
  members: readonly Member[],
  turn: RosterTurn,
  rows: number,
  size: number,
  width: number,
): Node {
  const sorted = [...members].sort(
    (one, two) => Number(two.place !== null) - Number(one.place !== null) || one.name.localeCompare(two.name),
  );
  const pages = Math.max(1, Math.ceil(sorted.length / rows));
  if (ui.clicked(ROSTER_BACK) && turn.page > 0) turn.page--;
  if (ui.clicked(ROSTER_NEXT) && turn.page < pages - 1) turn.page++;
  turn.page = Math.min(turn.page, pages - 1);
  const arrows = arrowsNode([ROSTER_BACK, ROSTER_NEXT], turn.page, pages, 'Roster');
  // A narrow panel puts its arrows under its head, so the head is never cut short.
  const roomy = width >= ROSTER_ROOMY_PX;
  return panelNode(
    [
      headNode('Roster', String(members.length), roomy && arrows),
      !roomy && { width: 'grow', alignX: 'end', children: [arrows] },
      ...sorted.slice(turn.page * rows, (turn.page + 1) * rows).map((member) => memberNode(member, size)),
    ],
    { width, gap: 6 },
  );
}

/** A member's row: their emblem's sign, their name, and their rank and where they play in words; greyed while away. */
function memberNode(member: Member, size: number): Node {
  const away = member.place === null;
  const where = placeWords(member.place);
  return {
    width: 'grow',
    height: ROW_PX + 12 * (size - 1),
    gap: 8,
    alignY: 'center',
    fill: away ? '#24262b' : 'rgba(0,0,0,0.32)',
    label: `${member.name}, ${member.rank}, ${where}`,
    children: [
      away ? { width: ROW_PX, height: ROW_PX } : emblemNode(emblemOf(member.emblem), 'sign', 24, ROW_PX, ROW_PX),
      {
        width: 'grow',
        direction: 'column',
        gap: 1,
        children: [
          words(member.name, size, away ? INK.faint : INK.word, { ellipsis: true }),
          words(away ? member.rank : `${member.rank} · ${where}`, size, INK.faint, { ellipsis: true }),
        ],
      },
    ],
  };
}

/** The presses down the edge, each its icon over its name: the banner, the details, the outposts and the treasury. */
function edgeNode(size: number, across: 1 | 2): Node {
  const side = size > 1 ? 36 : 24;
  const press = (icon: keyof typeof ICONS): Node => ({
    id: edgeId(icon),
    press: true,
    role: 'button',
    width: 'grow',
    padding: [8, 8],
    direction: 'column',
    gap: 4,
    alignX: 'center',
    alignY: 'center',
    label: EDGE_NAMES[icon],
    children: [iconNode(icon, side), words(EDGE_NAMES[icon], size, INK.word)],
  });
  const lines: (keyof typeof ICONS)[][] = [];
  for (let first = 0; first < EDGE.length; first += across) lines.push(EDGE.slice(first, first + across));
  return {
    ...(across > 1 && { width: 'grow' }),
    direction: 'column',
    gap: 8,
    children: lines.map((line): Node => ({ width: 'grow', gap: 8, children: line.map(press) })),
  };
}
