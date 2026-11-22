// Sample data for pictures of the Test Ground's panels, headless (`tools/uiShot.mjs`): a small forge, a roster of foes,
// the figures and the player's gear. The page never imports it.
import type { ForgeLooks } from '../forge/looks.ts';
import type { HairColours } from '../forge/skins.ts';
import type { ArtState } from '../network/artMessages.ts';
import type { GearState } from '../network/gearMessages.ts';
import { item, standing, state } from '../network/gearForTests.ts';
import { plainDress } from '../player/dressing.ts';
import type { Placed } from '../player/figures.ts';
import type { FoeType } from '../rules/roster.ts';
import type { Node } from '../ui/node.ts';
import type { Interface } from '../ui/ui.ts';
import { AimPanel } from './aimPanel.ts';
import { artsNodes } from './artsPanel.ts';
import { FeelPanel } from './feelPanel.ts';
import { GearPanel } from './gearPanel.ts';
import { Panel, type PanelState } from './panel.ts';
import { panels } from './panelKit.ts';
import { statusNodes } from './statusPanel.ts';

const cell = (frames: number) => ({ cell: [0, 0] as const, frames, root: [0, 0] as const });
const LAYERS = [
  'helm_iron',
  'pauldrons_iron',
  'cuirass_iron',
  'gauntlets_iron',
  'greaves_iron',
  'boots_iron',
  'cuirass_leather',
  'boots_leather',
  'shirt_linen',
  'trousers_wool',
  'cloak_long',
  'hood_up',
  'hair_crop',
  'hair_tied',
  'sword_iron',
  'mace_iron',
  'shield_kite_iron',
  'torch_l',
];

export const SAMPLE_LOOKS: ForgeLooks = {
  bodies: {
    male: {
      anims: { idle: cell(4), walk: cell(8), attack: cell(9), cast: cell(6) },
      layers: Object.fromEntries(LAYERS.map((layer) => [layer, ['idle']])),
    },
    female: { anims: { idle: cell(4) }, layers: {} },
  },
  dye: ['shirt_linen', 'cloak_long'],
  looks: { guard: { body: 'male', gear: ['cuirass_iron', 'helm_iron'], weapon: 'sword_iron' } },
};

export const SAMPLE_HAIR = {
  bodies: { male: { '*': { black: [], brown: [], red: [] } } },
} as unknown as HairColours;

export const SAMPLE_ROSTER: readonly FoeType[] = [
  {
    type: 1,
    name: 'Deckhand',
    faction: 1,
    factionName: 'Pirates',
    domain: 'deck',
    role: 0,
    ranks: [0, 1],
    right: null,
    left: null,
  },
  {
    type: 2,
    name: 'Gunner',
    faction: 1,
    factionName: 'Pirates',
    domain: 'land',
    role: 1,
    ranks: [0],
    right: null,
    left: null,
  },
  {
    type: 3,
    name: 'Tithe Warden',
    faction: 2,
    factionName: 'Grey Tithe',
    domain: 'land',
    role: 0,
    ranks: [0, 1, 2],
    right: null,
    left: null,
  },
];

/** The player and one figure placed ahead, the player chosen. */
export function sampleFigures(): Placed[] {
  const you: Placed = {
    id: 1,
    x: 0,
    y: 0,
    z: 0,
    facing: 0,
    dress: plainDress('human', 0.3),
    anim: 'idle',
    frame: null,
    spin: false,
  };
  const other: Placed = {
    id: 2,
    x: 0,
    y: -3,
    z: 0,
    facing: Math.PI,
    dress: plainDress('human', 0.6),
    anim: 'walk',
    frame: null,
    spin: true,
  };
  return [you, other];
}

const perk = (kind: number, growth: number) => ({
  kind,
  traits: ['light_grip', 'weighted'],
  xp: growth,
  aurem: 200,
  fragments: 4,
  essence: 1,
  resource: 0,
});

/** A player at level 14: a sword with its nodes and pieces worn, more carried, one in the vault, three Vestiges. */
export const sampleGearState = (): GearState =>
  state({
    xp: 12_000n,
    level: 14,
    prestige: 39,
    defense: 198,
    aurem: 12_480,
    stocks: [14, 6, 2, 0, 3],
    resources: [4, 0, 12, 1],
    items: [
      item({
        id: 1,
        kind: 2,
        rarity: 3,
        level: 14,
        at: 2,
        attack: 212,
        prestige: 9,
        xp: 500,
        xpMost: 900,
        columns: [perk(3, 100), perk(4, 400), perk(5, 900)],
        bought: 3,
        chosen: [0],
      }),
      item({ id: 2, kind: 8, rarity: 2, level: 12, at: 3, attack: 160, prestige: 4 }),
      item({ id: 3, kind: 23, rarity: 1, level: 12, at: 4, defense: 40 }),
      item({ id: 7, kind: 2, rarity: 2, level: 13, attack: 230, columns: [perk(3, 100)] }),
      item({ id: 8, kind: 33, rarity: 4, level: 14, attack: 251, prestige: 14 }),
      item({ id: 9, kind: 5, rarity: 0, level: 2, at: 1, attack: 40 }),
    ],
    vestiges: [
      { id: 1, rarity: 1, slot: 0, level: 10, vaulted: false },
      { id: 2, rarity: 3, slot: 2, level: 12, vaulted: true },
    ],
    drops: [{ id: 1, rarity: 0, slot: 0, at: [0, 0, 0], kind: 0, from: [0, 0, 0], flying: 0, tier: 0 }],
    ammo: 18,
    ammoMost: 24,
    crates: 2,
  });

export const SAMPLE_ARTS: ArtState = {
  art: 1,
  cores: [
    [0, 1, null],
    [null, null, null],
    [null, null, null],
  ],
  anima: 0,
  tenets: [0, 0],
};
export const SAMPLE_STANDING = standing({ artLevels: [5, 3, 5] });

const none = () => undefined;

/** The panels as the page builds them, with the samples, kept for each interface across its frames. */
function built(): (ui: Interface) => Node {
  const figures = sampleFigures();
  const handlers = {
    add: none,
    remove: none,
    choose: none,
    change: none,
    fps: none,
    act: none,
    wear: none,
    carry: none,
    fight: none,
  };
  const panel = new Panel(SAMPLE_ROSTER, handlers);
  const aim = new AimPanel(none);
  const feel = new FeelPanel(none);
  const gear = new GearPanel(none);
  const state: PanelState = {
    looks: SAMPLE_LOOKS,
    hair: SAMPLE_HAIR,
    figures,
    remote: new Set(),
    chosen: figures[0] ?? null,
    fps: 6,
    playerId: 1,
    worn: { melee: 2, ranged: 0 },
    light: null,
    playing: false,
    status: 'Click the view to play.',
  };
  const view = { gear: sampleGearState(), atStall: true, nodesInReach: [{ node: 0, resource: 1 }] };
  return (ui) => {
    if (ui.store.get('shot:open')) gear.open = 1;
    return panels(
      ui,
      [
        ...panel.node(ui, state),
        ...aim.node(ui),
        ...statusNodes(ui, none),
        ...artsNodes(ui, none, SAMPLE_ARTS, SAMPLE_STANDING),
        ...feel.node(ui),
      ],
      gear.node(ui, ui.store.get('shot:waiting') ? { ...view, gear: null } : view, 1 / 60),
    );
  };
}

const made = new WeakMap<Interface, (ui: Interface) => Node>();
const once = (ui: Interface) => {
  const build = made.get(ui) ?? built();
  made.set(ui, build);
  return build(ui);
};

/** The two panels either side of an empty view. */
export const testgroundShot = (ui: Interface): Node => once(ui);

/** The same, the first worn item's nodes open. */
export function testgroundNodesShot(ui: Interface): Node {
  ui.store.set('shot:open', true);
  return once(ui);
}

/** The same before the room has sent the gear. */
export function testgroundWaitingShot(ui: Interface): Node {
  ui.store.set('shot:waiting', true);
  return once(ui);
}
