// A faction's name as a sentence takes it, from its name alone ("The Veiled", "Stormcallers"), so no line reads
// "the The Veiled" and every screen says it one way; and the road that earns each Art, its house's.
import factions from '../../../content/gear/factions.json' with { type: 'json' };

/** A faction as a sentence names it: "the Veiled", "the Stormcallers". */
export const called = (name: string): string => `the ${name.replace(/^The /, '')}`;

/** A faction's name as its own: "the Veiled's", "the Stormcallers'". */
export const owned = (name: string): string => {
  const said = called(name);
  return `${said}${said.endsWith('s') ? "'" : "'s"}`;
};

/** The road that earns the Art numbered `art`, its house's: "the Stormcallers' road". */
export const roadOf = (art: number): string =>
  `${owned(factions.factions.find((faction) => faction.art === art)?.name ?? 'its house')} road`;

/** What a lock on an Art, a Tenet or a fragment not yet earned says: "Earned on the Stormcallers' road". */
export const earnedOn = (art: number): string => `Earned on ${roadOf(art)}`;
