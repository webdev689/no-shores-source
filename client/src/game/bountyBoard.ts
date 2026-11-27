// The bounty board's screen in the menu, drawn by the game, opened at its counter in Overlook's plaza, after
// Destiny's Bounty Tracker and laid in a keeper's frame (npc/keeperFrame.ts): the board itself at the left where a
// keeper stands, its name and words at the foot; at the top right its mark and what the player holds, and under it the
// day's bounties under "Available bounties" in a row to each kind (the town's eight, the passages' two after its six,
// then the pledged faction's three), and the time to the next board at the foot.
// The card of the tile pointed at or holding the keys floats beside it, and each bounty is taken and turned in there by
// the day of the board shown. Nothing here judges a rule: the room refuses what the board no longer offers.
import factions from '../../../content/gear/factions.json' with { type: 'json' };
import { ASKS, type GearAsk, type GearState } from '../network/gearMessages.ts';
import { SLOTS, WORN } from '../player/gear.ts';
import type { Child, Node } from '../ui/node.ts';
import { roomNow } from '../sky/worldClock.ts';
import { factionNamed, posterEmblem } from './bountyFaces.ts';
import { GOLD, boardFigure, boardMark } from './bountyStage.ts';
import { bountyCardNode, bountyTileNode, lockedTileNode, shutCardNode } from './bountyTiles.ts';
import { nameCard } from './gearCard.ts';
import { type Hint, INK, emblemNode, glyphNode, label, words } from './gearNodes.ts';
import { countdownWords } from './journalWords.ts';
import type { MenuContext } from './menuPage.ts';
import { reputationOf } from './npc/factionRows.ts';
import { bodyWidth, crestNode, keeperFrame, stageOf } from './npc/keeperFrame.ts';

const SHUT = 'The bounty board opens after the prologue.';
const LOCKED = 'Pledge to a faction at its counter in Overlook to take its bounties.';
/** The board's screen's name, as the menu's header and its stage show it: no keeper keeps it. */
export const BOARD_TITLE = 'The Bounty Board';
/** What the board says of itself, as a keeper's words. */
const BOARD_WORDS = 'When Overlook needs a hand, it posts a bounty here. The factions post their own.';
/** How many bounties a faction posts a day. */
const FACTION_BOUNTIES = 3;
/** The cloak's slot, where a faction's cape is worn. */
const SLOT_CLOAK = SLOTS.indexOf('cloak');

export interface BountyRow {
  /** Its place on the board, which its asks name: the town's 0 to 5, then each faction's three, then the passages'
   *  two (the town's) at 15 and 16. */
  readonly place: number;
  readonly words: string;
  readonly name: string;
  /** Where it counts: 0 on land, 1 at sea, 2 in dungeons, 3 in the passages. */
  readonly pool: number;
  /** Its tier, 1 to 3, by how big a task it is. */
  readonly tier: number;
  /** The faction that posts it, by its number; 0 the town's. */
  readonly faction: number;
  /** One line of its tale, as its card shows under its task. */
  readonly tale: string;
  readonly count: number;
  readonly target: number;
  /** "12/30" while held, "Turned in" once paid, else empty. */
  readonly progress: string;
  readonly state: 'open' | 'held' | 'done' | 'paid';
  /** What its press asks, with the gear's day: Take on one not held, Turn in on one done; none otherwise or before
   *  the prologue. */
  readonly press: { readonly label: 'Take' | 'Turn in'; readonly ask: GearAsk } | null;
}

/** The day's bounties as they stand for the player, in the order the gear carries them; none from a room that sends
 *  no board. */
export function bountyRows(gear: GearState): readonly BountyRow[] {
  const open = gear.prologueDone !== false;
  const day = gear.day ?? 0;
  return (gear.bounties ?? []).map((bounty) => {
    const { count, target, place } = bounty;
    const state = bounty.paid ? 'paid' : !bounty.held ? 'open' : count >= target ? 'done' : 'held';
    const progress = state === 'paid' ? 'Turned in' : state === 'open' ? '' : `${count}/${target}`;
    const press =
      !open || state === 'held' || state === 'paid'
        ? null
        : state === 'open'
          ? { label: 'Take' as const, ask: { kind: ASKS.takeBounty, node: place, item: day } }
          : { label: 'Turn in' as const, ask: { kind: ASKS.turnInBounty, node: place, item: day } };
    const { words, name, pool, tier, faction, tale } = bounty;
    return { place, words, name, pool, tier, faction, tale, count, target, progress, state, press };
  });
}

/** What a bounty pays the player now, at their level: its XP, and the town's Aurem or a faction's reputation. */
export interface Pay {
  readonly xp: number;
  readonly aurem: number;
  readonly reputation: number;
}

/** What a bounty pays the player now, as the room's word on their gear says a first tier's: its tier's share of it,
 *  once, half again or twice, rounded down as the rules round it (`gear::bounties::bounty_pay`); a faction's its
 *  reputation in the Aurem's place, whatever the level (`faction_bounty_reputation`). */
export function payOf(gear: GearState, row: BountyRow): Pay {
  const share = (amount: number): number => Math.floor((amount * (Math.min(3, Math.max(1, row.tier)) + 1)) / 2);
  const town = row.faction === 0;
  return {
    xp: share(gear.bountyXp ?? 0),
    aurem: town ? share(gear.bountyAurem ?? 0) : 0,
    reputation: town ? 0 : share(factions.bountyReputation),
  };
}

/** Whether a faction's bounty counts now: the player pledged to it and wearing its cape, as the room counts it. */
export function serves(gear: GearState, faction: number): boolean {
  const cape = factionNamed(faction)?.cape;
  if (!cape || gear.standing?.pledge !== faction) return false;
  return gear.items.some((item) => item.at === WORN + SLOT_CLOAK && item.named === cape);
}

/** What a bounty's card says along its foot at the board: a click or E takes one open, turns in one done. */
const boardHints = (row: BountyRow): readonly Hint[] => (row.press ? [['Click / E', row.press.label]] : []);

/** What a tile reads to a screen reader beyond its name, task and state: what it pays, whether a faction's counts
 *  now, and what pressing it does, or why the board is shut. */
function heard(gear: GearState, row: BountyRow, shut: boolean): string {
  if (shut) return SHUT;
  const pay = payOf(gear, row);
  const faction = row.faction === 0 ? null : factionNamed(row.faction);
  const earned = faction
    ? `${pay.reputation.toLocaleString('en')} ${faction.name.replace(/^The /, '')} reputation`
    : `${pay.aurem.toLocaleString('en')} Aurem`;
  const counts = faction
    ? serves(gear, row.faction)
      ? ' Counts now.'
      : ' Counts only while pledged to them and wearing their cape.'
    : '';
  const press = row.press ? ` Press to ${row.press.label === 'Take' ? 'take it' : 'turn it in'}.` : '';
  return `Pays ${pay.xp.toLocaleString('en')} XP and ${earned}.${counts}${press}`;
}

/** The currencies' ids, whose cards name them. */
const COINS = ['board-aurem', 'board-rank'] as const;

/** What shows its card, as the menu shows one: what the pointer rests on, else what holds the keys' focus; none
 *  otherwise. */
function shownOf(context: MenuContext, ids: readonly string[]): string | null {
  const { ui } = context;
  return ids.find((id) => ui.hovered(id)) ?? ids.find((id) => ui.focused(id) && ui.keyFocused) ?? null;
}

/** The currencies at the top right: Aurem, and the pledged faction's rank by its emblem, each named by its card while
 *  it is the one `shown`. */
function purseNode(context: MenuContext, shown: string | null): Node {
  const { gear, sizes } = context;
  const pledge = gear.standing?.pledge ?? 0;
  const faction = pledge === 0 ? null : factionNamed(pledge);
  const coin = (id: string, mark: Node, said: string, named: string): Node => {
    if (id === shown) context.card(id, () => nameCard(sizes, named));
    // It hears E too, so E acts on the bounty whose card shows wherever the focus rests on the board.
    const children = [mark, words(said, 2, INK.word)];
    return { id, focusable: true, keys: ['e'], gap: 6, alignY: 'center', label: named, children };
  };
  const aurem = gear.aurem.toLocaleString('en');
  const standing = faction ? reputationOf(pledge, gear.standing) : null;
  return {
    gap: 22,
    wrap: true,
    alignY: 'center',
    children: [
      coin('board-aurem', glyphNode('aurem', 22), aurem, `${aurem} Aurem`),
      faction &&
        standing &&
        coin(
          'board-rank',
          emblemNode(posterEmblem(pledge), 'sign', 24, 24, 24),
          `Rank ${standing.rank}`,
          `${faction.name}: ${standing.words}`,
        ),
    ],
  };
}

/** The foot's countdown to the next board, to the second, by the rules' clock. */
function footNode(until: number | null, size: number, width: number): Node {
  return {
    id: 'board-refresh',
    role: 'well',
    width,
    padding: [6, 13],
    gap: 11,
    alignY: 'center',
    label: until === null ? 'New bounties at the daily reset' : `New bounties in ${countdownWords(until)}`,
    children: [
      { text: { words: 'NEW BOUNTIES', size, tracking: 2 } },
      words(until === null ? '' : countdownWords(until), size, INK.word, { tracking: 2 }),
    ],
  };
}

/** The bounty board's screen: the board on its stage, and beside it its words and purse, "Available bounties" with the
 *  town's eight in a row (the passages' two after its six) and the pledged faction's three under them (or three
 *  locked slots while pledged to none), and under them the time to the next board, all in a scroll of their own. The
 *  tile pointed at or holding the keys shows its card; a click, Enter or E on a tile takes or turns it in, E the one
 *  whose card shows; the arrows move between tiles. Before the prologue the tiles rest grey and their cards say why. */
export function boardPage(context: MenuContext, resetAt: () => number | null, now = roomNow): Node {
  const { ui, gear, room, sizes } = context;
  const wide = sizes.name > 1 && sizes.label > 1;
  const shut = gear.prologueDone === false;
  const pledge = gear.standing?.pledge ?? 0;
  const rows = bountyRows(gear);
  const idOf = (row: BountyRow) => `bounty-${row.place}`;
  const ids = rows.map(idOf);
  const locks = Array.from({ length: pledge === 0 ? FACTION_BOUNTIES : 0 }, (unused, slot) => `bounty-locked-${slot}`);
  const shown = shownOf(context, [...ids, ...locks, ...COINS]);
  const shownRow = rows.find((row) => idOf(row) === shown) ?? null;
  // E reaches the press holding the focus (a tile, a padlock or a coin, each hearing it) and acts on the bounty whose
  // card shows, as its keycap says, and on none while no bounty's card shows. Nothing is focused for the player, so
  // the pad's A or Enter never takes a bounty unseen.
  const keyed = [...ids, ...locks, ...COINS].some((id) => ui.keysOn(id).includes('e'));
  const pressed = rows.find((row) => ui.clicked(idOf(row))) ?? (keyed ? shownRow : null);
  if (!shut && pressed?.press) context.ask(pressed.press.ask);
  const tile = (row: BountyRow): Node => {
    const id = idOf(row);
    if (id === shown)
      context.card(id, () =>
        shut
          ? shutCardNode(row.name, SHUT, sizes)
          : bountyCardNode(row, payOf(gear, row), sizes, {
              hints: boardHints(row),
              serving: serves(gear, row.faction),
              ...(row.state === 'paid' && { said: { words: 'Turned in', icon: 'taken' } }),
            }),
      );
    const lit = ui.hovered(id) || (ui.focused(id) && ui.keyFocused);
    return bountyTileNode(row, id, wide, { lit, shut, press: true, heard: heard(gear, row, shut) });
  };
  const town = rows.filter((row) => row.faction === 0).map(tile);
  // The pledged faction's three, then any other's held today; three locked slots while pledged to none.
  const theirs = rows.filter((row) => row.faction !== 0).map(tile);
  const locked = locks.map((id) => {
    if (id === shown) context.card(id, () => shutCardNode('Faction bounties', shut ? SHUT : LOCKED, sizes));
    return lockedTileNode(id, wide);
  });
  const stage = stageOf(room);
  const narrow = stage.narrow;
  const text = sizes.label;
  const width = bodyWidth(room, text);
  const gap = wide ? 8 : 6;
  const row = (children: readonly Child[]): Node => ({ gap, wrap: true, children });
  const reset = resetAt();
  const mark = boardMark(text > 1 ? 76 : 56);
  const crest = crestNode(
    mark,
    { share: null, named: '' },
    purseNode(context, shown),
    GOLD,
    Math.min(width, 520),
    text,
  );
  return keeperFrame(
    room,
    text,
    {
      glow: GOLD,
      figure: boardFigure(stage.width, stage.height),
      role: "Overlook's bounties",
      name: BOARD_TITLE,
      about: BOARD_WORDS,
      crest,
      body: [
        {
          // Its own scroll, so on a short screen the faction's row and the time to the next board can be reached.
          id: 'board-bounties',
          width: 'grow',
          height: 'grow',
          scroll: true,
          direction: 'column',
          gap,
          padding: [11, 0, 0, 0],
          children: [
            {
              width: 'grow',
              direction: 'column',
              gap: 4,
              padding: [0, 0, 6, 0],
              children: [
                label('Available bounties', narrow ? text : text + 1, INK.word),
                { width: 'grow', height: 1, fill: 'rgba(163,152,128,0.26)' },
              ],
            },
            { direction: 'column', gap, opacity: shut ? 0.6 : 1, children: [row(town), row([...theirs, ...locked])] },
            {
              padding: [gap, 0, 0, 0],
              children: [footNode(reset === null ? null : reset - now(), text, Math.min(wide ? 880 : 572, width))],
            },
          ],
        },
      ],
    },
    'board',
  );
}
