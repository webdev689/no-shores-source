// The website's pictures, each by its name: what stands where and in which light, drawn by the modules beside this
// one. Each is drawn from fixed seeds, so a picture is the same at every build. What each shows comes from the premise
// and the owner's decisions: Overlook a lantern-lit port stepping up Saltmere's rock, the Grey Tithe's grey
// sails, Thule's flagship, the call in the deep, the ruined ports overtaken by the Lattice's red and purple crystal,
// the shore the captain wakes on.
import { GAME_SCENES } from './gameScenes.ts';
import { heroLayers, shareCard } from './heroScene.ts';
import { LAND_SCENES } from './landScenes.ts';
import { QUAY_SCENES } from './quayScenes.ts';
import { SEA_SCENES } from './seaScenes.ts';
import type { Sheet } from '../../../client/src/art/sheet.ts';

/** Every picture the pages may name, by its name. */
export const SCENES: Readonly<Record<string, () => Sheet>> = {
  overlook: () => heroLayers().back,
  'overlook-lights': () => heroLayers().lights,
  ...SEA_SCENES,
  ...LAND_SCENES,
  ...QUAY_SCENES,
  ...GAME_SCENES,
  share: shareCard,
};
