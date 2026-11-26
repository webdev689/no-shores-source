// Pictures of the keepers' screens after Destiny 2's vendor screen, headless (`tools/uiShot.mjs`): the menu as the
// game opens it at a counter over sample gear, the keepers drawn by the forge's published renders where they can be
// fetched (on port 5173 alone). The game never imports it.

import type { GearState } from '../../network/gearMessages.ts';
import { ARRIVED, GEAR, LETTERS } from '../journalShots.ts';
import { menuShot } from '../mountShots.ts';
import { COUNTERS, QUESTS } from '../quests/questBook.ts';

const place = (id: string) => QUESTS.findIndex((quest) => quest.id === id) + 1;
const taskOf = (id: string, task: string) => QUESTS[place(id) - 1]?.tasks.findIndex((each) => each.id === task) ?? 0;
const ROUND = taskOf('house', 'find-your-way');

/** A new arrival on the round, the stranger heard: the Weaponsmith offers it until it is acquired. */
const OFFERED: GearState = {
  ...ARRIVED,
  aurem: 0,
  quest: {
    quest: place('house'),
    task: ROUND,
    counts: [],
    done: [0, 0, 0, 0],
    choices: [0, 0, 0],
    at: null,
    offered: COUNTERS['weaponsmith'] ?? 0,
  },
};
/** The round acquired, the Weaponsmith and the Armorsmith heard. */
const ACQUIRED: GearState = { ...OFFERED, quest: { ...OFFERED.quest!, counts: [1, 1, 0, 0, 0, 0, 0], offered: 0 } };
/** Pledged to the Lamplighters a moment ago: Maren Hale offers their road. */
const ROAD: GearState = {
  ...GEAR,
  quest: {
    quest: place('lamplighters'),
    task: 0,
    counts: [],
    done: [1, 0, 0, 0],
    choices: [0, 0, 0],
    at: null,
    offered: 2,
  },
};

export const weaponsmithOffer = menuShot('weaponsmith', OFFERED);
export const weaponsmithAcquired = menuShot('weaponsmith', ACQUIRED);
export const lamplightersOffer = menuShot('lamplighters', ROAD);
export const lamplightersPlain = menuShot('lamplighters', GEAR);
export const armorsmithShot = menuShot('armorsmith', ARRIVED);
export const mageShot = menuShot('mage', GEAR);
export const vaultShot = menuShot('vault', GEAR);
export const mailShot = menuShot('mail', LETTERS);
export const tailorShot = menuShot('tailor', GEAR);
export const tackShot = menuShot('tack', GEAR);
export const shapeShot = menuShot('shape', GEAR);
export const harbourShot = menuShot('harbourmaster', GEAR);
export const boardShot = menuShot('board', GEAR);
