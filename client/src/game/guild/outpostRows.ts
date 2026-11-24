// The rows an outpost's works show on the Outposts page, at a glance and on the work's own panel: the Counting House's
// strongbox, the Island Camp's and the Dockyard's stores, and the War Horn; and what the treasury can pay or hold, in
// the accounts' own words, so the page greys a press the accounts would refuse and says why.

import resources from '../../../../content/gear/resources.json' with { type: 'json' };
import type { OutpostFace } from '../../network/accounts.ts';
import { ASKS, type GearAsk, type GearState } from '../../network/gearMessages.ts';
import type { Child, Node } from '../../ui/node.ts';
import type { Interface } from '../../ui/ui.ts';
import { INK, label, pressNode, words } from '../gearNodes.ts';
import { hintNode } from '../menuPages.ts';
import { counted } from './guildHome.ts';
import {
  STORES_TAKE_A_DAY,
  STRONGBOX_HOURS,
  STUFFS,
  type Stuff,
  TREASURY_MOST,
  strongboxRateOf,
} from './outpostLaw.ts';
import { stuffName } from './outpostPlan.ts';

export const COLLECT_ID = 'outpost-collect';
export const HORN_ID = 'outpost-horn';
export const takeId = (stuff: Stuff) => `outpost-take-${stuff}`;
/** A row's press's width at the first label step, so a part's presses line up. */
export const PRESS_PX = 190;

/** What an ask says once the accounts take it: fixed words, or words made from their answer. */
export type Said = string | ((answer: Readonly<Record<string, unknown>>) => string);

/** What the rows may do: ask the accounts, and ask the room the player stands in. */
export interface RowActs {
  social(path: string, body: Readonly<Record<string, unknown>>, said: Said, changes: boolean): void;
  room(ask: GearAsk): void;
}

/** A material's number in an outpost's asks of the room (`ASKS.outpostDeliver`). */
export const STUFF_SLOTS: Readonly<Record<Stuff, number>> = { timber: 0, canvas: 1, iron: 2, heartwood: 3, island: 4 };

/** What taking back something that cost `spent` gives the treasury: half, as much of it as the treasury holds. */
export function backOf(treasury: number, spent: number): number {
  return Math.max(0, Math.min(Math.floor(spent / 2), TREASURY_MOST - treasury));
}

/** How much of a material the player carries, from the room's word on their gear; null where no word is heard (at
 *  sea, or offline), when the page cannot say. */
export function heldOf(gear: GearState | null | undefined, stuff: Stuff, island: string): number | null {
  if (!gear) return null;
  if (stuff !== 'island') return gear.ship ? (gear.ship.stocks[STUFF_SLOTS[stuff]] ?? 0) : null;
  const index = resources.resources.findIndex((resource) => resource.name === island);
  return index < 0 ? null : (gear.resources[index] ?? 0);
}

/** A page's heading as the Journal's: large words, a count chip beside them, and what stands at its right. */
export function headNode(said: string, chip: string | null, beside: Child = null): Node {
  return {
    width: 'grow',
    gap: 10,
    alignY: 'center',
    padding: [0, 0, 8, 0],
    children: [
      words(said.toUpperCase(), 2, INK.word, { tracking: 3 }),
      chip !== null && { role: 'chip', padding: [1, 8], label: chip, children: [words(chip)] },
      { width: 'grow' },
      beside,
    ],
  };
}

/** Faint words wrapped to the room, as the menu's hints, at `size`. */
export const hintAt = (said: string, size: number): Node => ({
  ...hintNode(said),
  text: { words: said, colour: INK.faint, size },
});

/** A framed part of a page, as the Journal frames its bounties. */
export function partNode(children: readonly Child[], width: Node['width'] = 'grow'): Node {
  return { role: 'panel', width, direction: 'column', gap: 8, padding: 12, children };
}

/** A row of words with a press at its right, the presses of a part lined up at one edge; the words take what the
 *  press leaves, wrapping where they are wrapped words. */
export function rowNode(said: Node, press: Child): Node {
  return { width: 'grow', gap: 10, alignY: 'center', children: [{ width: 'grow', children: [said] }, press] };
}

/** The strongbox: what it holds while it holds any or a Counting House fills it, and the press to empty what the
 *  treasury can take of it; its words at `size`. */
export function strongboxNodes(
  ui: Interface,
  outpost: OutpostFace,
  treasury: number,
  acts: RowActs,
  size: number,
): Child[] {
  const rate = strongboxRateOf(outpost.plot);
  const box = outpost.strongbox;
  const moved = Math.min(box, Math.max(0, TREASURY_MOST - treasury));
  if (outpost.here && moved > 0 && ui.clicked(COLLECT_ID)) {
    const rest = box - moved;
    const stays = rest > 0 ? ` ${counted(rest)} stays in the strongbox: the treasury is full.` : '';
    acts.social(
      'outpost/collect',
      { site: outpost.site },
      `${counted(moved)} Aurem went into the treasury.${stays}`,
      false,
    );
  }
  if (box === 0 && rate === 0)
    return [label('Strongbox', size), hintAt('A Counting House fills a strongbox here by the hour.', size)];
  const held =
    rate > 0
      ? `${counted(box)} / ${counted(rate * STRONGBOX_HOURS)} Aurem · ${counted(rate)} an hour`
      : `${counted(box)} Aurem, with no Counting House to fill it more`;
  return [
    label('Strongbox', size),
    rowNode(
      words(held, size, INK.word, { wrap: true }),
      outpost.here &&
        pressNode(COLLECT_ID, 'Empty into the treasury', 'button', '', size, {
          disabled: moved === 0,
          width: PRESS_PX * size,
        }),
    ),
    outpost.here && box > 0 && moved === 0 && hintAt('The treasury is full.', size),
  ];
}

/** The stores: what each holds, and what the player may still take of each today (`taken` taken); words at `size`. */
export function storesNodes(
  ui: Interface,
  outpost: OutpostFace,
  island: string,
  taken: Partial<Record<Stuff, number>>,
  acts: RowActs,
  size: number,
): Child[] {
  const rows = STUFFS.filter((stuff) => (outpost.stores[stuff] ?? 0) > 0).map((stuff): Child => {
    const held = outpost.stores[stuff] ?? 0;
    const take = Math.min(held, Math.max(0, STORES_TAKE_A_DAY - (taken[stuff] ?? 0)));
    const named = stuffName(stuff, island);
    if (outpost.here && take > 0 && ui.clicked(takeId(stuff)))
      acts.room({ kind: ASKS.outpostTake, slot: STUFF_SLOTS[stuff], count: take });
    return rowNode(
      words(`${named} ${held}`, size, INK.word),
      outpost.here &&
        pressNode(takeId(stuff), take > 0 ? `Take ${take}` : 'Taken today', 'button', '', size, {
          disabled: take === 0,
          label: take > 0 ? `Take ${take} ${named}` : `${named}: taken today`,
          width: PRESS_PX * size,
        }),
    );
  });
  return [
    label('Stores', size),
    ...(rows.length > 0 ? rows : [hintAt('An Island Camp and a Dockyard fill the stores by the day.', size)]),
    outpost.here &&
      rows.length > 0 &&
      words(`Each member takes up to ${STORES_TAKE_A_DAY} of each a day.`, size, INK.faint),
  ];
}

/** The War Horn: what it calls, and the founder's or an admin's press to sound it there, or that it has sounded; its
 *  words at `size`. */
export function hornNodes(
  ui: Interface,
  outpost: OutpostFace,
  rank: number,
  sounded: boolean,
  acts: RowActs,
  size: number,
): Child[] {
  const horn = outpost.plot.structures.find((standing) => standing.kind === 'horn' && standing.tier > 0);
  if (!horn) return [];
  const sounds = !sounded && rank <= 1 && outpost.here;
  if (sounds && ui.clicked(HORN_ID)) acts.room({ kind: ASKS.outpostHorn });
  return [
    label('War Horn', size),
    words(`Tier ${horn.tier}: sounded once a week, it calls the guild boss to the muster ground.`, size, INK.faint, {
      wrap: true,
    }),
    sounded
      ? words('Sounded this week', size, INK.gain)
      : sounds && pressNode(HORN_ID, 'Sound the War Horn', 'primary', '', size),
  ];
}
