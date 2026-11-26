// The Test Room's six entries and the test room each launches: the Elite and Abyss Playlists (an Elite Dungeon drawn
// from the rules' list, its foes at the top band's level), the week's Elite and Abyss Dungeons, and the Breach at
// Normal and at Hard, named as the rules name them (`activities_json`, `room_breach`). A test room is named as its real
// run is but for its last part, `--test-<instance>` for `--run-<instance>` (server/roomNames.ts).
import type { Activities } from '../activities.ts';
import type { BreachPlan } from '../breachPlan.ts';
import type { PlaylistKind } from '../playlistWords.ts';

/** One entry: what it is, what it is called, a line under its name, and its test room for an instance. */
export interface TestEntry {
  readonly kind: PlaylistKind;
  readonly name: string;
  readonly about: string;
  readonly room: (instance: string) => string;
}

/** The test character every test room makes as a developer joins, and the test runs' own rules, in words. */
export const TEST_CHARACTER = { level: 30, prestige: 120 } as const;
export const TEST_RULES = 'Test runs: ten times the harm, never falls, one counts as a company';

/** The six entries, in the Playlist's order; the Breach's two only where its plan is read. `pick` draws one of a
 *  count, as each Launch draws its Elite Dungeon. */
export function testEntries(
  drawn: Activities,
  plan: BreachPlan | null,
  placeName: (id: string) => string,
  pick: (count: number) => number,
): TestEntry[] {
  const playlist = (key: 'elite' | 'abyss'): TestEntry[] => {
    const given = drawn.playlists.find((each) => each.key === key);
    const top = given?.bands.at(-1)?.[2];
    if (!given || top === undefined || drawn.elites.length === 0) return [];
    return [
      {
        kind: key,
        name: given.name,
        about: `An Elite Dungeon drawn as it starts · Foes at level ${top}`,
        room: (instance) => {
          const place = drawn.elites[pick(drawn.elites.length)] ?? drawn.elites[0];
          return `node-${place}--${key}--playlist-${top}--test-${instance}`;
        },
      },
    ];
  };
  const week = (key: 'elite' | 'abyss'): TestEntry => {
    const shown = key === 'elite' ? drawn.weekElite : drawn.weekAbyss;
    const tier = key === 'elite' ? 'Elite' : 'Abyss';
    return {
      kind: key === 'elite' ? 'week-elite' : 'week-abyss',
      name: `${tier} Dungeon of the week`,
      about: `${placeName(shown.place)} · Foes at level ${shown.level}`,
      room: (instance) => `node-${shown.place}--${key}--test-${instance}`,
    };
  };
  const breach = (tier: 'normal' | 'hard'): TestEntry[] =>
    plan
      ? [
          {
            kind: tier === 'normal' ? 'breach-normal' : 'breach-hard',
            name: `${plan.name} · ${tier === 'normal' ? 'Normal' : 'Hard'}`,
            about: `From the gate in a copy of ${placeName(plan.zone)} of its own`,
            room: (instance) => `node-${plan.zone}--breach-${tier}--test-${instance}`,
          },
        ]
      : [];
  return [
    ...playlist('elite'),
    ...playlist('abyss'),
    week('elite'),
    week('abyss'),
    ...breach('normal'),
    ...breach('hard'),
  ];
}
