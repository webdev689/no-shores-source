// Pictures of the Character page's Mount slot, headless (`tools/uiShot.mjs`): the menu as the game opens it over sample
// gear, with a horse worn or none, drawn by the forge's published renders where they can be fetched; a click on the
// Appearance button shows that screen. The game never imports it.

import { COSMETICS } from '../forge/cosmetics.ts';
import type { GearState } from '../network/gearMessages.ts';
import { type Card, type CardMaker, openCards } from '../player/cards.ts';
import { type Dress, plainDress } from '../player/dressing.ts';
import { HORSE, MOUNT_SLOT, WORN } from '../player/gear.ts';
import { gearOutfit } from '../player/gearLooks.ts';
import type { Node } from '../ui/node.ts';
import { Stack } from '../ui/stack.ts';
import type { Interface } from '../ui/ui.ts';
import { OPEN_AT } from './gearScreen.ts';
import { sampleGear, sampleItem } from './gearShots.ts';
import { startGearWindow } from './gearWindow.ts';

/** A maker that is never asked for a card: the menu's pictures are composed, not drawn in the scene. */
const NO_SCENE: CardMaker = {
  card: () => ({}) as Card,
  glow: () => {
    throw new Error('no glow on a page');
  },
};
const forging = openCards(NO_SCENE).then(
  (opened) => opened.forge,
  () => null,
);
let forge: Awaited<typeof forging> = null;
void forging.then((opened) => (forge = opened));

const numberOf = (id: string) => COSMETICS.findIndex((each) => each.id === id);

/** Sample gear with the Chestnut Horse worn and two more carried, and the Dawnfire barding kept and worn; or none. */
function gearWith(horse: boolean): GearState {
  const sample = sampleGear();
  if (!horse) return sample;
  const horses = [
    sampleItem({ id: 41, kind: HORSE, name: 1, level: 1, at: WORN + MOUNT_SLOT, bucket: MOUNT_SLOT }),
    sampleItem({ id: 42, kind: HORSE, name: 0, level: 1, at: 0, bucket: MOUNT_SLOT }),
    sampleItem({ id: 43, kind: HORSE, name: 6, level: 1, at: 0, bucket: MOUNT_SLOT }),
  ];
  const worn = { dye: 0, coat: numberOf('chestnut'), barding: numberOf('dawnfire') };
  return { ...sample, items: [...sample.items, ...horses], cosmetics: [numberOf('dawnfire')], worn };
}

/** The menu open at `view` over `gear`, a frame at a time. */
function menuShot(view: string, gear: GearState): (ui: Interface) => Node {
  let dress: Dress | null = null;
  const here = () => {
    const wardrobe = forge?.wardrobe('human') ?? null;
    if (!dress && wardrobe) {
      const plain = plainDress('human', 0.3);
      dress = { ...plain, outfit: gearOutfit(gear, wardrobe, plain.outfit) };
    }
    return { gear, ask: () => undefined, forge, dress };
  };
  const stack = new Stack();
  stack.add(
    startGearWindow(
      () => false,
      null,
      here,
      () => null,
    ),
  );
  let opened = false;
  return (ui) => {
    if (!opened) {
      window.dispatchEvent(new CustomEvent(OPEN_AT, { detail: { view } }));
      opened = true;
    }
    return stack.node(ui);
  };
}

export const characterNoHorse = menuShot('character', gearWith(false));
export const characterHorse = menuShot('character', gearWith(true));
