// What the island's tiles say, docked at its port or gone ashore on its coast, in place of marks on the map: its port
// (a snapshot of the city, its counters and its moorings), the Playlist beside it, and its patrol zones, Elite
// Dungeons, missions, world boss and outpost, each with its levels, its state and what a click on it does, in words
// short enough for a tile. The day's and week's draws (`activities.ts`) add what is on there today and this week;
// before they are read it says what the island holds alone.
import type { Point2 } from '../overworld/ground.ts';
import { type MapRegion, nearestRegion, regionHolds, regionWords } from '../overworld/regions.ts';
import type { Activities, Gates } from './activities.ts';
import { type IconName, modifierIcon } from './journalIcons.ts';
import { levelWords } from './activityWords.ts';
import { ISLANDS } from './hudLaw.ts';
import type { Landmass } from './landmass.ts';
import { LOCKED_WORDS, portOf, socialLater, socialLocked } from './nodes.ts';
import type { PlaylistKind } from './playlistWords.ts';
import { lockedWords, type NodeKind, type NodeInfo } from './worldData.ts';

/** What choosing an entry does: lands at its node, opens its Elite Dungeon's card to go in from the sea, opens the
 *  Playlist beside the port, or opens the region's outpost slots. */
export type IslandDoes = 'land' | 'dungeon' | 'playlist' | 'outposts';

/** A detail a tile shows as a small icon in place of words: its icon, its colours where the icon takes others, what
 *  it says (read out, and the tile's label), and whether it stands dim. */
export interface IslandGlyph {
  readonly icon: IconName;
  readonly tones?: Readonly<Record<string, string>>;
  readonly says: string;
  readonly dim?: boolean;
}

/** One entry of the panel: its id (a node's, or the Playlist's `<city>-playlist`), its kind, its name and the line
 *  under it, its levels in short ("Lv 1–5"), its details as label and value and as glyphs, why it cannot be chosen if
 *  it cannot, and its press. An Elite Dungeon that is the week's Abyss is `abyss`. */
export interface IslandEntry {
  readonly id: string;
  readonly kind: NodeKind | 'playlist' | 'outposts';
  readonly name: string;
  readonly line: string;
  readonly levels: string | null;
  readonly rows: readonly (readonly [string, string])[];
  readonly glyphs: readonly IslandGlyph[];
  readonly shut: string | null;
  readonly act: { readonly words: string; readonly does: IslandDoes };
  readonly abyss?: boolean;
}

/** The Playlist's banner: its entry, and its four crests, shut or open. */
export interface PlaylistBanner extends IslandEntry {
  readonly crests: readonly { readonly kind: PlaylistKind; readonly shut: boolean }[];
}

/** One outpost slot of a region: its node's id and name, where it stands, whether the player's guild holds an outpost
 *  there, and why it cannot be landed at if it cannot. */
export interface OutpostSlot {
  readonly id: string;
  readonly name: string;
  readonly at: Point2;
  readonly ours: boolean;
  readonly shut: string | null;
}

/** The region's Outposts tile: its slots, and the points its chart is framed on (its places and its centre). */
export interface OutpostsEntry extends IslandEntry {
  readonly slots: readonly OutpostSlot[];
  readonly area: readonly Point2[];
}

/** Each kind of tile in a word or two, said after its levels ("Lv 1–5 · Patrol zone"). */
export const KIND_WORDS: Readonly<Record<IslandEntry['kind'], string>> = {
  social: 'Port',
  playlist: 'Playlist',
  patrol: 'Patrol zone',
  dungeon: 'Elite Dungeon',
  mission: 'Mission',
  boss: 'World boss',
  outpost: 'Outpost',
  outposts: 'Outposts',
};

/** A tile's line under its title: its levels and its kind, the kind left out where the title says it already. */
export const tagOf = (name: string, levels: string | null, kind: string): string =>
  [levels, name === kind ? null : kind].filter((part) => part !== null).join(' · ');

/** The whole panel: the island's name, where the ship lies off it, its level at Normal, its port and the Playlist
 *  when docked, and its places by kind. */
export interface IslandPanel {
  readonly title: string;
  readonly where: string;
  /** The island's levels at Normal in short, as a tile shows them. */
  readonly levels: string | null;
  readonly port: IslandEntry | null;
  readonly playlist: PlaylistBanner | null;
  readonly groups: readonly { readonly title: string; readonly entries: readonly IslandEntry[] }[];
}

/** The day's and week's draws and the character's gates, once read; and every node of the world by id, for the
 *  week's dungeons' names. */
export interface IslandFacts {
  readonly activities: Activities | null;
  readonly gates: Gates | null;
  readonly named: (id: string) => string;
  /** The sites the player's guild holds outposts at; none in no guild, or before the guild is read. */
  readonly ours?: readonly string[];
}

/** The counters a social space keeps, as the panel names them, by the city crate's station kind. */
const COUNTERS: Readonly<Record<string, string>> = {
  mage: 'Mage',
  vault: 'Vault',
  armorsmith: 'Armorsmith',
  weaponsmith: 'Weaponsmith',
  tailor: 'Tailor',
  tack: 'Tack',
  stormcallers: 'the houses',
  lamplighters: 'the houses',
  veiled: 'the houses',
  harbourmaster: 'Harbourmaster',
  chandler: 'Chandler',
  mail: 'Postmaster',
};

/** The places by kind, in the order the panel lists them after the port and the Playlist. */
const GROUPS: readonly { readonly kind: NodeKind; readonly title: string; readonly line: string }[] = [
  { kind: 'patrol', title: 'Patrol zones', line: 'Patrol zone' },
  { kind: 'dungeon', title: 'Elite Dungeons', line: 'Elite Dungeon' },
  { kind: 'mission', title: 'Missions', line: 'Mission' },
  { kind: 'boss', title: 'World boss', line: 'World boss' },
];

const LAND = { words: 'Land here', does: 'land' } as const;

/** The island's band at a tier (0 Normal to 2 Abyss), in words, once the draws are read. */
const bandOf = (facts: IslandFacts, continent: string, tier: number): string | null => {
  const band = facts.activities?.bands[continent]?.[tier];
  return band ? levelWords(band) : null;
};

/** A band in short, as a tile shows it: "Lv 1–5", "Lv 26". */
const shortBand = ([low, high]: readonly [number, number]): string =>
  low === high ? `Lv ${low}` : `Lv ${low}–${high}`;

/** The modifiers' icons, each saying its name, after `lead` where given ("Today: Burn (Shadow)"). */
const modifierGlyphs = (facts: IslandFacts, keys: readonly string[], lead?: string): IslandGlyph[] =>
  keys.flatMap((key) => {
    const icon = modifierIcon(key);
    const name = facts.activities?.modifiers[key]?.name ?? key;
    const says = lead ? `${lead}: ${name}` : name;
    return icon ? [{ icon: icon.name, ...(icon.tones && { tones: icon.tones }), says }] : [];
  });

/** Each detail's icon, by the label it is read under. */
const DETAIL_ICONS: Readonly<Record<string, IconName>> = {
  Counters: 'counters',
  Moorings: 'moorings',
  Dungeons: 'dungeon',
  Resources: 'resources',
  Foes: 'foes',
  'Elite seas': 'seas-elite',
  'Abyss seas': 'seas-abyss',
  Blocks: 'blocks',
  Seals: 'seals',
  Company: 'company',
  Pays: 'cache',
  Places: 'places',
  Slots: 'slots',
  "Your guild's": 'outpost',
  "Week's Elite": 'elite-dungeon',
  "Week's Abyss": 'abyss-dungeon',
  Rewards: 'cache',
};

/** The details as glyphs, each saying its label and value as the tile's label reads them; those labelled `dim`
 *  stand dim. */
const detailGlyphs = (rows: readonly (readonly [string, string])[], dim: readonly string[] = []): IslandGlyph[] =>
  rows.flatMap(([label, value]) => {
    const icon = DETAIL_ICONS[label];
    return icon ? [{ icon, says: `${label}: ${value}`, ...(dim.includes(label) && { dim: true }) }] : [];
  });

/** The modifiers' names by their keys, as the draws name them. */
const modifierNames = (facts: IslandFacts, keys: readonly string[]): string =>
  keys.map((key) => facts.activities?.modifiers[key]?.name ?? key).join(', ');

/** A patrol zone's entry: its levels, its three dungeons and whether one is today's, its resources, its foes' sites,
 *  and the harder seas. */
function patrolEntry(node: NodeInfo, facts: IslandFacts, shut: string | null): IslandEntry {
  const today = facts.activities?.ofTheDay.find((one) => one.patrol === node.id) ?? null;
  const holds = [...new Set((node.resources ?? []).flatMap((place) => (place.holds ? [place.holds] : [])))];
  const resources = node.resources?.length
    ? `${node.resources.length} places${holds.length ? `: ${holds.join(', ')}` : ''}`
    : 'None';
  const harder = (tier: number) => facts.gates?.seas[tier] ?? bandOf(facts, node.continent, tier) ?? '—';
  const rows: [string, string][] = [
    ['Dungeons', today ? `Three; today's is ${ordinal(today.number)}` : 'Three, laid by the Forge'],
    ['Resources', resources],
    ['Foes', node.foes?.length ? `${node.foes.length} sites of the Grey Tithe` : 'The Grey Tithe'],
    ['Elite seas', harder(1)],
    ['Abyss seas', harder(2)],
  ];
  // A harder sea's glyph stands dim while the character may not sail it.
  const shutSeas = ['Elite seas', 'Abyss seas'].filter(
    (_label, tier) => (facts.gates?.seas[tier + 1] ?? null) !== null,
  );
  const glyphs: IslandGlyph[] = [
    ...detailGlyphs(rows, shutSeas),
    ...(today && facts.activities ? modifierGlyphs(facts, [facts.activities.dayModifier], 'Today') : []),
  ];
  if (today && facts.activities) rows.push(['Today', modifierNames(facts, [facts.activities.dayModifier])]);
  return { ...base(node, 'Patrol zone', facts, shut), rows, glyphs, act: LAND };
}

/** A mission's or a world boss's details: its foes' sites and the places its layout names, where it has them. */
function placeRows(node: NodeInfo): [string, string][] {
  const rows: [string, string][] = [];
  if (node.foes?.length) rows.push(['Foes', `${node.foes.length} sites`]);
  const named = (node.places ?? []).map((place) => place.name);
  if (named.length)
    rows.push(['Places', named.length > 2 ? `${named.slice(0, 2).join(', ')} and more` : named.join(' and ')]);
  return rows;
}

const ordinal = (number: number): string => ['first', 'second', 'third'][number] ?? `${number + 1}th`;

/** An Elite Dungeon's entry: its run, its levels, whether it is one of the week's two, and its gate; its press opens
 *  its card to go in from the sea. */
function dungeonEntry(node: NodeInfo, facts: IslandFacts, shut: string | null): IslandEntry {
  const drawn = facts.activities;
  const week =
    drawn?.weekElite.place === node.id ? drawn.weekElite : drawn?.weekAbyss.place === node.id ? drawn.weekAbyss : null;
  const which = week && drawn && week === drawn.weekElite ? 'Elite' : 'Abyss';
  const rows: [string, string][] = [
    ['Blocks', 'Four or five, a Court'],
    ['Seals', 'Two or three, a Boss'],
    ['Company', 'Up to four, or matched'],
    ['Pays', 'Kills, cache and clear'],
  ];
  const glyphs: IslandGlyph[] = [
    ...detailGlyphs(rows),
    ...(week
      ? [
          {
            icon: which === 'Elite' ? 'elite-dungeon' : 'abyss-dungeon',
            says: `${which} of the week, level ${week.level}`,
          } as const,
          ...modifierGlyphs(facts, week.modifiers),
        ]
      : []),
  ];
  if (week) rows.push(['This week', `${which}, level ${week.level}, ${modifierNames(facts, week.modifiers)}`]);
  const gate = facts.gates?.eliteDungeon ?? null;
  return {
    ...base(node, 'Elite Dungeon', facts, shut ?? gate),
    rows,
    glyphs,
    act: { words: 'Go in from the sea', does: 'dungeon' },
    abyss: week !== null && which === 'Abyss',
  };
}

/** What every entry of a node starts from: its id, kind and name, its line (its kind and levels, or why it is shut),
 *  and why it is shut. */
function base(node: NodeInfo, kind: string, facts: IslandFacts, shut: string | null) {
  const band = bandOf(facts, node.continent, 0);
  const levels = facts.activities?.bands[node.continent]?.[0];
  const line = shut ?? (band ? `${kind} · ${band}` : kind);
  return { id: node.id, kind: node.kind, name: node.name, line, levels: levels ? shortBand(levels) : null, shut };
}

/** Why a node cannot be landed at: a patrol zone or mission no one may enter yet, or a social space still locked. */
const shutOf = (node: NodeInfo): string | null =>
  node.locked === true
    ? lockedWords(node.name)
    : socialLocked(node.id)
      ? socialLater(node.id)
        ? LOCKED_WORDS
        : lockedWords(node.name)
      : null;

/** The port's snapshot: the city, whether its social space is open, its counters and its moorings. */
function portEntry(landmass: Pick<Landmass, 'plan' | 'nodes'>): IslandEntry | null {
  const port = portOf(landmass.plan);
  const social = landmass.nodes.find((node) => node.kind === 'social');
  if (!port || !landmass.plan || !social) return null;
  const counters = [...new Set((social.stations ?? []).map((station) => COUNTERS[station.kind] ?? station.kind))];
  const shut = shutOf(social);
  const moorings = landmass.plan.social.moorings?.length ?? 0;
  const rows: [string, string][] = [
    ['Counters', counters.length ? counters.join(', ') : 'None yet'],
    ['Moorings', moorings ? `${moorings} ships by its pier` : 'Its roadstead'],
  ];
  return {
    id: social.id,
    kind: 'social',
    name: port.name,
    line: shut ? `Port city · ${shut}` : 'Port city · its plaza open',
    levels: null,
    rows,
    glyphs: detailGlyphs(rows),
    shut,
    act: { words: 'Land in its plaza', does: 'land' },
  };
}

/** The Playlist's banner beside a port city `city`: what is on today and this week, its four crests. */
function playlistBanner(city: string, facts: IslandFacts): PlaylistBanner {
  const drawn = facts.activities;
  const rows: [string, string][] = drawn
    ? [
        ['Today', modifierNames(facts, [drawn.dayModifier])],
        ["Week's Elite", `${facts.named(drawn.weekElite.place)}, level ${drawn.weekElite.level}`],
        ["Week's Abyss", `${facts.named(drawn.weekAbyss.place)}, level ${drawn.weekAbyss.level}`],
        ['Rewards', 'Daily, and three a week'],
      ]
    : [['Rewards', 'Daily, and three a week']];
  return {
    id: `${city}-playlist`,
    kind: 'playlist',
    name: 'Playlist',
    line: 'Elite and Abyss, matchmade',
    levels: null,
    rows,
    glyphs: [...(drawn ? modifierGlyphs(facts, [drawn.dayModifier], 'Today') : []), ...detailGlyphs(rows)],
    shut: null,
    act: { words: 'Open the Playlist', does: 'playlist' },
    crests: [
      { kind: 'elite', shut: (facts.gates?.playlists[0] ?? null) !== null },
      { kind: 'abyss', shut: (facts.gates?.playlists[1] ?? null) !== null },
      { kind: 'week-elite', shut: (facts.gates?.weekElite ?? null) !== null },
      { kind: 'week-abyss', shut: (facts.gates?.weekAbyss ?? null) !== null },
    ],
  };
}

/** The region's Outposts tile, one for all its outpost slots: their count and how many hold the player's guild's
 *  outposts, its levels the island's; none where the region holds no slot. Its press opens the slots to choose from. */
function outpostsEntry(
  landmass: Pick<Landmass, 'id' | 'nodes' | 'regions'>,
  region: MapRegion | null,
  named: string,
  facts: IslandFacts,
): OutpostsEntry | null {
  const regions = landmass.regions ?? [];
  const here = landmass.nodes.filter((node) => !region || regionHolds(regions, region, node.id));
  const sites = here.filter((node) => node.kind === 'outpost');
  const [first] = sites;
  if (!first) return null;
  const slots = sites.map((node): OutpostSlot => ({
    id: node.id,
    name: node.name,
    at: node.centre,
    ours: facts.ours?.includes(node.id) ?? false,
    shut: shutOf(node),
  }));
  const held = slots.filter((slot) => slot.ours).length;
  const rows: [string, string][] = [
    ['Slots', `${slots.length}`],
    ["Your guild's", held ? `${held}` : 'none'],
  ];
  const id = `outposts-${(region?.name ?? landmass.id).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  // A shut tile only where every slot is shut, saying the first's reason.
  const shut = slots.every((slot) => slot.shut !== null) ? (slots[0]?.shut ?? null) : null;
  return {
    ...base({ ...first, id, name: `Outposts of ${named}` }, 'Outposts', facts, shut),
    kind: 'outposts',
    rows,
    glyphs: detailGlyphs(rows, held ? [] : ["Your guild's"]),
    act: { words: 'Choose a slot', does: 'outposts' },
    slots,
    area: [...(region ? [region.centre] : []), ...here.map((node) => node.centre)],
  };
}

/** The panel over `landmass`, `docked` at its port or gone ashore on its coast. With the `ship`'s place, an island
 *  cut into regions shows the region it lies off (whose centre is nearest): its places, and the port and the Playlist
 *  only where it holds the port. A desolate city's social space is no landing and is listed nowhere. */
export function islandPanelOf(
  landmass: Pick<Landmass, 'id' | 'plan' | 'nodes' | 'regions'>,
  docked: boolean,
  facts: IslandFacts,
  ship?: Point2,
): IslandPanel {
  const island = ISLANDS[landmass.id] ?? landmass.plan?.name ?? 'The island';
  const regions = landmass.regions ?? [];
  const region = ship ? nearestRegion(regions, ship) : null;
  const harbour = landmass.plan?.harbour ?? null;
  const portHere = !region || (harbour !== null && nearestRegion(regions, harbour) === region);
  const port = docked && portHere ? portEntry(landmass) : null;
  const city = docked && port && landmass.plan ? landmass.plan.id : null;
  const normal = facts.activities?.bands[landmass.nodes[0]?.continent ?? landmass.id]?.[0];
  const groups = GROUPS.flatMap(({ kind, title, line }) => {
    const entries = landmass.nodes
      .filter((node) => node.kind === kind && (!region || regionHolds(regions, region, node.id)))
      .map((node): IslandEntry => {
        const shut = shutOf(node);
        if (kind === 'patrol') return patrolEntry(node, facts, shut);
        if (kind === 'dungeon') return dungeonEntry(node, facts, shut);
        const rows = placeRows(node);
        return { ...base(node, line, facts, shut), rows, glyphs: detailGlyphs(rows), act: LAND };
      });
    return entries.length ? [{ title, entries }] : [];
  });
  const named = region ? regionWords(region.name) : null;
  const outposts = outpostsEntry(landmass, region, named ?? island, facts);
  if (outposts) groups.push({ title: 'Outposts', entries: [outposts] });
  const ashore = named ? `Ashore on ${named}` : `Ashore on the coast of ${island}`;
  return {
    title: island,
    where: port ? `Docked at ${port.name}${named ? `, on ${named}` : ''}` : ashore,
    levels: normal ? shortBand(normal) : null,
    port,
    playlist: city ? playlistBanner(city, facts) : null,
    groups,
  };
}

/** Every entry of the panel, in the order it lists them. */
export const entriesOf = (panel: IslandPanel): IslandEntry[] => [
  ...(panel.port ? [panel.port] : []),
  ...(panel.playlist ? [panel.playlist] : []),
  ...panel.groups.flatMap((group) => group.entries),
];
