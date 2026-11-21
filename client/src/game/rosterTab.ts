// The Social tab as Destiny 1's Roster, drawn by the game: three columns, Game (the company under its privacy, then
// those in the same room), Friends and Guild, each a page of rows with arrows between pages. Each row is a player's
// emblem and nameplate behind their name and their guild's tag; choosing one opens a panel beside it with where they
// are and all that may be done with them. What cannot be undone is held. The Roster is asked for again now and then
// while it is seen.

import type { AccountLink, Details, Person, Roster } from '../network/accounts.ts';
import { button } from '../ui/controls.ts';
import { announce } from '../ui/announce.ts';
import type { Child, Node } from '../ui/node.ts';
import type { Interface } from '../ui/ui.ts';
import { emblemOf } from './emblemArt.ts';
import { INK, emblemNode, plateNode, pressNode, svgNode, words } from './gearNodes.ts';
import { ROSTER_HEARD } from './gearScreen.ts';
import type { PlainContext } from './menuPage.ts';
import { answerNode, PRESS_PADDING } from './menuPages.ts';
import { DETAILS_BACK, detailsNode } from './playerDetails.ts';
import { FIELD_IDS, type Panel, panelParts, rowId } from './rosterPanel.ts';
import {
  type Action,
  ROWS_A_PAGE,
  ROWS_LEAST,
  type Row,
  friendRows,
  gameRows,
  guildRows,
  nameWithTag,
  pagesOf,
} from './rosterRows.ts';

/** How often the Roster is asked for again while it is seen, in milliseconds. */
const LOOK_MS = 15_000;
/** How much taller a page grows with one more row: a row and the gap under it. */
const ROW_STEP_PX = 50;
/** A row's height, the panel's width, and the gap between the columns. */
const ROW_PX = 48;
const PANEL_PX = 320;
const COLUMN_GAP = 28;
type Column = 'game' | 'friends' | 'guild';
const COLUMNS: readonly Column[] = ['game', 'friends', 'guild'];
const TITLES: Readonly<Record<Column, string>> = { game: 'Game', friends: 'Friends', guild: 'Guild' };

/** The company's leader's mark: a gold corner on their sign, as Destiny's leader wears. */
const LEADER = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 14 14"><path d="M0 0H14L0 14Z" fill="#f3cf6a"/></svg>`;
/** An arrow that turns a column's page, pointing `way`. */
const arrowSvg = (way: -1 | 1) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="${way < 0 ? 'M8 1V9L1 5Z' : 'M2 1V9L9 5Z'}" fill="#efe8d6"/></svg>`;

/** The ids of what the Roster draws. */
const PAGE_ID = 'roster';
const PANEL_ID = 'roster-panel';
const topId = (column: Column) => `roster-top-${column}`;
const isPanelPart = (id: string | null) => id !== null && /^roster-(action|field)-/.test(id);

/** The page's services, given by the menu. */
export interface RosterWith {
  readonly link: AccountLink;
  readonly travel: (place: string) => string | null;
  readonly now?: () => number;
  /** Whether the page is out of sight (its tab hidden), when the Roster is not asked again. */
  readonly hidden?: () => boolean;
}

/** One row as a press: the player's emblem and its nameplate behind their name and tag, greyed with none when away. */
function rowNode(ui: Interface, row: Row, chosen: boolean, width: number): Node {
  const id = rowId(row);
  const emblem = emblemOf(row.person.emblem);
  const lit = ui.hovered(id) || (ui.focused(id) && ui.keyFocused);
  const ink = row.dim ? INK.faint : INK.word;
  const shade = { edge: 'shadow', edgeColour: '#000' } as const;
  const sign: Node = {
    width: ROW_PX,
    height: ROW_PX,
    fill: row.dim ? '#232428' : 'rgba(0,0,0,0.3)',
    children: [
      !row.dim && { ...emblemNode(emblem, 'sign', 24, ROW_PX, ROW_PX), float: { to: 'parent' } },
      row.leads && { ...svgNode('leader', LEADER, 14), float: { to: 'parent' } },
    ],
  };
  const named: Node = {
    width: 'grow',
    direction: 'column',
    gap: 2,
    children: [
      {
        width: 'grow',
        gap: 8,
        children: [
          { ...words(row.person.name, 2, ink, { ...shade, ellipsis: true }), maxWidth: width - ROW_PX - 30 },
          Boolean(row.person.tag) &&
            words(`[${row.person.tag}]`, 2, row.dim ? INK.faint : 'rgba(242,239,230,0.7)', shade),
        ],
      },
      words(row.words, 1, row.dim ? INK.faint : 'rgba(242,239,230,0.78)', { ...shade, ellipsis: true }),
    ],
  };
  const body: Node = row.dim
    ? {
        width: 'grow',
        height: ROW_PX,
        fill: '#2a2c31',
        gap: 10,
        alignY: 'center',
        padding: [0, 10, 0, 0],
        children: [sign, named],
      }
    : plateNode(emblem, ROW_PX, 0, [sign, named], { direction: 'row', gap: 10, padding: [0, 10, 0, 0] });
  return {
    id,
    press: true,
    width: 'grow',
    height: ROW_PX,
    label: `${nameWithTag(row.person)}${row.leads ? ', company leader' : ''}, ${row.words}`,
    children: [
      body,
      (chosen || lit) && {
        width: 'grow',
        height: 'grow',
        float: { to: 'parent' },
        outline: { width: 2, colour: chosen ? '#f2efe6' : INK.brassLit },
      },
    ],
  };
}

/** An empty place in a column, which keeps its length as Destiny's does; the first may say why it is empty. */
const blankNode = (said: string | null): Node => ({
  width: 'grow',
  height: ROW_PX,
  padding: [0, 0, 0, 14],
  alignY: 'center',
  fill: 'rgba(0,0,0,0.22)',
  outline: { width: 1, colour: 'rgba(255,255,255,0.05)' },
  children: [said !== null && words(said, 1, INK.faint)],
});

/** The Roster's page: asked of the accounts as it is made (each time Social opens), drawn each frame from what came. */
export class RosterPage {
  private roster: Roster | null = null;
  /** Why the Roster could not be had, while none has come. */
  private failure: string | null = null;
  private panel: Panel | null = null;
  /** Another player's details, by their name: null while they are asked, or why they could not be had. */
  private details: { readonly name: string; found: Details | string | null } | null = null;
  /** The row a player's details were opened from, given the focus again once they close. */
  private detailedFrom: string | null = null;
  private readonly pages: Record<Column, number> = { game: 0, friends: 0, guild: 0 };
  private busy = false;
  /** How many times the Roster was asked for: only the latest answer is shown. */
  private asked = 0;
  private lookedAt = 0;
  /** Rows a page: the picture's fourteen where the menu is tall enough, fewer where it is not. */
  private rowsAPage = ROWS_A_PAGE;
  private said = '';
  /** What takes the focus on the next frame, and whether it is the panel's first press. */
  private focusNext: string | null = null;
  private focusPanel = false;
  private ui: Interface | null = null;
  private readonly link: AccountLink;
  private readonly travel: (place: string) => string | null;
  private readonly now: () => number;
  private readonly hidden: () => boolean;

  constructor(given: RosterWith) {
    this.link = given.link;
    this.travel = given.travel;
    this.now = given.now ?? (() => performance.now());
    this.hidden = given.hidden ?? (() => document.hidden);
    this.look();
  }

  private say(said: string): void {
    this.said = said;
    if (said) announce(said);
  }

  private look(): void {
    const mine = ++this.asked;
    this.lookedAt = this.now();
    void this.link.roster().then((answer) => {
      if (mine !== this.asked) return;
      dispatchEvent(new CustomEvent(ROSTER_HEARD, { detail: answer }));
      // A Roster already shown stays, the failure said under it; with none, the failure stands in its place, with a
      // press to ask again.
      if (typeof answer === 'string') {
        if (this.roster) this.say(answer);
        else this.failure = answer;
        return;
      }
      [this.roster, this.failure] = [answer, null];
      // A row's panel whose player is no longer listed closes.
      const panel = this.panel;
      if (panel?.kind === 'row' && !this.rows().some((each) => each.key === panel.key)) this.closePanel();
    });
  }

  private rows(): Row[] {
    const roster = this.roster;
    return roster ? [...gameRows(roster), ...friendRows(roster), ...guildRows(roster)] : [];
  }

  private openPanel(panel: Panel): void {
    this.panel = panel;
    this.focusPanel = true;
    // The interface keeps a field's words across frames: each panel opens with its fields empty.
    for (const id of FIELD_IDS) this.ui?.setFieldText(id, '');
  }

  private closePanel(): void {
    const panel = this.panel;
    // The focus goes back to what opened the panel, if it was in the panel.
    if (panel && isPanelPart(this.ui?.focusedId ?? null)) this.focusNext = panel.at;
    this.panel = null;
  }

  /** Escape's step on the page: the panel closes, or the details; false when there is neither. */
  back(): boolean {
    if (this.panel) this.closePanel();
    else if (this.details) this.toColumns();
    else return false;
    return true;
  }

  private toColumns(): void {
    this.details = null;
    this.focusNext = this.detailedFrom;
  }

  private showDetails(name: string): void {
    this.detailedFrom = this.panel?.at ?? null;
    this.panel = null;
    this.said = '';
    const details: { readonly name: string; found: Details | string | null } = { name, found: null };
    this.details = details;
    this.focusNext = DETAILS_BACK;
    void this.link.details(name).then((found) => (details.found = found));
  }

  /** Goes to a company member where they play now, as the Roster has them, unless that is here. */
  private goTo(person: Person): void {
    void this.link.roster().then((fresh) => {
      const known = typeof fresh === 'string' ? this.roster : fresh;
      const place = known?.company?.members.find((each) => each.name === person.name)?.place ?? person.place;
      if (place && place !== known?.me?.place) this.say(this.travel(place) ?? '');
    });
  }

  /** Asks the Roster something; then, if it was a join, goes to where the player is. */
  private doing(action: Action, person: Person | null): void {
    if (this.busy || !action.path) return;
    this.busy = true;
    void this.link
      .social(action.path, action.body ?? {})
      .then((why) => {
        this.say(why ?? `${action.label}: done.`);
        if (why !== null) return;
        this.closePanel();
        if (action.opens === 'join' && person) this.goTo(person);
      })
      .finally(() => {
        this.busy = false;
        this.look();
        // The company on the heads-up display hears of it at once.
        dispatchEvent(new Event('overlook:company'));
      });
  }

  /** The page this frame. */
  node(context: PlainContext): Node {
    const { ui } = context;
    this.ui = ui;
    if (this.focusNext !== null) [this.focusNext] = [null, ui.focusOn(this.focusNext)];
    // Asked again only while it is seen, and never while a panel is open, whose held presses a new answer would move.
    if (this.now() - this.lookedAt >= LOOK_MS && !this.hidden() && !this.panel) this.look();
    const details = this.details;
    const roster = this.roster;
    // Under the details as under the columns: what was said, and who is playing.
    if (details)
      return {
        width: 'grow',
        direction: 'column',
        children: [this.detailsPage(context, details), ...(roster ? this.footNodes(roster) : [])],
      };
    if (!roster) {
      const failure = this.failure;
      return noteNode(
        context,
        failure ?? '',
        failure === null ? [] : [this.press(ui, 'roster-again', 'Try again', () => this.look())],
      );
    }
    this.fitRows(context);
    const width = Math.max(120, Math.floor((context.room.width - 8 - 2 * COLUMN_GAP) / 3));
    const rows: Record<Column, Row[]> = {
      game: gameRows(roster),
      friends: friendRows(roster),
      guild: guildRows(roster),
    };
    return {
      id: PAGE_ID,
      width: 'grow',
      direction: 'column',
      padding: [6, 4, 0, 4],
      children: [
        {
          gap: COLUMN_GAP,
          children: COLUMNS.map((column) => this.columnNode(context, column, rows[column], roster, width)),
        },
        ...this.footNodes(roster),
        this.panelNode(context, roster),
      ],
    };
  }

  /** What the Roster last said, and how many friends play and guests are near. */
  private footNodes(roster: Roster): Child[] {
    const playing = roster.friends.filter((each) => each.place !== null).length;
    let online = `${playing} ${playing === 1 ? 'friend' : 'friends'} playing`;
    if (roster.guests > 0) online += ` · ${roster.guests} ${roster.guests === 1 ? 'guest' : 'guests'} nearby`;
    return [
      this.said !== '' && { width: 'grow', padding: [10, 4, 0, 4], children: [answerNode(this.said)] },
      { width: 'grow', alignX: 'end', padding: [10, 4, 0, 4], children: [words(online, 1, INK.faint)] },
    ];
  }

  /** Fits the rows a page to the menu's height, so the columns never scroll. */
  private fitRows({ ui, room }: PlainContext): void {
    const laid = ui.boxOf(PAGE_ID);
    if (!laid) return;
    const spare = room.height - laid.height;
    this.rowsAPage = Math.max(ROWS_LEAST, Math.min(ROWS_A_PAGE, this.rowsAPage + Math.floor(spare / ROW_STEP_PX)));
  }

  /** A press with words, at the page's size. */
  private press(ui: Interface, id: string, said: string, run: () => void): Node {
    return button(ui, id, said, run, { padding: PRESS_PADDING });
  }

  private columnNode(context: PlainContext, column: Column, rows: readonly Row[], roster: Roster, width: number): Node {
    const { ui } = context;
    const count = pagesOf(rows, this.rowsAPage);
    this.pages[column] = Math.min(this.pages[column], count - 1);
    const page = this.pages[column];
    const arrows = ([-1, 1] as const).map((step): Node => {
      const id = `roster-page-${column}-${step < 0 ? 'back' : 'next'}`;
      const none = step < 0 ? page === 0 : page >= count - 1;
      if (ui.clicked(id) && !none) this.pages[column] = page + step;
      return {
        id,
        // A column of one page has no other to turn to, so its arrows are not stops for the keys.
        press: count > 1,
        role: 'button',
        ...(none && { state: 'disabled' }),
        label: `${TITLES[column]}: ${step < 0 ? 'the page before' : 'the next page'}`,
        width: 33,
        height: 33,
        alignX: 'center',
        alignY: 'center',
        children: [svgNode(`roster-arrow ${step}`, arrowSvg(step), 10)],
      };
    });
    const shown = rows.slice(page * this.rowsAPage, (page + 1) * this.rowsAPage);
    const empty = column === 'friends' ? 'No friends yet.' : column === 'guild' ? 'In no guild yet.' : '';
    const blanks: Node[] = [];
    // The page's empty rows stand as Destiny's do, so every column keeps its length.
    for (let blank = shown.length; blank < this.rowsAPage; blank++)
      blanks.push(blankNode(rows.length === 0 && blank === 0 && empty ? empty : null));
    for (const row of shown) if (ui.clicked(rowId(row))) this.choose(row);
    return {
      role: 'panel',
      width,
      direction: 'column',
      gap: 8,
      padding: [12, 14, 14, 14],
      children: [
        {
          width: 'grow',
          gap: 6,
          alignY: 'end',
          children: [
            {
              width: 'grow',
              direction: 'column',
              gap: 2,
              children: [
                words(TITLES[column].toUpperCase(), 2, INK.word, { tracking: 5 }),
                words(`Page ${page + 1} / ${count}`, 1, INK.faint),
              ],
            },
            ...arrows,
          ],
        },
        this.topNode(ui, column, roster),
        {
          width: 'grow',
          direction: 'column',
          gap: 2,
          children: [...shown.map((row) => rowNode(ui, row, this.panel?.at === rowId(row), width - 28)), ...blanks],
        },
      ],
    };
  }

  private choose(row: Row): void {
    if (this.panel?.at === rowId(row)) return this.closePanel();
    this.openPanel({ kind: 'row', at: rowId(row), key: row.key });
  }

  /** What heads each column: the company's privacy; adding a friend; the guild, or founding one. */
  private topNode(ui: Interface, column: Column, roster: Roster): Node {
    const id = topId(column);
    const said =
      column === 'game'
        ? `Company: ${roster.privacy}`
        : column === 'friends'
          ? 'Add a friend'
          : roster.guild
            ? `[${roster.guild.tag}] ${roster.guild.name}`
            : 'Found a guild';
    const invites = column === 'guild' && !roster.guild ? roster.guildInvites.length : 0;
    if (ui.clicked(id)) {
      this.openPanel({ kind: column, at: id });
    }
    return {
      id,
      press: true,
      role: 'button',
      width: 'grow',
      padding: PRESS_PADDING,
      gap: 8,
      alignX: 'center',
      alignY: 'center',
      label: invites > 0 ? `${said}, ${invites} ${invites === 1 ? 'guild invite' : 'guild invites'}` : said,
      children: [
        { text: { words: said } },
        invites > 0 && { padding: [0, 6], fill: INK.brassLit, children: [words(String(invites), 1, INK.ground)] },
      ],
    };
  }

  /** The panel beside what opened it, inside the page: under it, or over it where there is no room under it. */
  private panelNode(context: PlainContext, roster: Roster): Node | null {
    const panel = this.panel;
    if (!panel) return null;
    const { ui } = context;
    const built = panelParts(context, roster, panel, {
      doing: (action, person) => this.doing(action, person),
      details: (name) => this.showDetails(name),
      travel: (person) => {
        this.closePanel();
        this.goTo(person);
      },
      open: (opened) => this.openPanel(opened),
    });
    if (!built) {
      this.panel = null;
      return null;
    }
    const near = ui.boxOf(panel.at);
    const page = ui.boxOf(PAGE_ID);
    const seen = ui.boxOf('gear-body') ?? page;
    const tall = ui.boxOf(PANEL_ID)?.height ?? 0;
    // What opened it no longer shows (its row's page turned away): the panel closes, as it can stand beside nothing.
    if (!near || !page || !seen) {
      this.panel = null;
      return null;
    }
    const left = Math.min(near.x - page.x + near.width * 0.4, page.width - PANEL_PX);
    const fitsBelow = near.y + near.height + 2 + tall <= seen.y + seen.height;
    const top = fitsBelow ? near.y + near.height + 2 : Math.max(page.y, near.y - tall - 2);
    // The heading's first line is who or what it is for, larger; the rest is said under it.
    const [title = '', ...rest] = built.heading.split('\n');
    const parts = built.parts;
    if (this.focusPanel) {
      this.focusPanel = false;
      this.focusNext = firstTaking(parts);
    }
    return {
      id: PANEL_ID,
      role: 'panel',
      fill: INK.ground,
      width: PANEL_PX,
      direction: 'column',
      gap: 4,
      padding: [0, 10, 10, 10],
      solid: true,
      label: built.heading.replace('\n', ', '),
      // Measured once laid, it shows from the next frame, where it fits.
      opacity: tall > 0 ? 1 : 0,
      float: { to: 'screen', x: page.x + Math.max(0, left), y: top, z: 30 },
      children: [
        {
          width: PANEL_PX,
          direction: 'column',
          gap: 4,
          padding: [10, 10, 8, 10],
          offset: [-10, 0],
          fill: '#2f3137',
          children: [
            { ...words(title, 2, INK.word, { ellipsis: true }), maxWidth: PANEL_PX - 20 },
            ...rest.map((line) => words(line, 1, INK.faint)),
          ],
        },
        { height: 2 },
        ...parts,
      ],
    };
  }

  /** Another player's details, or the words while they come or why they could not, with a way back either way. */
  private detailsPage(context: PlainContext, details: { readonly found: Details | string | null }): Node {
    const back = () => this.toColumns();
    const found = details.found;
    if (found !== null && typeof found !== 'string') return detailsNode(context, found, back);
    if (context.ui.clicked(DETAILS_BACK)) back();
    return noteNode(context, found ?? 'Loading…', [
      pressNode(DETAILS_BACK, 'Back', 'button', 'Esc', 1, { padding: [6, 14] }),
    ]);
  }
}

/** The first of `nodes` (or of what they hold) that takes the focus: a press or a field. */
function firstTaking(nodes: readonly Child[]): string | null {
  for (const node of nodes) {
    if (!node) continue;
    if (node.id && (node.press || node.field)) return node.id;
    const inner = firstTaking(node.children ?? []);
    if (inner !== null) return inner;
  }
  return null;
}

/** Words in the middle of the page, with presses under them: while the Roster or a player's details come, or why
 *  they could not. */
function noteNode({ sizes }: PlainContext, said: string, presses: readonly Child[]): Node {
  return {
    width: 'grow',
    alignX: 'center',
    padding: [48, 0],
    children: [
      {
        maxWidth: 420,
        direction: 'column',
        alignX: 'center',
        gap: 12,
        children: [
          said !== '' && { text: { words: said, size: sizes.name, colour: INK.faint, align: 'center' } },
          ...presses,
        ],
      },
    ],
  };
}

/** The Social page: the Roster, or, playing offline, why there is none. */
export function socialPage(context: PlainContext, roster: RosterPage | null): Node {
  return roster ? roster.node(context) : noteNode(context, 'The Roster needs an account. You are playing offline.', []);
}
