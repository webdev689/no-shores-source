// A faction's name as a sentence takes it, from its name alone ("The Veiled", "Stormcallers"), so no line reads
// "the The Veiled" and every screen says it one way.

/** A faction as a sentence names it: "the Veiled", "the Stormcallers". */
export const called = (name: string): string => `the ${name.replace(/^The /, '')}`;

/** A faction's name as its own: "the Veiled's", "the Stormcallers'". */
export const owned = (name: string): string => {
  const said = called(name);
  return `${said}${said.endsWith('s') ? "'" : "'s"}`;
};
