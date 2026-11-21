// A ruined city's name, as the city crate names it (crates/city/src/ruins.rs `ruined_name`): the page names a city that
// is no port so wherever it shows one, on the held map and on arriving.

/** The name of the ruins a city of `name` now is. */
export const ruinedName = (name: string): string => `Ruins of ${name}`;
