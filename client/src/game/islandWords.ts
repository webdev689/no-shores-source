// What the panel over an island says, docked at its port or gone ashore on its coast, in place of marks on the map:
// its port (a snapshot of the city, its counters and its moorings), the Playlist beside it, and its patrol zones,
// Elite Dungeons, missions, world boss and outpost, each with its levels, its state and what choosing it does. The
// day's and week's draws (`activities.ts`) add what is on there today and this week; before they are read it says
// what the island holds alone.
import type { Activities, Gates } from './activities.ts';
import { levelWords } from './activityWords.ts';
import { ISLANDS } from './hudLaw.ts';
import type { Landmass } from './landmass.ts';
import { LOCKED_WORDS, portOf, socialLater, socialLocked } from './nodes.ts';
import type { PlaylistKind } from './playlistWords.ts';
import { lockedWords, type NodeKind, type NodeInfo } from './worldData.ts';

/** What choosing an entry does: lands at its node, opens its Elite Dungeon's card to go in from the sea, or opens the
 *  Playlist beside the port. */
export type IslandDoes = 'land' | 'dungeon' | 'playlist';

/** One entry of the panel: its id (a node's, or the Playlist's `<city>-playlist`), its kind, its name and the line
 *  under it, its details as label and value, why it cannot be chosen if it cannot, and its press. */
export interface IslandEntry {
  readonly id: string;
  readonly kind: NodeKind | 'playlist';
  readonly name: string;
  readonly line: string;
  readonly rows: readonly (readonly [string, string])[];
  readonly shut: string | null;
  readonly act: { readonly words: string; readonly does: IslandDoes };
}

/** The Playlist's banner: its entry, and its four crests, shut or open. */
export interface PlaylistBanner extends IslandEntry {
  readonly crests: readonly { readonly kind: PlaylistKind; readonly name: string; readonly shut: boolean }[];
}

/** The whole panel: the island's name, where the ship lies off it, its level at Normal, its port and the Playlist
 *  when docked, and its places by kind. */
export interface IslandPanel {
  readonly title: string;
  readonly where: string;
  readonly band: string | null;
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
  { kind: 'outpost', title: 'Outpost', line: 'Outpost site' },
];

const LAND = { words: 'Land here', does: 'land' } as const;

/** The island's band at a tier (0 Normal to 2 Abyss), in words, once the draws are read. */
const bandOf = (facts: IslandFacts, continent: string, tier: number): string | null => {
  const band = facts.activities?.bands[continent]?.[tier];
  return band ? levelWords(band) : null;
};

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
    ['Dungeons', today ? `Three; its ${ordinal(today.number)} is the dungeon of the day` : 'Three, laid by the Forge'],
    ['Resources', resources],
    ['Foes', node.foes?.length ? `${node.foes.length} sites of the Grey Tithe` : 'The Grey Tithe'],
    ['Elite seas', harder(1)],
    ['Abyss seas', harder(2)],
  ];
  if (today && facts.activities) rows.push(["Today's modifier", modifierNames(facts, [facts.activities.dayModifier])]);
  return { ...base(node, 'Patrol zone', facts, shut), rows, act: LAND };
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
    ['The run', 'Four or five blocks, two or three seals, and its Boss in a Court of wards'],
    ['Company', 'Up to four, matched or with your company'],
    ['Pays', 'Its kills, its cache and its clear'],
  ];
  if (week) rows.push([`${which} of the week`, `Level ${week.level}, ${modifierNames(facts, week.modifiers)}`]);
  const gate = facts.gates?.eliteDungeon ?? null;
  return {
    ...base(node, 'Elite Dungeon', facts, shut ?? gate),
    rows,
    act: { words: 'Go in from the sea', does: 'dungeon' },
  };
}

/** What every entry of a node starts from: its id, kind and name, its line (its kind and levels, or why it is shut),
 *  and why it is shut. */
function base(node: NodeInfo, kind: string, facts: IslandFacts, shut: string | null) {
  const band = bandOf(facts, node.continent, 0);
  const line = shut ?? (band ? `${kind} · ${band}` : kind);
  return { id: node.id, kind: node.kind, name: node.name, line, shut };
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
function portEntry(landmass: Pick<Landmass, 'plan' | 'nodes'>, island: string): IslandEntry | null {
  const port = portOf(landmass.plan);
  const social = landmass.nodes.find((node) => node.kind === 'social');
  if (!port || !landmass.plan || !social) return null;
  const counters = [...new Set((social.stations ?? []).map((station) => COUNTERS[station.kind] ?? station.kind))];
  const shut = shutOf(social);
  const moorings = landmass.plan.social.moorings?.length ?? 0;
  return {
    id: social.id,
    kind: 'social',
    name: port.name,
    line: shut ? `Port city · ${shut}` : 'Port city · its social space open',
    rows: [
      ['Island', island],
      ['Counters', counters.length ? counters.join(', ') : 'None yet'],
      ['Moorings', moorings ? `${moorings} ships moored by its pier` : 'Its roadstead'],
      ['Playlist', 'Elite and Abyss dungeons, queued from here'],
    ],
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
        ['Elite of the week', `${facts.named(drawn.weekElite.place)}, level ${drawn.weekElite.level}`],
        ['Abyss of the week', `${facts.named(drawn.weekAbyss.place)}, level ${drawn.weekAbyss.level}`],
        ['Rewards', 'A daily first clear, and a weekly at three clears'],
      ]
    : [['Rewards', 'A daily first clear, and a weekly at three clears']];
  return {
    id: `${city}-playlist`,
    kind: 'playlist',
    name: 'Playlist',
    line: 'Elite and Abyss dungeons, matchmade from any port',
    rows,
    shut: null,
    act: { words: 'Open the Playlist', does: 'playlist' },
    crests: [
      { kind: 'elite', name: 'Elite', shut: false },
      { kind: 'abyss', name: 'Abyss', shut: false },
      { kind: 'week-elite', name: "Week's Elite", shut: (facts.gates?.weekElite ?? null) !== null },
      { kind: 'week-abyss', name: "Week's Abyss", shut: (facts.gates?.weekAbyss ?? null) !== null },
    ],
  };
}

/** The panel over `landmass`, `docked` at its port or gone ashore on its coast. A desolate city's social space is no
 *  landing and is listed nowhere. */
export function islandPanelOf(
  landmass: Pick<Landmass, 'id' | 'plan' | 'nodes'>,
  docked: boolean,
  facts: IslandFacts,
): IslandPanel {
  const island = ISLANDS[landmass.id] ?? landmass.plan?.name ?? 'The island';
  const port = docked ? portEntry(landmass, island) : null;
  const city = docked && port && landmass.plan ? landmass.plan.id : null;
  const groups = GROUPS.flatMap(({ kind, title, line }) => {
    const entries = landmass.nodes
      .filter((node) => node.kind === kind)
      .map((node): IslandEntry => {
        const shut = shutOf(node);
        if (kind === 'patrol') return patrolEntry(node, facts, shut);
        if (kind === 'dungeon') return dungeonEntry(node, facts, shut);
        return { ...base(node, line, facts, shut), rows: [], act: LAND };
      });
    return entries.length ? [{ title, entries }] : [];
  });
  return {
    title: island,
    where: docked && port ? `Docked at ${port.name}` : `Ashore on the coast of ${island}`,
    band: bandOf(facts, landmass.nodes[0]?.continent ?? landmass.id, 0),
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
