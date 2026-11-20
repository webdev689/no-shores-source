// A faction's counter, after Destiny 1's faction vendors: the player's reputation with them and the packages it has
// left waiting, the pledge, the cape sold only to the pledged, the faction's Art with its level and the rise its full
// bar allows, and the Art's six fragments, sold from the first rank. Numbers from content/gear/factions.json and
// content/arts/arts.json; the player's standing from the room's word.
import factions from '../../../../content/gear/factions.json' with { type: 'json' };
import arts from '../../../../content/arts/arts.json' with { type: 'json' };
import cosmetics from '../../../../content/gear/cosmetics.json' with { type: 'json' };
import emblems from '../../../../content/gear/emblems.json' with { type: 'json' };
import { ASKS, type GearState, type Standing } from '../../network/gearMessages.ts';
import { CARRIED, NAMED, RARITIES, SLOTS } from '../../player/gear.ts';
import { ARTS } from '../artsCards.ts';
import { CARRIED_MOST, VESTIGES_MOST } from '../gearCards.ts';
import { type Row, type Ware, rarityNamed } from './npcWares.ts';

/** The fragment a rise names when there is none left to choose, which the rules do not read. */
const NO_FRAGMENT = 255;
const NO_FRAGMENT_LEFT = 'No fragment left to choose';
/** The highest level an Art reaches. */
const ART_MOST = 5;
const PER_RANK = factions.reputationPerRank;
const SLOT_CLOAK = SLOTS.indexOf('cloak');

/** A faction by its number, with its place in the list, and its Art with its place in the Arts' list. */
export function factionOf(id: number) {
  const place = factions.factions.findIndex((each) => each.id === id);
  const faction = factions.factions[place];
  if (!faction) return null;
  const artPlace = ARTS.findIndex((art) => art.id === faction.art);
  const art = ARTS[artPlace];
  return art ? { faction, place, art, artPlace } : null;
}

/** A standing for a player the room has said nothing of yet: pledged to none, every Art at level 1. */
const NO_STANDING: Standing = { pledge: 0, reputation: [], packages: [], artLevels: [], artXp: [], artOwned: [] };

/** The player's rank with a faction and the meter to the next: every rank is the same span of reputation. */
export function reputationOf(id: number, standing: Standing = NO_STANDING) {
  const earned = standing.reputation[factionOf(id)?.place ?? -1] ?? 0;
  const rank = Math.floor(earned / PER_RANK);
  const into = earned - rank * PER_RANK;
  return {
    rank,
    toNext: into / PER_RANK,
    words: `${into.toLocaleString('en')} of ${PER_RANK.toLocaleString('en')} to rank ${rank + 1}`,
  };
}

/** A piece a faction keeps for a rank: its source in its own catalogue names the faction and the rank. */
interface Kept {
  readonly source: { readonly kind: string; readonly faction?: number; readonly rank?: number };
}
const rankOf = (pieces: readonly Kept[], id: number) =>
  pieces.find((piece) => piece.source.kind === 'faction' && piece.source.faction === id)?.source.rank ?? null;

/** What a faction's ranks keep, in words: its emblem's rank and its dye's, from their catalogues, and the packages. */
export function rankRewards(id: number): string {
  const [emblem, dye] = [rankOf(emblems.emblems, id), rankOf(cosmetics.cosmetics, id)];
  return [
    emblem === null ? '' : `Rank ${emblem} keeps their emblem.`,
    dye === null ? '' : `Rank ${dye} keeps their dye.`,
    `Every rank from ${factions.packagesFromRank} leaves a package here.`,
  ]
    .filter(Boolean)
    .join(' ');
}

const plain = { rarity: null, price: null, short: false, note: '', ask: null } as const;

/** What an Art's rise takes beyond Aurem, in words, and whether the player holds it. */
function riseMore(gear: GearState, fragments: number, essence: number) {
  const [weapon = 0, armor = 0, weaponEssence = 0, armorEssence = 0] = gear.stocks;
  const more = [
    fragments ? `${fragments} Weapon and ${fragments} Armor Fragments` : '',
    essence ? `${essence} Weapon and ${essence} Armor Essence` : '',
  ].filter(Boolean);
  const held = weapon >= fragments && armor >= fragments && weaponEssence >= essence && armorEssence >= essence;
  return { more: more.join(', '), held };
}

/** The faction `id`'s rows; `choosing`, the Art's rise waits on the fragment it takes. */
export function factionRows(id: number, gear: GearState, choosing: boolean): Row[] {
  const found = factionOf(id);
  if (!found) return [];
  const { faction, art, artPlace } = found;
  const standing = gear.standing ?? NO_STANDING;
  const { rank } = reputationOf(id, standing);
  const waiting = standing.packages[found.place] ?? 0;
  // A package holds a Vestige, so none is collected while ten are carried.
  const room = gear.vestiges.filter((each) => !each.vaulted).length < VESTIGES_MOST;
  const packages: Ware[] = Array.from({ length: waiting }, (unused, nth) => ({
    ...plain,
    key: `package-${nth}`,
    name: 'Package',
    rarity: 2,
    picture: { kind: 'package' },
    about: `From the ${faction.name}`,
    words: 'A Vestige and Aurem, left for you as your rank rose.',
    note: room ? '' : 'Ten Vestiges carried',
    ask: room ? { kind: ASKS.collectPackage, column: id } : null,
  }));
  const pledged = standing.pledge === id;
  const switching = standing.pledge !== 0 && !pledged;
  const cost = factions.pledgeSwitchAurem;
  const pledgeShort = switching && gear.aurem < cost;
  const pledge: Ware = {
    ...plain,
    key: 'pledge',
    name: pledged ? `Pledged to the ${faction.name}` : `Pledge to the ${faction.name}`,
    picture: { kind: 'emblem', emblem: faction.emblem },
    about: pledged ? 'Pledged' : switching ? 'Your pledge moves here' : 'Your first pledge is free',
    words: faction.words,
    price: switching ? { amount: cost, currency: 'aurem' } : null,
    short: pledgeShort,
    note: pledged ? 'Pledged' : '',
    ask: pledged ? null : { kind: ASKS.pledge, column: id },
  };
  const rows: Row[] = [
    { heading: 'Reputation', wares: packages, empty: 'No packages wait for you.' },
    { heading: 'Pledge', wares: [pledge] },
  ];
  if (pledged) {
    const kept = gear.items.find((each) => each.named === faction.cape) ?? null;
    const named = NAMED.find((each) => each.id === faction.cape);
    const rarity = kept?.rarity ?? rarityNamed(named?.rarity ?? '');
    // The room refuses a cape while the cloaks carried are full, as it refuses any piece.
    const cloaks = gear.items.filter((each) => each.at === CARRIED && each.bucket === SLOT_CLOAK).length;
    const full = !kept && cloaks >= CARRIED_MOST;
    rows.push({
      heading: 'Cape',
      wares: [
        {
          key: 'cape',
          name: named?.name ?? faction.cape,
          rarity,
          picture: kept ? { kind: 'item', item: kept } : { kind: 'initials' },
          // Named pieces are made at level 1, so any level may wear one.
          about: `${RARITIES[rarity]?.name ?? ''} Cloak · any level`,
          words: 'Earns their reputation while you wear it, pledged to them.',
          price: kept ? null : { amount: factions.capeAurem, currency: 'aurem' },
          short: !kept && gear.aurem < factions.capeAurem,
          note: kept ? 'Kept' : full ? 'Nine cloaks carried' : '',
          ask: kept || full ? null : { kind: ASKS.buyCape, column: id },
        },
      ],
    });
  }
  const level = standing.artLevels[artPlace] ?? 1;
  const earned = standing.artXp[artPlace] ?? 0;
  const owned = standing.artOwned[artPlace] ?? 0;
  const has = (place: number) => (owned & (1 << place)) !== 0;
  const bar = arts.levels.xp[level - 1] ?? 0;
  const highest = level >= ART_MOST;
  const ready = !highest && earned >= bar;
  const free = art.core.flatMap((fragment, place) => (has(place) ? [] : [{ fragment, place }]));
  const shown = {
    art: art.id,
    level,
    toNext: highest ? 1 : Math.min(1, earned / bar),
    words: highest
      ? 'The highest level'
      : ready
        ? 'Ready to rise'
        : `${earned.toLocaleString('en')} of ${bar.toLocaleString('en')} to level ${level + 1}`,
  };
  const artWare: Ware = {
    ...plain,
    key: 'art',
    name: `${art.name}, level ${level}`,
    picture: { kind: 'art', art: art.id },
    about: shown.words,
    words: art.blurb,
  };
  const artWares: Ware[] = [artWare];
  const rise = arts.levels.rise[level - 1];
  if (ready && rise) {
    const { more, held } = riseMore(gear, rise.fragments, rise.essence);
    const short = gear.aurem < rise.aurem || !held;
    // With every fragment owned there is none to choose: the rise asks at once, its fragment unread.
    const none = free.length === 0;
    artWares.push({
      ...plain,
      key: 'rise',
      name: `Rise to level ${level + 1}`,
      picture: { kind: 'art', art: art.id },
      about: none ? NO_FRAGMENT_LEFT : 'Choose a fragment to learn',
      words: none
        ? `The ${faction.name} raise your ${art.name} Art.`
        : `The ${faction.name} raise your ${art.name} Art, and teach you a fragment of its Core.`,
      price: { amount: rise.aurem, currency: 'aurem', ...(more ? { more } : {}) },
      short,
      ...(none
        ? { note: NO_FRAGMENT_LEFT, ask: { kind: ASKS.riseArt, column: art.id, node: NO_FRAGMENT } }
        : { opens: 'rise' as const }),
    });
  }
  rows.push({ heading: 'Art', wares: artWares, art: shown });
  if (choosing && ready && free.length > 0)
    rows.push({
      heading: 'Rise',
      wares: free.map(({ fragment, place }) => ({
        ...plain,
        key: `rise-${place}`,
        name: fragment.name,
        rarity: 3,
        picture: { kind: 'fragment', art: art.id, fragment: place },
        about: 'Learned as your Art rises',
        words: fragment.text,
        ask: { kind: ASKS.riseArt, column: art.id, node: place },
      })),
    });
  const ranked = rank >= factions.fragmentRank;
  rows.push({
    heading: 'Fragments',
    wares: art.core.map((fragment, place) => {
      const mine = has(place);
      const short = gear.aurem < factions.fragmentAurem;
      return {
        key: `fragment-${place}`,
        name: fragment.name,
        rarity: 3,
        picture: { kind: 'fragment', art: art.id, fragment: place },
        about: `A fragment of the ${art.name} Art`,
        words: fragment.text,
        price: mine || !ranked ? null : { amount: factions.fragmentAurem, currency: 'aurem' },
        short: !mine && ranked && short,
        note: mine ? 'Owned' : ranked ? '' : `From rank ${factions.fragmentRank}`,
        ask: mine || !ranked ? null : { kind: ASKS.buyFragment, column: art.id, node: place },
        dim: !mine,
      };
    }),
  });
  return rows;
}
