// The Guild tab's Outposts page: each of the guild's outposts by its site, its plot's plan, its strongbox and stores,
// and what a member standing there may do: deliver to a structure being built, take from the stores, empty the
// strongbox, and (a founder or admin) build, raise a tier, take down and sound the War Horn. Standing in the guild's
// room at a site it has not raised, a founder or admin raises one there. The plan is seen from anywhere; changing it is
// done at the outpost, as the accounts judge (`server/accounts/outposts.ts`).

import type { GuildFace, KeptPlot, OutpostFace, OutpostsFace } from '../../network/accounts.ts';
import { ASKS, type GearAsk } from '../../network/gearMessages.ts';
import type { Child, Node } from '../../ui/node.ts';
import type { Interface } from '../../ui/ui.ts';
import type { Holds } from '../gearHold.ts';
import { fillNode } from '../gearHold.ts';
import { INK, label, pressNode, words } from '../gearNodes.ts';
import { headingNode, hintNode } from '../menuPages.ts';
import { counted } from './guildHome.ts';
import {
  RAISE_AUREM,
  STORES_TAKE_A_DAY,
  STRONGBOX_HOURS,
  STUFFS,
  type Stuff,
  kindOf,
  riseRefusal,
  strongboxRateOf,
} from './outpostLaw.ts';
import { type PlanState, costWords, givesWords, kindsNode, planNode, standingWords, stuffName } from './outpostPlan.ts';

export const RAISE_ID = 'outpost-raise';
export const COLLECT_ID = 'outpost-collect';
export const RISE_ID = 'outpost-rise';
export const REMOVE_ID = 'outpost-remove';
export const HORN_ID = 'outpost-horn';
export const ABANDON_ID = 'outpost-abandon';
export const outpostTabId = (site: string) => `outpost-tab-${site}`;
export const takeId = (stuff: Stuff) => `outpost-take-${stuff}`;
export const deliverId = (stuff: Stuff) => `outpost-deliver-${stuff}`;

/** A material's number in an outpost's asks of the room (`ASKS.outpostDeliver`). */
export const STUFF_SLOTS: Readonly<Record<Stuff, number>> = { timber: 0, canvas: 1, iron: 2, heartwood: 3, island: 4 };

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

/** What the page keeps across frames: the site shown and its plan's state. */
export interface OutpostsState {
  shown: string | null;
  readonly plan: PlanState;
}

/** What the page may do: ask the accounts, and ask the room the player stands in. */
export interface OutpostActs {
  social(path: string, body: Readonly<Record<string, unknown>>, said: string, changes: boolean): void;
  room(ask: GearAsk): void;
}

/** The page, its words at `size`, its plan's cells `cellPx` square. */
export function outpostsNode(
  ui: Interface,
  holds: Holds,
  given: {
    face: GuildFace;
    outposts: OutpostsFace;
    state: OutpostsState;
    siteOf: SiteOf;
    cellPx: number;
    size: number;
  },
  acts: OutpostActs,
): Node {
  const { face, outposts, state, siteOf, size } = given;
  const sites = outposts.outposts.map((outpost) => outpost.site);
  const raisable = outposts.at !== null && !sites.includes(outposts.at) ? outposts.at : null;
  const tabs = [...sites, ...(raisable ? [raisable] : [])];
  for (const site of tabs) if (ui.clicked(outpostTabId(site))) state.shown = site;
  if (state.shown === null || !tabs.includes(state.shown))
    state.shown = outposts.outposts.find((each) => each.here)?.site ?? tabs[0] ?? null;
  const shown = outposts.outposts.find((outpost) => outpost.site === state.shown);
  const held = `${outposts.outposts.length} of ${outposts.allowed} your guild's level allows`;
  return {
    width: 'grow',
    direction: 'column',
    gap: 12,
    padding: [6, 4, 0, 4],
    children: [
      headingNode('Outposts', words(held, size, INK.faint), size),
      tabs.length > 0 && {
        gap: 8,
        wrap: true,
        children: tabs.map((site) => {
          const here = site === outposts.at;
          const said = `${siteOf(site).name}${here ? ' · here' : ''}${site === raisable ? ' · unclaimed' : ''}`;
          return pressNode(outpostTabId(site), said, site === state.shown ? 'primary' : 'button');
        }),
      },
      shown
        ? outpostNode(ui, holds, { ...given, outpost: shown }, acts)
        : state.shown === raisable && raisable
          ? raiseNode(ui, face, outposts, siteOf(raisable).name, raisable, acts)
          : hintNode('Sail to any island and come ashore at its outpost site, a flag on the map, to raise an outpost.'),
    ],
  };
}

/** Raising an outpost at the site the player stands at: the founder's or an admin's press, its cost and what allows it. */
function raiseNode(
  ui: Interface,
  face: GuildFace,
  outposts: OutpostsFace,
  name: string,
  site: string,
  acts: OutpostActs,
): Node {
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
        ? `The treasury holds ${counted(outposts.treasury)} Aurem.`
        : null;
  return {
    width: 'grow',
    direction: 'column',
    gap: 10,
    maxWidth: 720,
    children: [
      words(`${name} is unclaimed by your guild.`, 1, INK.word),
      words(
        `Raising an outpost here takes ${counted(RAISE_AUREM)} Aurem from the treasury. Its hall and your banner stand at once; the rest is built by members.`,
        1,
        INK.faint,
        { wrap: true },
      ),
      runs &&
        pressNode(RAISE_ID, `Raise an outpost (${counted(RAISE_AUREM)} Aurem)`, 'primary', '', 1, {
          disabled: why !== null,
        }),
      why !== null && hintNode(why),
    ],
  };
}

/** One outpost: its plan beside what is chosen on it, or its strongbox, stores and horn. */
function outpostNode(
  ui: Interface,
  holds: Holds,
  given: { face: GuildFace; outpost: OutpostFace; state: OutpostsState; siteOf: SiteOf; cellPx: number; size: number },
  acts: OutpostActs,
): Node {
  const { face, outpost, state, cellPx } = given;
  const builds = face.rank <= 1 && outpost.here;
  if (!builds) state.plan.choosing = null;
  const plan = planNode(ui, outpost.plot, state.plan, face.level, cellPx);
  const site = outpost.site;
  if (plan.placing) {
    const name = kindOf(plan.placing.kind)?.name ?? 'It';
    acts.social(
      'outpost/place',
      { site, ...plan.placing },
      `${name} is placed. Deliver its materials to build it.`,
      true,
    );
    state.plan.choosing = null;
  }
  const chosen = outpost.plot.structures.find((standing) => standing.id === state.plan.chosen);
  const side: Child[] = chosen
    ? [structureNode(ui, holds, outpost, chosen, face, given.siteOf(site).island, acts)]
    : [overviewNode(ui, holds, outpost, face, given.siteOf(site).island, acts)];
  return {
    width: 'grow',
    gap: 20,
    children: [
      {
        direction: 'column',
        gap: 6,
        children: [
          plan.node,
          plan.refusal !== null && words(plan.refusal, 1, INK.loss),
          !outpost.here && hintNode('Stand at the outpost to build, deliver or collect.'),
        ],
      },
      {
        width: 'grow',
        direction: 'column',
        gap: 12,
        maxWidth: 520,
        children: [...side, builds && kindsNode(ui, outpost.plot, state.plan, face.level)],
      },
    ],
  };
}

/** A chosen structure: what it is and does, what its tier being built still needs with presses to deliver it, and a
 *  founder's or admin's presses to raise its tier or take it down. */
function structureNode(
  ui: Interface,
  holds: Holds,
  outpost: OutpostFace,
  standing: KeptPlot['structures'][number],
  face: GuildFace,
  island: string,
  acts: OutpostActs,
): Node {
  const kind = kindOf(standing.kind);
  const site = outpost.site;
  const building = standing.building > 0 ? kind?.tiers[standing.building - 1] : undefined;
  const needs = (Object.entries(building?.materials ?? {}) as [Stuff, number][]).map(([stuff, needed]): Child => {
    const delivered = standing.delivered[stuff] ?? 0;
    const left = Math.max(0, needed - delivered);
    if (outpost.here && left > 0 && ui.clicked(deliverId(stuff)))
      acts.room({ kind: ASKS.outpostDeliver, item: standing.id, slot: STUFF_SLOTS[stuff], count: left });
    return {
      width: 'grow',
      gap: 10,
      alignY: 'center',
      children: [
        words(`${stuffName(stuff, island)} ${delivered} / ${needed}`, 1, left === 0 ? INK.gain : INK.word),
        { width: 'grow' },
        outpost.here && left > 0 && pressNode(deliverId(stuff), 'Deliver'),
      ],
    };
  });
  const runs = face.rank <= 1 && outpost.here;
  const next = standing.tier + 1;
  const rise = kind ? riseRefusal(outpost.plot, standing, face.level) : 'There is no such structure.';
  if (runs && rise === null && ui.clicked(RISE_ID))
    acts.social('outpost/rise', { site, id: standing.id }, 'The next tier is begun. Deliver its materials.', true);
  const removing = holds.press(ui, REMOVE_ID, () =>
    acts.social('outpost/remove', { site, id: standing.id }, 'It is taken down, half its Aurem back.', true),
  );
  return {
    width: 'grow',
    direction: 'column',
    gap: 8,
    children: [
      label(standingWords(standing)),
      words(kind?.words ?? '', 1, INK.faint, { wrap: true }),
      building && words(`Building tier ${standing.building}: deliver its materials here.`, 1, INK.word),
      ...needs,
      runs &&
        kind &&
        next <= kind.tiers.length &&
        standing.building === 0 && {
          direction: 'column',
          gap: 4,
          children: [
            pressNode(RISE_ID, `Raise to tier ${next}`, 'primary', '', 1, { disabled: rise !== null }),
            words(rise ?? costWords(kind, next), 1, rise ? INK.loss : INK.faint, { wrap: true }),
          ],
        },
      runs &&
        standing.kind !== 'hall' &&
        pressNode(REMOVE_ID, 'Hold to take it down (half its Aurem back)', 'warn', '', 1, {
          children: [fillNode(removing, true)],
        }),
    ],
  };
}

/** An outpost at a glance: its strongbox, its stores, its War Horn, and the founder's press to abandon it. */
function overviewNode(
  ui: Interface,
  holds: Holds,
  outpost: OutpostFace,
  face: GuildFace,
  island: string,
  acts: OutpostActs,
): Node {
  const site = outpost.site;
  const rate = strongboxRateOf(outpost.plot);
  const gives = givesWords(outpost.plot, island);
  if (outpost.here && outpost.strongbox > 0 && ui.clicked(COLLECT_ID))
    acts.social('outpost/collect', { site }, `${counted(outpost.strongbox)} Aurem went into the treasury.`, false);
  const stores = STUFFS.filter((stuff) => (outpost.stores[stuff] ?? 0) > 0).map((stuff): Child => {
    const held = outpost.stores[stuff] ?? 0;
    const take = Math.min(held, STORES_TAKE_A_DAY);
    if (outpost.here && ui.clicked(takeId(stuff)))
      acts.room({ kind: ASKS.outpostTake, slot: STUFF_SLOTS[stuff], count: take });
    return {
      width: 'grow',
      gap: 10,
      alignY: 'center',
      children: [
        words(`${stuffName(stuff, island)} ${held}`, 1, INK.word),
        { width: 'grow' },
        outpost.here && pressNode(takeId(stuff), `Take ${take}`),
      ],
    };
  });
  const horn = outpost.plot.structures.find((standing) => standing.kind === 'horn' && standing.tier > 0);
  const sounds = horn && face.rank <= 1 && outpost.here;
  if (sounds && ui.clicked(HORN_ID)) acts.room({ kind: ASKS.outpostHorn });
  const abandoning = holds.press(ui, ABANDON_ID, () =>
    acts.social('outpost/abandon', { site }, 'The outpost is abandoned, half of all spent on it back.', true),
  );
  return {
    width: 'grow',
    direction: 'column',
    gap: 10,
    children: [
      label('Strongbox'),
      rate === 0
        ? hintNode('A Counting House fills a strongbox here by the hour.')
        : {
            width: 'grow',
            gap: 10,
            alignY: 'center',
            children: [
              words(
                `${counted(outpost.strongbox)} / ${counted(rate * STRONGBOX_HOURS)} Aurem · ${counted(rate)} an hour`,
                1,
                INK.word,
              ),
              { width: 'grow' },
              outpost.here &&
                pressNode(COLLECT_ID, 'Empty into the treasury', 'button', '', 1, {
                  disabled: outpost.strongbox === 0,
                }),
            ],
          },
      label('Stores'),
      ...(stores.length > 0 ? stores : [hintNode('An Island Camp and a Dockyard fill the stores by the day.')]),
      outpost.here &&
        stores.length > 0 &&
        words(`Each member takes up to ${STORES_TAKE_A_DAY} of each a day.`, 1, INK.faint),
      horn && label('War Horn'),
      horn &&
        words(`Tier ${horn.tier}: sounded once a week, it calls the guild boss to the muster ground.`, 1, INK.faint, {
          wrap: true,
        }),
      sounds && pressNode(HORN_ID, 'Sound the War Horn', 'primary'),
      face.rank === 0 &&
        pressNode(ABANDON_ID, 'Hold to abandon this outpost (half of all spent back)', 'warn', '', 1, {
          children: [fillNode(abandoning, true)],
        }),
      gives.length > 0 && label('It gives'),
      gives.length > 0 && words(gives.join(' · '), 1, INK.word, { wrap: true }),
    ],
  };
}
