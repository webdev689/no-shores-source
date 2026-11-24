// The Guild tab's own page, after Destiny 2's clan screen: the banner hung on its staff at the left; the guild's name
// and tag, its members and its motto; the week, with the guild's level as a diamond on a rule; its bounties and
// outposts beneath; the roster at the right with its page arrows; and the small presses down the edge.

import type { GuildFace, Person } from '../../network/accounts.ts';
import type { Child, Node } from '../../ui/node.ts';
import type { Interface } from '../../ui/ui.ts';
import { emblemOf } from '../emblemArt.ts';
import { INK, emblemNode, label, svgNode, words } from '../gearNodes.ts';
import type { PlainContext } from '../menuPage.ts';
import { headingNode, hintNode } from '../menuPages.ts';
import type { Banner } from './bannerLaw.ts';
import { type ICONS, iconNode, levelNode, standardNode } from './guildNodes.ts';

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
/** A roster row's height, its emblem's sign at twice its cells, and the room the column's head takes. */
const ROW_PX = 48;
const ROSTER_HEAD_PX = 72;

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

/** The page: the banner, the middle column and the roster, with the edge's presses. */
export function homeNode(context: PlainContext, home: Home, turn: RosterTurn): Node {
  const { ui, room, sizes } = context;
  const scale = Math.max(2, Math.min(5, Math.floor((room.height - 30) / 100)));
  const rows = Math.max(4, Math.floor((room.height - ROSTER_HEAD_PX) / (ROW_PX + 6)));
  return {
    id: 'guild-home',
    width: 'grow',
    gap: 26,
    padding: [6, 4, 0, 4],
    children: [
      { direction: 'column', alignX: 'center', children: [standardNode(home.banner, scale)] },
      middleNode(home, sizes.label, sizes.name),
      rosterNode(ui, home.members, turn, rows, sizes.label),
      edgeNode(sizes.label),
    ],
  };
}

/** The middle column: the guild's face, its week, its bounties and outposts; its words at the menu's label and name
 *  steps. */
function middleNode(home: Home, size: number, named: number): Node {
  const { face } = home;
  const toNext = face.nextXp === null ? null : face.nextXp - face.levelXp;
  const xpWords = toNext === null ? 'The highest level' : `${counted(face.xp - face.levelXp)} / ${counted(toNext)} XP`;
  const share = toNext === null ? 1 : (face.xp - face.levelXp) / toNext;
  return {
    width: 'grow',
    direction: 'column',
    gap: 10,
    children: [
      {
        direction: 'column',
        gap: 6,
        children: [
          {
            gap: 10,
            alignY: 'end',
            children: [
              words(face.name, named + 1, INK.word, { edge: 'shadow', edgeColour: '#000' }),
              words(`[${face.tag}]`, named, INK.faint),
            ],
          },
          words(`// ${face.members} ${face.members === 1 ? 'MEMBER' : 'MEMBERS'}`, size, INK.faint, { tracking: 2 }),
          face.motto !== '' && words(face.motto, size, INK.faint, { wrap: true }),
          face.description !== '' && {
            width: 'grow',
            maxWidth: 900,
            text: { words: face.description, colour: INK.word, wrap: true },
          },
        ],
      },
      headingNode('This week', words(untilWords(home.now, face.weekEnds), size, INK.faint), size),
      levelNode(face.level, share, xpWords, size, home.week),
      headingNode('Bounties and outposts', null, size),
      {
        width: 'grow',
        gap: 24,
        children: [
          {
            width: 'grow',
            direction: 'column',
            gap: 8,
            children: [label('Weekly guild bounties', size), home.bounties],
          },
          {
            width: 'grow',
            direction: 'column',
            gap: 8,
            children: [label('Outposts', size), home.outposts ?? hintNode('No outposts yet.')],
          },
        ],
      },
      home.said !== '' && words(home.said, size, INK.answer, { wrap: true }),
    ],
  };
}

/** An arrow that turns the roster's page, pointing `way`. */
const arrowSvg = (way: -1 | 1) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="${way < 0 ? 'M8 1V9L1 5Z' : 'M2 1V9L9 5Z'}" fill="#efe8d6"/></svg>`;

/** The roster column: its head, its page arrows, and a page of members, those playing first. */
function rosterNode(ui: Interface, members: readonly Member[], turn: RosterTurn, rows: number, size: number): Node {
  const sorted = [...members].sort(
    (one, two) => Number(two.place !== null) - Number(one.place !== null) || one.name.localeCompare(two.name),
  );
  const pages = Math.max(1, Math.ceil(sorted.length / rows));
  if (ui.clicked(ROSTER_BACK) && turn.page > 0) turn.page--;
  if (ui.clicked(ROSTER_NEXT) && turn.page < pages - 1) turn.page++;
  turn.page = Math.min(turn.page, pages - 1);
  const arrow = (id: string, way: -1 | 1, none: boolean): Node => ({
    id,
    press: pages > 1,
    role: 'button',
    ...(none && { state: 'disabled' }),
    label: way < 0 ? 'Roster: the page before' : 'Roster: the next page',
    width: 30,
    height: 30,
    alignX: 'center',
    alignY: 'center',
    children: [svgNode(`guild-arrow ${way}`, arrowSvg(way), 10)],
  });
  return {
    role: 'panel',
    width: 260 + 80 * size,
    direction: 'column',
    gap: 6,
    padding: [12, 14, 14, 14],
    children: [
      {
        width: 'grow',
        alignY: 'end',
        gap: 6,
        children: [
          {
            width: 'grow',
            direction: 'column',
            gap: 2,
            children: [
              words('GUILD ROSTER', size, INK.word, { tracking: 4 }),
              words(`Page ${turn.page + 1} / ${pages}`, size, INK.faint),
            ],
          },
          arrow(ROSTER_BACK, -1, turn.page === 0),
          arrow(ROSTER_NEXT, 1, turn.page >= pages - 1),
        ],
      },
      ...sorted.slice(turn.page * rows, (turn.page + 1) * rows).map((member) => memberNode(member, size)),
    ],
  };
}

/** A member's row: their emblem's sign, their name, and their rank and where they play; greyed while away. */
function memberNode(member: Member, size: number): Node {
  const away = member.place === null;
  return {
    width: 'grow',
    height: ROW_PX,
    gap: 8,
    alignY: 'center',
    fill: away ? '#24262b' : 'rgba(0,0,0,0.32)',
    label: `${member.name}, ${member.rank}${away ? ', away' : `, ${member.place}`}`,
    children: [
      away ? { width: ROW_PX, height: ROW_PX } : emblemNode(emblemOf(member.emblem), 'sign', 24, ROW_PX, ROW_PX),
      {
        width: 'grow',
        direction: 'column',
        gap: 1,
        children: [
          words(member.name, size, away ? INK.faint : INK.word, { ellipsis: true }),
          words(away ? member.rank : `${member.rank} · ${member.place}`, 1, INK.faint, { ellipsis: true }),
        ],
      },
    ],
  };
}

/** The small presses down the edge: the banner, the details, the outposts and the treasury. */
function edgeNode(size: number): Node {
  const side = size > 1 ? 36 : 24;
  return {
    direction: 'column',
    gap: 8,
    children: EDGE.map((icon): Node => ({
      id: edgeId(icon),
      press: true,
      role: 'button',
      width: side + 20,
      height: side + 20,
      alignX: 'center',
      alignY: 'center',
      label: EDGE_NAMES[icon],
      children: [iconNode(icon, side)],
    })),
  };
}
