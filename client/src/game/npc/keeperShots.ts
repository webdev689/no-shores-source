// Pictures of the keepers' screens after Destiny 2's vendor screen, headless (`tools/uiShot.mjs`): the menu as the
// game opens it at a counter over sample gear, the keepers drawn by the forge's published renders where they can be
// fetched (on port 5173 alone). The game never imports it.

import type { GearState } from '../../network/gearMessages.ts';
import { ARRIVED, GEAR, LETTERS } from '../journalShots.ts';
import { menuShot } from '../mountShots.ts';
import { COUNTERS, QUESTS } from '../quests/questBook.ts';
import { giftNotice } from '../quests/questNews.ts';
import { bookCard, questCardNode } from '../quests/questCard.ts';
import { type Notice, Obtained, obtainedLayer } from '../obtained.ts';
import type { Node } from '../../ui/node.ts';
import type { Interface } from '../../ui/ui.ts';
import { keeperMarkSvg } from './npcMarks.ts';

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

/** The menu at `view` over `gear` with `notice` standing at the foot, as the game lays its notices over every layer. */
function withNotice(view: string, gear: GearState, notice: Notice): (ui: Interface) => Node {
  const menu = menuShot(view, gear);
  const obtained = new Obtained(() => undefined);
  obtained.notify(notice);
  // A still clock: a picture's frames take longer than a notice stands.
  const layer = obtainedLayer(
    () => false,
    obtained,
    () => 0,
  );
  return (ui) => ({ width: 'grow', height: 'grow', children: [menu(ui), layer(ui)] });
}

export const acquiredNotice = withNotice('weaponsmith', ACQUIRED, {
  title: 'Quest acquired',
  line: 'A House of Your Own. Follow its steps in the tracker.',
  icon: { key: 'keeper weaponsmith', svg: keeperMarkSvg('weaponsmith') },
});
export const armourNotice = withNotice('armorsmith', ARRIVED, giftNotice('armour'));
export const horseNotice = withNotice('tack', GEAR, giftNotice('horse'));
/** The card the Journal's hover card shows for the quest walked, as its keeper offered it, its objectives ticked. */
export const journalCard = (): Node => {
  const offered = ACQUIRED.quest ? bookCard('house', ACQUIRED.quest) : null;
  return { padding: 40, fill: '#0e1013', children: [offered && questCardNode(offered, 560, 2)] };
};
