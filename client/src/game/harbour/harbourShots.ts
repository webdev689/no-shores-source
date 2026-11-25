// Pictures of the Harbourmaster's counter, headless (`tools/uiShot.mjs`): the menu as the game opens it at the counter
// over sample gear with a fleet, at each of its parts, and the counter of a player who keeps no ship yet. Each hull's
// numbers come from the room's own module, as the game reads them. The game never imports it.

import type { GearShip, GearState } from '../../network/gearMessages.ts';
import { SHIP_DRESSES } from '../../ships/fleetDress.ts';
import type { Node } from '../../ui/node.ts';
import { Stack } from '../../ui/stack.ts';
import type { Interface } from '../../ui/ui.ts';
import { OPEN_AT } from '../gearScreen.ts';
import { sampleGear } from '../gearShots.ts';
import { startGearWindow } from '../gearWindow.ts';
import { roomModuleFrom } from '../shipPanel.ts';
import { NO_WORD } from './harbourModel.ts';

const number = (id: string) => SHIP_DRESSES.findIndex((entry) => entry.id === id);
const builds = roomModuleFrom(`${location.origin}/`).hulls;

/** A Sloop named the Grey Gull in oxblood with gold leaf and harbour cloths under the Pole Star, and a Brig as built,
 *  sailed; the dresses those wear and a few more kept. */
const FLEET: Pick<GearShip, 'fleet' | 'sailed' | 'dresses'> = {
  fleet: [
    {
      hull: 0,
      name: [0, 0],
      named: true,
      dress: ['oxblood', 'gold_leaf', 'harbour_cloths', 'pole_star'].map(number),
    },
    {
      hull: 2,
      name: [NO_WORD, NO_WORD],
      named: false,
      dress: ['bare_timber', 'unbanded', 'plain_canvas', 'overlook_flag'].map(number),
    },
  ],
  sailed: 2,
  dresses: [
    ...['bare_timber', 'unbanded', 'plain_canvas', 'overlook_flag'].map(number),
    ...['oxblood', 'harbour_blue', 'gold_leaf', 'white_band', 'harbour_cloths', 'red_ochre', 'pole_star'].map(number),
  ],
};

/** Sample gear at the Harbourmaster's counter: a ship of level 14 with a fleet, or none kept yet. */
function harbourGear(fleet: boolean): GearState {
  const sample = sampleGear();
  const ship: GearShip = {
    xp: 120_000n,
    level: 14,
    prestige: 0,
    attack: 220,
    defense: 180,
    toNext: 0.4,
    toNextNeeds: 9_000,
    stocks: [150, 90, 120, 3],
    hands: 20,
    handsMost: 20,
    officers: [],
    offers: [],
    trim: [],
    pledge: 0,
    ...(fleet ? FLEET : { fleet: [], sailed: 0, dresses: [] }),
  };
  return { ...sample, aurem: 12_480, emblem: 4, ship };
}

/** The menu open at the counter's part `shelf` over `gear`, a frame at a time. */
function counterShot(shelf: string, gear: GearState): (ui: Interface) => Node {
  const here = () => ({ gear, ask: () => undefined, forge: null, dress: null });
  const stack = new Stack();
  stack.add(
    startGearWindow(
      () => false,
      null,
      here,
      () => null,
      undefined,
      undefined,
      here,
      null,
      null,
      builds,
    ),
  );
  let opened = false;
  return (ui) => {
    if (!opened) {
      window.dispatchEvent(new CustomEvent(OPEN_AT, { detail: { view: 'harbourmaster', shelf } }));
      opened = true;
    }
    return stack.node(ui);
  };
}

export const harbourShipyard = counterShot('shipyard', harbourGear(true));
export const harbourPaint = counterShot('paint', harbourGear(true));
export const harbourName = counterShot('name', harbourGear(true));
export const harbourShipless = counterShot('shipyard', harbourGear(false));
