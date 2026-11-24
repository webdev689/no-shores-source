// The Harbourmaster's shipyard: every hull, each in a panel of its own with its words, its standard numbers as the
// naval rules hold them (`HullBuild`, from the rules' door), each as a bar against the most any hull has, its price in
// Aurem and the ship's materials, and a press: held to buy, clicked to sail one kept, or saying why neither.
import type { Child, Node } from '../../ui/node.ts';
import { INK, glyphNode, pressNode, words } from '../gearNodes.ts';
import { fillNode } from '../gearHold.ts';
import type { MenuContext } from '../menuPage.ts';
import { headingNode } from '../menuPages.ts';
import { SHIP_MATERIALS } from '../shipGear.ts';
import type { HullBuild } from '../shipPanel.ts';
import { type HullOffer, hullOffers } from './harbourModel.ts';

/** A number of a hull's as the panel shows it: its name, its value in words, and its share of the most any hull has. */
export interface HullNumber {
  readonly said: string;
  readonly value: string;
  readonly share: number;
}

const times = (value: number) => `×${value.toFixed(2)}`;

/** A hull's numbers, each against the most of the hulls `all`: what it takes and throws, how fast it reloads, sails
 *  and swings, and who boards with its player. */
export function hullNumbers(build: HullBuild, all: readonly HullBuild[]): HullNumber[] {
  const most = (pick: (each: HullBuild) => number) => Math.max(...all.map(pick), 1e-9);
  const share = (pick: (each: HullBuild) => number) => pick(build) / most(pick);
  // A quicker reload is the better: its bar is the quickest's over its own.
  const quickest = Math.min(...all.map((each) => each.reload_s));
  return [
    { said: 'Hull', value: String(build.hull), share: share((each) => each.hull) },
    { said: 'Canvas', value: String(build.sail), share: share((each) => each.sail) },
    { said: 'Hands', value: String(build.crew), share: share((each) => each.crew) },
    { said: 'Guns a side', value: String(build.guns.port), share: share((each) => each.guns.port) },
    { said: 'Broadside', value: times(build.broadside), share: share((each) => each.broadside) },
    { said: 'Reload', value: `${build.reload_s.toFixed(1)} s`, share: quickest / build.reload_s },
    { said: 'Speed', value: times(build.way), share: share((each) => each.way) },
    { said: 'Turning', value: times(build.turn), share: share((each) => each.turn) },
    { said: 'Boarders', value: String(build.boarders), share: share((each) => each.boarders) },
  ];
}

/** One number's row: its name, its bar and its value. */
function numberRow(number: HullNumber, size: number): Node {
  return {
    width: 'grow',
    gap: 10,
    alignY: 'center',
    padding: [2, 0],
    label: `${number.said} ${number.value}`,
    children: [
      { width: size > 1 ? 150 : 104, children: [words(number.said, size, INK.faint)] },
      {
        width: 'grow',
        height: 8,
        padding: 2,
        role: 'well',
        children: [
          { width: `${Math.round(Math.min(1, Math.max(0, number.share)) * 100)}%`, height: 'grow', fill: '#d9d0ae' },
        ],
      },
      { width: size > 1 ? 86 : 60, alignX: 'end', children: [words(number.value, size, INK.word)] },
    ],
  };
}

/** Its price: the Aurem and each ship material it asks, red where the player is short; nothing for a given hull. */
function priceRow(offer: HullOffer, size: number): Node | null {
  if (offer.aurem === 0 && offer.materials.every((count) => count === 0)) return null;
  const cost = (glyph: Parameters<typeof glyphNode>[0], count: number, short: boolean, name: string): Node => ({
    gap: 4,
    alignY: 'center',
    label: `${count.toLocaleString('en')} ${name}`,
    children: [glyphNode(glyph, 32), words(count.toLocaleString('en'), size, short ? INK.loss : INK.word)],
  });
  const materials = SHIP_MATERIALS.flatMap(({ name, glyph }, place): Node[] => {
    const count = offer.materials[place] ?? 0;
    return count > 0 ? [cost(glyph, count, offer.short.materials[place] ?? false, name)] : [];
  });
  return {
    gap: 12,
    wrap: true,
    alignY: 'center',
    children: [cost('aurem', offer.aurem, offer.short.aurem, 'Aurem'), ...materials],
  };
}

/** What stands under a hull's numbers where its press would: why it cannot be had now. */
function why(offer: HullOffer): string {
  switch (offer.state) {
    case 'sailing':
      return offer.called ? `Sailing ${offer.called}` : 'Sailing';
    case 'given':
      return 'The Harbourmaster hands it over in the welcome.';
    case 'locked':
      return offer.level > 1 ? `Sold from ship level ${offer.level}` : 'Take your first ship from the Harbourmaster.';
    case 'short':
      return 'Not enough to pay for it';
    default:
      return '';
  }
}

/** A hull's press: held to buy one to be had, clicked to sail one kept; else a line saying why neither. */
function pressOf(context: MenuContext, offer: HullOffer, size: number): Child {
  const { ui, holds } = context;
  const id = `hull-${offer.hull}`;
  if (offer.state === 'kept' && offer.ask) {
    if (ui.clicked(id)) context.ask(offer.ask);
    return pressNode(id, 'Sail it', 'primary', '', size, { label: `Sail the ${offer.name} from now on` });
  }
  if (offer.state === 'buy' && offer.ask) {
    const ask = offer.ask;
    const charged = holds.press(ui, id, () => context.ask(ask));
    return {
      id,
      press: true,
      role: 'primary',
      label: `Hold to buy the ${offer.name} for ${offer.aurem.toLocaleString('en')} Aurem and its materials`,
      padding: [9, 16],
      children: [words('Hold to buy', size, INK.word), fillNode(charged)],
    };
  }
  const colour = offer.state === 'sailing' ? INK.gain : offer.state === 'short' ? INK.loss : INK.faint;
  return words(why(offer), size, colour);
}

/** One hull's panel, `width` wide. */
function hullPanel(
  context: MenuContext,
  offer: HullOffer,
  build: HullBuild | null,
  all: readonly HullBuild[],
  width: number,
): Node {
  const size = context.sizes.label;
  const named = offer.called ? `${offer.name}, ${offer.called}` : offer.name;
  return {
    role: 'panel',
    width,
    direction: 'column',
    gap: 6,
    padding: [14, 18],
    label: named,
    children: [
      headingNode(offer.name, offer.state === 'sailing' ? words('SAILING', size, INK.gain) : null, context.sizes.name),
      { width: 'grow', text: { words: offer.words, size, colour: INK.faint, wrap: true } },
      // Its numbers stand once the rules' door has given them, a moment after the page opens.
      ...(build ? hullNumbers(build, all).map((number) => numberRow(number, size)) : []),
      priceRow(offer, size),
      { width: 'grow', padding: [6, 0, 0, 0], alignX: 'end', children: [pressOf(context, offer, size)] },
    ],
  };
}

/** The shipyard: every hull's panel, two to a row where the page is wide enough. */
export function shipyardPart(context: MenuContext, builds: readonly HullBuild[] | null): Node {
  const offers = hullOffers(context.gear);
  const across = context.room.width >= 900 ? 2 : 1;
  const width = Math.floor((context.room.width - 36 - (across - 1) * 14) / across);
  return {
    width: 'grow',
    wrap: true,
    gap: 14,
    padding: [0, 18, 14, 18],
    children: offers.map((offer) => hullPanel(context, offer, builds?.[offer.hull] ?? null, builds ?? [], width)),
  };
}
