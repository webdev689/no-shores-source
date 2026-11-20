// A player's gear for the page's tests: an empty state, an item and a standing, each filled in by the fields a test
// names.
import type { GearItem, GearState, GearStanding } from './gearMessages.ts';

export const item = (fields: Partial<GearItem>): GearItem => ({
  id: 1,
  kind: 2,
  rarity: 0,
  level: 1,
  named: null,
  name: 0,
  resource: null,
  breach: false,
  xp: 0,
  xpMost: 0,
  bought: 0,
  chosen: [],
  bucket: 0,
  at: 0,
  attack: 0,
  defense: 0,
  prestige: 0,
  columns: [],
  price: 0,
  element: 0,
  ...fields,
});

export const standing = (fields: Partial<GearStanding>): GearStanding => ({
  pledge: 0,
  reputation: [0, 0, 0],
  packages: [0, 0, 0],
  artLevels: [1, 1, 1],
  artXp: [0, 0, 0],
  artOwned: [0, 0, 0],
  ...fields,
});

export const state = (fields: Partial<GearState>): GearState => ({
  xp: 0n,
  level: 1,
  prestige: 0,
  defense: 0,
  aurem: 0,
  stocks: [0, 0, 0, 0, 0],
  resources: [],
  items: [],
  vestiges: [],
  drops: [],
  spent: [],
  atMage: false,
  answer: 0,
  answered: 0,
  nodes: [],
  wares: [],
  identified: 0,
  ...fields,
});
