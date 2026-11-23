// Another player's character as the Character tab draws one, from what their room kept for others to see (the
// accounts' details): each piece they wear in its slot, their level, Defense and Prestige, the emblem they wear, and
// the Art they wear at its level. What only its own player sees (XP, the next level's meter, Fruit of Dagon, their
// bags and vault) stays empty, and nothing in it can be asked of a room.
import type { Details } from '../../network/accounts.ts';
import type { GearColumn, GearItem, GearState } from '../../network/gearMessages.ts';
import { WORN } from '../../player/gear.ts';
import { ARTS } from '../artsCards.ts';
import { EMBLEMS } from '../emblemArt.ts';

/** A gilded piece is drawn with every node bought: one column with nothing in it, its one node bought. */
const GILDED: readonly GearColumn[] = [{ kind: 0, traits: [], xp: 0, aurem: 0, fragments: 0, essence: 0, resource: 0 }];

/** The gear the Character tab draws another player by; null for one who has not played online, whose room kept
 *  nothing. */
export function inspectedGear(found: Details): GearState | null {
  const shown = found.shown;
  if (!shown) return null;
  const items = shown.worn.map((piece, index): GearItem => ({
    id: piece.id ?? index + 1,
    kind: piece.kind,
    rarity: piece.rarity,
    level: piece.level,
    named: piece.named ?? null,
    name: piece.name,
    resource: null,
    breach: false,
    xp: 0,
    xpMost: 0,
    bought: piece.gilded ? 1 : 0,
    chosen: [],
    bucket: 0,
    at: WORN + piece.slot,
    attack: piece.attack,
    defense: piece.defense,
    prestige: 0,
    columns: piece.gilded ? GILDED : [],
    price: 0,
    element: piece.element,
    source: piece.source ?? 0,
  }));
  const art = shown.art ?? 0;
  const emblem = EMBLEMS.findIndex((each) => each.id === shown.emblem);
  return {
    xp: 0n,
    level: shown.level,
    prestige: shown.prestige ?? 0,
    defense: shown.defense,
    aurem: 0,
    stocks: [0, 0, 0, 0, 0],
    resources: [],
    items,
    vestiges: [],
    drops: [],
    spent: [],
    atMage: false,
    answer: 0,
    identified: 0,
    answered: 0,
    nodes: [],
    wares: [],
    ...(emblem >= 0 && { emblem }),
    ...(art !== 0 && { arts: { art, cores: [], anima: 0, tenets: [0, 0] as const } }),
    standing: {
      pledge: 0,
      reputation: [0, 0, 0],
      packages: [0, 0, 0],
      artLevels: ARTS.map((each) => (each.id === art ? (shown.art_level ?? 1) : 1)),
      artXp: ARTS.map(() => 0),
      artOwned: ARTS.map(() => 0),
    },
  };
}
