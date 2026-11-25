// A Breach on the Playlist, an entry at each tier, from its plan as the rules give it (`breachPlan.ts`): played online
// with a company, its foes' level, the level it opens at in the finder's own words, how its fallen stand again and
// after how long, its revives, what it drops (its armour's Prestige at the tier) and pays, and the base its Launch asks
// of the finder. Nothing here judges a rule: the finder and the run's gate do.
import type { BreachPlan } from './breachPlan.ts';
import { inSentence } from './breachWords.ts';
import { type PlaylistEntry, dropsWords, lockWords } from './playlistWords.ts';

/** Why the finder refuses a character below a tier's level, in its own words (server/accounts/finding.ts). */
export const breachShutWords = (tier: { readonly name: string; readonly opens: number }): string =>
  `A Breach at ${tier.name} opens at level ${tier.opens}.`;

/** What a Breach pays, as its rules pay it (crates/gear/src/breach.rs `breach_cleared`): each encounter's first clear
 *  a week at each tier, the last's more; and the last's first clear ever. */
const WEEKLY_PAYS =
  "Each encounter's first clear a week: a Boss's worth, Essence and a Breach Vestige of its tier; the Steward two, and a chance at the Breach's dye and horse.";
const STEWARD_PAYS = "The Steward's first fall: the Breach's banner.";
/** The Prestige a Breach's armour climbs to, Normal then Hard (crates/gear/src/breach_tests.rs), and how long its
 *  fallen lie before standing again of themselves, outside an encounter and inside one at Normal (fallen.rs). */
const PRESTIGE_MOST = [28, 30] as const;
const STANDS_OUTSIDE_S = 6;
const STANDS_INSIDE_S = 10;

/** The base a Breach's Launch asks the finder for at a tier: its gate's zone's room and the tier's key. */
export const breachBase = (zone: string, tier: string): string => `node-${zone}--breach-${tier}`;

/** The Breach's two entries, Normal then Hard, for a character of `level` (null before their gear is known), its
 *  gate's zone named by `placeName`, its weekly pay resetting as `resets` says. */
export function breachEntries(
  plan: BreachPlan,
  level: number | null,
  placeName: (id: string) => string,
  resets: string,
): PlaylistEntry[] {
  return plan.tiers.map((tier, index): PlaylistEntry => {
    const hard = tier.revives !== null;
    const shut = level !== null && level < tier.opens ? breachShutWords(tier) : null;
    const outside = `Outside an encounter the fallen stand again after ${STANDS_OUTSIDE_S} s.`;
    const standing = hard
      ? [
          `${tier.revives} revives an attempt, for the company.`,
          outside,
          'In an encounter the fallen do not stand again of themselves: a company member raises them, at a revive each.',
          `Opens once ${inSentence(plan.name)} is won at Normal.`,
        ]
      : [
          `${outside} In one, after ${STANDS_INSIDE_S} s.`,
          'A company member raises one sooner by holding Use beside them.',
        ];
    return {
      kind: hard ? 'breach-hard' : 'breach-normal',
      name: plan.name,
      about: `${tier.name} · Foes at level ${tier.level}`,
      rules: [
        'Played online, with a company of up to eight.',
        `Opens with the Waking at the Sunken Gate in ${placeName(plan.zone)}, in view of the zone.`,
        ...standing,
      ],
      modifiers: [],
      rewards: [
        { words: WEEKLY_PAYS, taken: null, clears: null, resets },
        { words: STEWARD_PAYS, taken: null, clears: null, resets: '' },
      ],
      drops: `${dropsWords('breach')}, its armour to ${PRESTIGE_MOST[index] ?? PRESTIGE_MOST[1]} Prestige`,
      shut,
      // Its two crests share a name: the lock says which tier is shut.
      lock: shut === null ? null : `${tier.name} · ${lockWords(shut, level)}`,
      launch: {
        place: plan.zone,
        seas: 'breach',
        playlist: null,
        finds: shut === null ? breachBase(plan.zone, tier.key) : null,
        breach: index,
      },
    };
  });
}
