// The bounty board's screen in the menu, drawn by the game, opened at its counter in Overlook's plaza, after
// Destiny's Bounty Tracker: the day's six as tiles in a row a kind, a bar counting to the next board, and the card of
// the tile chosen, each bounty taken and turned in there by the day of the board shown. Nothing here judges a rule:
// the room refuses what the board no longer offers.
import { ASKS, type GearAsk, type GearState } from '../network/gearMessages.ts';
import type { Child, Node } from '../ui/node.ts';
import { roomNow } from '../sky/worldClock.ts';
import { bountyCardNode, bountyTileNode, chosenTile, stateLine } from './bountyTiles.ts';
import { INK, pressNode, words } from './gearNodes.ts';
import { iconNode } from './journalIcons.ts';
import { countdownWords } from './journalWords.ts';
import type { MenuContext } from './menuPage.ts';

const SHUT = 'The bounty board opens after the prologue.';
/** The board's screen's name, as the menu's header shows it: no keeper keeps it. */
export const BOARD_TITLE = 'The Bounty Board';
const DAY_MS = 86_400_000;

export interface BountyRow {
  readonly place: number;
  readonly words: string;
  readonly name: string;
  /** Where it counts: 0 on land, 1 at sea, 2 in dungeons. */
  readonly pool: number;
  readonly count: number;
  readonly target: number;
  /** "12 / 30" while held, "Turned in" once paid, else empty. */
  readonly progress: string;
  readonly state: 'open' | 'held' | 'done' | 'paid';
  /** What its press asks, with the gear's day: Take on one not held, Turn in on one done; none otherwise or before
   *  the prologue. */
  readonly press: { readonly label: 'Take' | 'Turn in'; readonly ask: GearAsk } | null;
}

/** The day's bounties as they stand for the player, in the board's order; none from a room that sends no board. */
export function bountyRows(gear: GearState): readonly BountyRow[] {
  const open = gear.prologueDone !== false;
  const day = gear.day ?? 0;
  return (gear.bounties ?? []).map((bounty, place) => {
    const { count, target } = bounty;
    const state = bounty.paid ? 'paid' : !bounty.held ? 'open' : count >= target ? 'done' : 'held';
    const progress = state === 'paid' ? 'Turned in' : state === 'open' ? '' : `${count}/${target}`;
    const press =
      !open || state === 'held' || state === 'paid'
        ? null
        : state === 'open'
          ? { label: 'Take' as const, ask: { kind: ASKS.takeBounty, node: place, item: day } }
          : { label: 'Turn in' as const, ask: { kind: ASKS.turnInBounty, node: place, item: day } };
    const { words, name, pool } = bounty;
    return { place, words, name, pool, count, target, progress, state, press };
  });
}

/** What each bounty pays the player now, at their level: its XP and its Aurem. */
export interface Pay {
  readonly xp: number;
  readonly aurem: number;
}

/** What each bounty pays the player now, as the room's word on their gear says it. */
export const payOf = (gear: GearState): Pay => ({ xp: gear.bountyXp ?? 0, aurem: gear.bountyAurem ?? 0 });

/** A bounty's state in words: its count while held, done, turned in, or not taken. */
export function bountyWords(row: BountyRow): string {
  const said = { open: 'Not taken', done: 'Done. Turn it in at the board.', paid: 'Turned in' } as const;
  return row.state === 'held' ? row.progress : said[row.state];
}

/** The tile last chosen on the board, kept as the screen is built again each frame. */
let chosenPlace: number | null = null;

/** The next board: the rising sun and the time left, over a bar filling as the day goes. */
function nextBoard(until: number | null, size: number): Node {
  const share = until === null ? 0 : Math.min(1, Math.max(0, 1 - until / DAY_MS));
  const left = until === null ? '' : countdownWords(until);
  return {
    width: 'grow',
    direction: 'column',
    gap: 8,
    padding: [4, 0, 0, 0],
    label: until === null ? 'New bounties at the daily reset' : `New bounties in ${left}`,
    children: [
      { gap: 8, alignY: 'center', children: [iconNode('dawn', 24), words(left, size + 1, INK.gain)] },
      {
        role: 'track',
        width: 'grow',
        height: 8,
        bevel: 1,
        padding: 1,
        children: [{ width: `${Math.round(share * 100)}%`, height: 'grow', fill: '#7a5424' }],
      },
    ],
  };
}

/** The bounty board's screen: one line, the day's six in a row a kind, the bar counting to the next board, and the
 *  chosen tile's card with its press, E, Enter or a click on a tile taking or turning it in; the arrows move between
 *  tiles. Before the prologue the tiles rest grey and the card says why. */
export function boardPage(context: MenuContext, resetAt: () => number | null, now = roomNow): Node {
  const { gear, ui, sizes } = context;
  const rows = bountyRows(gear);
  const shut = gear.prologueDone === false;
  const ids = new Map(rows.map((row) => [row.place, `bounty-${row.place}`]));
  chosenPlace = chosenTile(ui, ids, chosenPlace);
  for (const row of rows) {
    const id = `bounty-${row.place}`;
    if (!shut && row.press && (ui.clicked(id) || ui.keysOn(id).includes('e'))) context.ask(row.press.ask);
  }
  const chosen = rows.find((row) => row.place === chosenPlace) ?? null;
  if (!shut && chosen?.press && ui.clicked('board-press')) context.ask(chosen.press.ask);
  const foot = (row: BountyRow): Child => {
    if (!row.press) return row.state === 'paid' ? stateLine('Turned in', 'taken', sizes.label) : null;
    const { label } = row.press;
    const role = label === 'Turn in' ? 'primary' : 'button';
    return pressNode('board-press', label, role, 'E', sizes.label, { label: `${label}: ${row.name}` });
  };
  const card: Node = shut
    ? { id: 'bounty-card', role: 'panel', width: 260, padding: [12, 14], children: [stateLine(SHUT, 'locked')] }
    : chosen
      ? bountyCardNode(chosen, payOf(gear), foot(chosen), 260, sizes.label)
      : { width: 260, text: { words: 'Six a day, from the board in Overlook’s plaza.', colour: INK.faint } };
  const tiles = [0, 1, 2].map((pool): Node => ({
    gap: 8,
    children: rows
      .filter((row) => row.pool === pool)
      .map((row) => {
        const id = `bounty-${row.place}`;
        const lit = ui.hovered(id) || (ui.focused(id) && ui.keyFocused);
        return bountyTileNode(row, id, 80, row.place === chosenPlace, lit, shut);
      }),
  }));
  const reset = resetAt();
  return {
    width: 'grow',
    alignX: 'center',
    padding: [24, 0],
    children: [
      {
        id: 'board',
        role: 'panel',
        direction: 'column',
        gap: 8,
        padding: [18, 22],
        children: [
          { padding: [0, 0, 6, 0], text: { words: 'Bounties for XP and Aurem, posted each day.', colour: INK.faint } },
          {
            gap: 24,
            wrap: true,
            children: [
              {
                direction: 'column',
                gap: 8,
                opacity: shut ? 0.5 : 1,
                children: [...tiles, nextBoard(reset === null ? null : reset - now(), sizes.label)],
              },
              card,
            ],
          },
        ],
      },
    ],
  };
}
