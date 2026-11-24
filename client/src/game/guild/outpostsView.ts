// The Guild tab's Outposts page: each of the guild's outposts by its site, its plot's plan, its strongbox and stores,
// and what a member standing there may do: deliver to a structure being built, take from the stores, empty the
// strongbox, and (a founder or admin) build, raise a tier, take down and sound the War Horn. Standing in the guild's
// room at a site it has not raised, a founder or admin raises one there. The plan is seen from anywhere; changing it is
// done at the outpost, as the accounts judge (`server/accounts/outposts.ts`), and the page weighs the treasury first.

import type { GuildFace, KeptPlot, OutpostFace, OutpostsFace } from '../../network/accounts.ts';
import { ASKS, type GearState } from '../../network/gearMessages.ts';
import type { Child, Node } from '../../ui/node.ts';
import type { Interface } from '../../ui/ui.ts';
import type { Holds } from '../gearHold.ts';
import { fillNode } from '../gearHold.ts';
import { INK, pressNode, words } from '../gearNodes.ts';
import { OUTPOST_DELVE, openGearWindow } from '../gearScreen.ts';
import { DELVE_WORDS, GATE, gateTier } from './delveRoom.ts';
import { decorateNode } from './decorateView.ts';
import { counted } from './guildHome.ts';
import { PLOT_CELLS, RAISE_AUREM, type Stuff, kindOf, riseRefusal } from './outpostLaw.ts';
import {
  type PlanState,
  costWords,
  givesWords,
  kindsNode,
  lacksWords,
  legendNode,
  planNode,
  standingWords,
  stuffName,
} from './outpostPlan.ts';
import {
  type RowActs,
  STUFF_SLOTS,
  backOf,
  headNode,
  heldOf,
  hintAt,
  PRESS_PX,
  hornNodes,
  partNode,
  rowNode,
  storesNodes,
  strongboxNodes,
} from './outpostRows.ts';

export { COLLECT_ID, HORN_ID, STUFF_SLOTS, takeId } from './outpostRows.ts';
export const RAISE_ID = 'outpost-raise';
export const RISE_ID = 'outpost-rise';
export const REMOVE_ID = 'outpost-remove';
export const ABANDON_ID = 'outpost-abandon';
/** The column beside the plan. */
export const SIDE_ID = 'outpost-side';
export const outpostTabId = (site: string) => `outpost-tab-${site}`;
export const delveId = (tier: number) => `outpost-delve-${tier}`;
export const deliverId = (stuff: Stuff) => `outpost-deliver-${stuff}`;
/** What a member away from an outpost reads of what is done there. */
export const AWAY_WORDS = 'Stand at the outpost to build, deliver, take from its stores, empty its strongbox or delve.';
/** The width of the column beside the plan, and of the building column, at the first label step: as wide as their
 *  rows' words and presses need, so neither runs past the room nor changes with what is chosen. */
const COLUMN_PX = 420;
const BUILD_PX = 320;
/** The plan's smallest cell, in pixels; under it the plan stands over the rest. */
const LEAST_CELL_PX = 12;

/** A site's name and its island's own resource, as the page's world knows them. */
export type SiteOf = (site: string) => { readonly name: string; readonly island: string };

/** A site's name from its id where the world is not known: `gull-cove-outpost` is Gull Cove. */
export function siteNamed(site: string): string {
  return site
    .replace(/-outpost$/, '')
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** What the page keeps across frames: the site shown, where the player stood when it was chosen, its plan, and the
 *  site that plan was chosen on. */
export interface OutpostsState {
  shown: string | null;
  at?: string | null;
  readonly plan: PlanState;
  planned?: string | null;
}

/** What the page may do: ask the accounts, and ask the room the player stands in. */
export type OutpostActs = RowActs;

/** What the page draws from: the guild, its outposts, the page's state, the sites, the plan's cell, the words' size,
 *  the page's width, and the player's gear as the room last told it (none at sea). */
interface Given {
  readonly face: GuildFace;
  readonly outposts: OutpostsFace;
  readonly state: OutpostsState;
  readonly siteOf: SiteOf;
  readonly cellPx: number;
  readonly size: number;
  readonly width?: number;
  readonly gear?: GearState | null;
}

/** The page, its words at `size`, its plan's cells `cellPx` square. */
export function outpostsNode(ui: Interface, holds: Holds, given: Given, acts: OutpostActs): Node {
  const { outposts, state, siteOf, size } = given;
  const sites = outposts.outposts.map((outpost) => outpost.site);
  const raisable = outposts.at !== null && !sites.includes(outposts.at) ? outposts.at : null;
  const tabs = [...sites, ...(raisable ? [raisable] : [])];
  for (const site of tabs) if (ui.clicked(outpostTabId(site))) state.shown = site;
  // Standing somewhere new, the page turns to the outpost stood at.
  if (state.at !== outposts.at) {
    state.at = outposts.at;
    if (outposts.at !== null && tabs.includes(outposts.at)) state.shown = outposts.at;
  }
  if (state.shown === null || !tabs.includes(state.shown)) state.shown = tabs[0] ?? null;
  // A structure chosen or being placed belongs to its own outpost: another's tab starts with none.
  if (state.planned !== state.shown) {
    state.planned = state.shown;
    state.plan.chosen = null;
    state.plan.choosing = null;
  }
  const shown = outposts.outposts.find((outpost) => outpost.site === state.shown);
  return {
    width: 'grow',
    direction: 'column',
    gap: 12,
    padding: [6, 4, 0, 4],
    children: [
      headNode('Outposts', null, words(`${counted(outposts.treasury)} Aurem in the treasury`, size, INK.brassLit)),
      words(`${outposts.outposts.length} of ${outposts.allowed} outposts your level allows`, size, INK.faint),
      tabs.length > 0 && {
        gap: 8,
        wrap: true,
        children: tabs.map((site) => {
          const here = site === outposts.at;
          const said = `${siteOf(site).name}${here ? ' · here' : ''}${site === raisable ? ' · unclaimed' : ''}`;
          return pressNode(outpostTabId(site), said, site === state.shown ? 'primary' : 'button', '', size);
        }),
      },
      shown
        ? outpostNode(ui, holds, { ...given, outpost: shown }, acts)
        : state.shown === raisable && raisable
          ? raiseNode(ui, given, siteOf(raisable).name, raisable, acts)
          : hintAt(
              'Sail to any island and come ashore at its outpost site, a flag on the map, to raise an outpost.',
              size,
            ),
    ],
  };
}

/** Raising an outpost at the site the player stands at: the founder's or an admin's press, its cost and what allows it. */
function raiseNode(ui: Interface, given: Given, name: string, site: string, acts: OutpostActs): Node {
  const { face, outposts, size } = given;
  const runs = face.rank <= 1;
  const room = outposts.outposts.length < outposts.allowed;
  const afford = outposts.treasury >= RAISE_AUREM;
  if (runs && room && afford && ui.clicked(RAISE_ID))
    acts.social('outpost/raise', { site, turn: 0 }, `An outpost stands at ${name}.`, true);
  const why = !runs
    ? 'The founder or an admin raises an outpost.'
    : !room
      ? 'Your guild holds as many outposts as its level allows.'
      : !afford
        ? 'Put Aurem in on the Treasury page while you stand here.'
        : null;
  return partNode(
    [
      words(`${name} is unclaimed by your guild.`, size, INK.word),
      words(
        `Raising an outpost here takes ${counted(RAISE_AUREM)} Aurem from the treasury, which holds ${counted(outposts.treasury)}. Its hall and its Banner Standard stand at once; the rest is built by members.`,
        size,
        afford ? INK.faint : INK.loss,
        { wrap: true },
      ),
      runs &&
        pressNode(RAISE_ID, 'Raise an outpost', 'primary', '', size, {
          disabled: why !== null,
          label: `Raise an outpost for ${counted(RAISE_AUREM)} Aurem`,
        }),
      why !== null && hintAt(why, size),
    ],
    'fit',
  );
}

/** One outpost: its plan, beside it what the plan's ghost says, why nothing can be pressed away from it, and what is
 *  chosen on it or its strongbox, stores and horn, and a founder's or admin's building in a third column where the page
 *  is wide enough. The plan's cells shrink before the column beside it would pass the room. */
function outpostNode(ui: Interface, holds: Holds, given: Given & { readonly outpost: OutpostFace }, acts: OutpostActs) {
  const { face, outposts, outpost, state, size } = given;
  const column = COLUMN_PX * size;
  const build = BUILD_PX * size;
  // The page's own padding, 4 px a side, comes off the room it is given.
  const width = (given.width ?? given.cellPx * PLOT_CELLS + column + 32) - 8;
  const beside = Math.floor((width - column - 24) / PLOT_CELLS);
  // Too narrow for a column beside even the least plan, the plan stands over the rest and takes the row's width.
  const cellPx = Math.min(given.cellPx, beside >= LEAST_CELL_PX ? beside : Math.floor((width - 4) / PLOT_CELLS));
  const builds = face.rank <= 1 && outpost.here;
  if (!builds) state.plan.choosing = null;
  const plan = planNode(ui, outpost.plot, state.plan, { level: face.level, treasury: outposts.treasury, cellPx, size });
  const site = outpost.site;
  const island = given.siteOf(site).island;
  if (plan.placing) {
    const kind = kindOf(plan.placing.kind);
    const named = kind ? `The ${kind.name}` : 'It';
    const stands = kind && Object.keys(kind.tiers[0]?.materials ?? {}).length === 0;
    const said = stands ? `${named} stands.` : `${named} is placed. Deliver its materials to build it.`;
    acts.social('outpost/place', { site, ...plan.placing }, said, true);
    state.plan.choosing = null;
  }
  const chosen = outpost.plot.structures.find((standing) => standing.id === state.plan.chosen);
  const side = chosen ? structureNode(ui, holds, given, chosen, acts) : overviewNode(ui, holds, given, island, acts);
  const building: Child[] = builds
    ? [
        kindsNode(ui, outpost.plot, state.plan, { level: face.level, island, size }),
        decorateNode(ui, outpost, outposts.treasury, size),
      ]
    : [];
  const planPx = cellPx * PLOT_CELLS + 4;
  const three = width >= planPx + column + build + 40;
  // Too narrow for a column beside the plan, the plan stands over the rest.
  const narrow = width < planPx + column + 20;
  return {
    width: 'grow',
    gap: 20,
    direction: narrow ? 'column' : 'row',
    children: [
      {
        width: planPx,
        direction: 'column',
        gap: 6,
        children: [plan.node, legendNode(outpost.plot, size)],
      },
      {
        id: SIDE_ID,
        // Fixed beside a third column, so neither changes with what is chosen; else it takes the rest of the row.
        width: three ? column : 'grow',
        direction: 'column',
        gap: 12,
        children: [
          plan.said !== null && words(plan.said, size, plan.refusal === null ? INK.gain : INK.loss, { wrap: true }),
          !outpost.here && hintAt(AWAY_WORDS, size),
          side,
          ...(three ? [] : building.map((part) => partNode([part]))),
        ],
      },
      three &&
        building.length > 0 && {
          width: 'grow',
          direction: 'column',
          gap: 12,
          children: building.map((part) => partNode([part])),
        },
    ],
  } satisfies Node;
}

/** A chosen structure: what it is and does, what its tier being built still needs with presses to deliver it, the
 *  rows of its own work (a Counting House's strongbox, a Camp's or Dockyard's stores, the War Horn), and a founder's or
 *  admin's presses to raise its tier or take it down. */
function structureNode(
  ui: Interface,
  holds: Holds,
  given: Given & { readonly outpost: OutpostFace },
  standing: KeptPlot['structures'][number],
  acts: OutpostActs,
): Node {
  const { face, outposts, outpost, size } = given;
  const island = given.siteOf(outpost.site).island;
  const kind = kindOf(standing.kind);
  const site = outpost.site;
  const building = standing.building > 0 ? kind?.tiers[standing.building - 1] : undefined;
  const needs = (Object.entries(building?.materials ?? {}) as [Stuff, number][]).map(([stuff, needed]): Child => {
    const delivered = standing.delivered[stuff] ?? 0;
    const left = Math.max(0, needed - delivered);
    const named = stuffName(stuff, island);
    const held = heldOf(given.gear, stuff, island);
    const gives = outpost.here && left > 0 && held !== 0;
    if (gives && ui.clicked(deliverId(stuff)))
      acts.room({ kind: ASKS.outpostDeliver, item: standing.id, slot: STUFF_SLOTS[stuff], count: left });
    return rowNode(
      words(
        `${named} ${delivered} / ${needed}${held === 0 && left > 0 ? ` · you carry none` : ''}`,
        size,
        left === 0 ? INK.gain : INK.word,
      ),
      outpost.here &&
        left > 0 &&
        pressNode(deliverId(stuff), 'Deliver', 'button', '', size, {
          disabled: !gives,
          label: held === 0 ? `Deliver ${named}: you carry none` : `Deliver ${named}`,
          width: PRESS_PX * size,
        }),
    );
  });
  const runs = face.rank <= 1 && outpost.here;
  const next = standing.tier + 1;
  const rise = kind
    ? (riseRefusal(outpost.plot, standing, face.level) ??
      lacksWords(outposts.treasury, kind.tiers[next - 1]?.aurem ?? 0, 'that tier'))
    : 'There is no such structure to build.';
  if (runs && rise === null && ui.clicked(RISE_ID))
    acts.social('outpost/rise', { site, id: standing.id }, 'The next tier is begun. Deliver its materials.', true);
  const back = backOf(outposts.treasury, standing.spent);
  const removing = holds.press(ui, REMOVE_ID, () =>
    acts.social(
      'outpost/remove',
      { site, id: standing.id },
      (answer) => `It is taken down, ${counted(backHeard(answer, back))} Aurem back.`,
      true,
    ),
  );
  const own =
    standing.tier < 1
      ? []
      : standing.kind === 'counting'
        ? strongboxNodes(ui, outpost, outposts.treasury, acts, size)
        : standing.kind === 'camp' || standing.kind === 'dock'
          ? storesNodes(ui, outpost, island, outposts.taken ?? {}, acts, size)
          : standing.kind === 'horn'
            ? hornNodes(ui, outpost, face.rank, outposts.hornSounded === true, acts, size)
            : [];
  return partNode([
    words(standingWords(standing), size + 1, INK.word),
    words(kind?.words ?? '', size, INK.faint, { wrap: true }),
    building &&
      words(
        `Building tier ${standing.building}: ${outpost.here ? 'deliver its materials here' : 'its materials are delivered at the outpost'}.`,
        size,
        INK.word,
        { wrap: true },
      ),
    ...needs,
    ...own,
    delveNode(ui, outpost, standing, size),
    runs &&
      kind &&
      next <= kind.tiers.length &&
      standing.building === 0 && {
        width: 'grow',
        direction: 'column',
        gap: 4,
        children: [
          pressNode(RISE_ID, `Raise to tier ${next}`, 'primary', '', size, { disabled: rise !== null }),
          words(rise ?? costWords(kind, next, island), size, rise ? INK.loss : INK.faint, { wrap: true }),
        ],
      },
    runs &&
      standing.kind !== 'hall' &&
      pressNode(REMOVE_ID, `Hold to take it down (${counted(back)} Aurem back)`, 'warn', '', size, {
        children: [fillNode(removing, true)],
      }),
  ]);
}

/** A Delve Gate's way down: a press for each tier it opens, for a member standing at the outpost, which closes the menu
 *  and goes down with their company (`outpostHere.ts`); words of what it opens elsewhere. */
function delveNode(ui: Interface, outpost: OutpostFace, standing: KeptPlot['structures'][number], size: number): Child {
  if (standing.kind !== GATE || standing.tier < 1) return null;
  const top = gateTier(outpost.plot) ?? 0;
  const tiers = DELVE_WORDS.slice(0, top + 1);
  for (const [tier] of tiers.entries())
    if (outpost.here && ui.clicked(delveId(tier))) {
      dispatchEvent(new CustomEvent(OUTPOST_DELVE, { detail: tier }));
      openGearWindow({ view: 'guild', toggle: true });
    }
  return {
    direction: 'column',
    gap: 6,
    children: [
      // At the outpost its presses name what it opens; away, these words do.
      !outpost.here && words(`It opens ${tiers.join(', ')}.`, size, INK.faint, { wrap: true }),
      outpost.here && {
        gap: 8,
        wrap: true,
        children: tiers.map((said, tier) =>
          pressNode(delveId(tier), `Delve at ${said}`, tier === top ? 'primary' : 'button', '', size),
        ),
      },
    ],
  };
}

/** The Aurem the accounts answer came back to the treasury, or `weighed` as the page weighed it where they say none. */
function backHeard(answer: Readonly<Record<string, unknown>>, weighed: number): number {
  return typeof answer['back'] === 'number' ? answer['back'] : weighed;
}

/** What taking the whole outpost back gives the treasury: half of its raising, every structure's cost and every
 *  piece of decoration's price, as much as the treasury holds. */
function abandonBack(outposts: OutpostsFace, outpost: OutpostFace): number {
  const built = outpost.plot.structures.reduce((sum, standing) => sum + standing.spent, RAISE_AUREM);
  const spent = outpost.plot.decor.reduce((sum, decor) => sum + decor.paid, built);
  return backOf(outposts.treasury, spent);
}

/** An outpost at a glance: its strongbox, its stores (what the player may still take of each today), its War Horn,
 *  what it gives, and the founder's press to abandon it. */
function overviewNode(
  ui: Interface,
  holds: Holds,
  given: Given & { readonly outpost: OutpostFace },
  island: string,
  acts: OutpostActs,
): Node {
  const { face, outposts, outpost, size } = given;
  const gives = givesWords(outpost.plot, island);
  const back = abandonBack(outposts, outpost);
  const abandoning = holds.press(ui, ABANDON_ID, () =>
    acts.social(
      'outpost/abandon',
      { site: outpost.site },
      (answer) => `The outpost is abandoned, ${counted(backHeard(answer, back))} Aurem back.`,
      true,
    ),
  );
  return partNode([
    ...strongboxNodes(ui, outpost, outposts.treasury, acts, size),
    ...storesNodes(ui, outpost, island, outposts.taken ?? {}, acts, size),
    ...hornNodes(ui, outpost, face.rank, outposts.hornSounded === true, acts, size),
    gives.length > 0 && words(`It gives ${gives.join(' · ')}.`, size, INK.word, { wrap: true }),
    face.rank === 0 &&
      pressNode(ABANDON_ID, `Hold to abandon this outpost (${counted(back)} Aurem back)`, 'warn', '', size, {
        children: [fillNode(abandoning, true)],
      }),
  ]);
}
