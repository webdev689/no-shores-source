// The passages' map: held in a passage zone, the held map shows the week's web instead of the land, as a land sheet
// (heldmap/landSheet.ts) the map paints as it paints any land: every zone a mark at its place on the island, a mission
// by its kind's glyph, named beside its mark by its kind or its lamp and its foes' levels; every way of the web
// faintly, the week's public way inked, the way the player has come as a track and the ways on from where they stand
// as footpaths. It is built
// only in a passage zone: the sea, the island's side and the land's map show nothing of the web.
import type { LandGlyph } from '../../heldmap/landGlyphs.ts';
import type { LandMark, LandSheet } from '../../heldmap/landSheet.ts';
import type { Point2 } from '../../islands/islePlan.ts';
import type { PassageDeal, PassageWeb, PassageZone } from '../../rules/passageRules.ts';

/** Each deal by its kind's name, the same word on its sign, the mouths' card, the tracker and the map. */
export const DEAL_KINDS: Readonly<Record<Exclude<PassageDeal, 'lamp'>, string>> = {
  skirmish: 'Skirmish',
  kindle: 'Kindle',
  hold: 'Hold',
  hunt: 'Hunt',
  reckoning: 'Reckoning',
  gauntlet: 'Gauntlet',
  ambush: 'Ambush',
  sever: 'Sever',
  vault: 'Vault',
  vein: 'Vein',
  reliquary: 'Reliquary',
};

/** Each deal's glyph and what the map's table calls it: a mission's its kind's own, the rest the land map's. */
export const DEAL_MARKS: Readonly<Record<PassageDeal, { readonly glyph: LandGlyph; readonly word: string }>> = {
  skirmish: { glyph: 'foes', word: 'Skirmish' },
  kindle: { glyph: 'kindle', word: 'Kindle' },
  hold: { glyph: 'hold', word: 'Hold' },
  hunt: { glyph: 'hunt', word: 'Hunt' },
  reckoning: { glyph: 'reckoning', word: 'Reckoning' },
  gauntlet: { glyph: 'gauntlet', word: 'Gauntlet' },
  ambush: { glyph: 'ambush', word: 'Ambush' },
  sever: { glyph: 'sever', word: 'Sever' },
  vault: { glyph: 'door', word: 'Vault' },
  vein: { glyph: 'resource', word: 'Vein' },
  reliquary: { glyph: 'vault', word: 'Reliquary' },
  lamp: { glyph: 'beacon', word: 'A lamp' },
};

const LAMP_WORDS = ['The first lamp', 'The second lamp', 'The third lamp', 'The fourth lamp'];

/** A lamp by its number, as the mouths' choice offers it: "The second lamp". */
export const lampWords = (lamp: number): string => LAMP_WORDS[lamp - 1] ?? `Lamp ${lamp}`;

/** A zone's kind as the page names it: a lamp by its place among the lamps, any other deal by its kind's name. */
export const kindWords = (zone: Pick<PassageZone, 'deal' | 'lamp'>): string =>
  zone.deal === 'lamp' ? lampWords(zone.lamp ?? 1) : DEAL_KINDS[zone.deal];

/** How many levels over the player a zone's strongest foe stands before its levels are said in the loss colour:
 *  from there the player's blows barely harm it (crates/gear `power::gap`). */
export const HARD_LEVELS = 3;

/** Whether a zone's strongest foe stands `HARD_LEVELS` or more over a player of `level`. */
export const tooHard = (zone: Pick<PassageZone, 'levels'>, level: number | null): boolean =>
  !!zone.levels && level !== null && zone.levels[1] - level >= HARD_LEVELS;

/** Where the player is in the web: the zone they stand in, the zones they came through in order (the first behind a
 *  mouth of the patrol zone), the lamps they have lit this week, by number, and their level, where known. */
export interface PassageWhere {
  readonly here: number;
  readonly come: readonly number[];
  readonly lit: readonly number[];
  readonly level?: number;
}

/** How far past the web's farthest zones the sheet reaches, a share of its span. */
const MARGIN = 0.12;
/** A way's width on the map's ground: the island's metres, so a way across kilometres still reads. */
const WAY_M = 90;
/** The web as the held map shows it, with the span it opens at and where "You" stands, the sheet's
 *  metres; the patrol zone, by its name and place, where the page knows it. */
export function passageSheet(
  web: PassageWeb,
  where: PassageWhere,
  name: string,
  patrol: { readonly name: string; readonly at: Point2 } | null,
): { readonly sheet: LandSheet; readonly you: Point2 } {
  const byNumber = new Map(web.zones.map((zone) => [zone.number, zone]));
  const here = byNumber.get(where.here);
  if (!here) throw new Error(`the web holds no zone ${where.here}`);
  const places = [...web.zones.map((zone) => zone.at), ...(patrol ? [patrol.at] : [])];
  const [west, north] = [Math.min(...places.map((place) => place[0])), Math.min(...places.map((place) => place[1]))];
  const [east, south] = [Math.max(...places.map((place) => place[0])), Math.max(...places.map((place) => place[1]))];
  const margin = MARGIN * Math.max(east - west, south - north, 1);
  const origin: Point2 = [west - margin, north - margin];
  const local = (place: Point2): Point2 => [place[0] - origin[0], place[1] - origin[1]];
  const marks: LandMark[] = web.zones.map((zone) => ({ ...DEAL_MARKS[zone.deal], at: local(zone.at) }));
  if (patrol) marks.push({ glyph: 'gate', at: local(patrol.at), word: patrol.name });
  // Each zone named by its kind (a lamp lit this week said to be) and its foes' levels.
  const label = (zone: PassageZone): string[] => {
    const lit = zone.lamp !== null && where.lit.includes(zone.lamp) ? ', lit' : '';
    const levels = zone.levels ? [`${zone.levels[0]} to ${zone.levels[1]}`] : [];
    return [`${kindWords(zone)}${lit}`, ...levels];
  };
  const hard = (zone: PassageZone) => tooHard(zone, where.level ?? null);
  const come = where.come.flatMap((number) => {
    const zone = byNumber.get(number);
    return zone ? [local(zone.at)] : [];
  });
  const path = [...(patrol ? [local(patrol.at)] : []), ...come, local(here.at)];
  const ways = here.onward.flatMap((number) => {
    const zone = byNumber.get(number);
    return zone ? [{ track: false, width: WAY_M, points: [local(here.at), local(zone.at)] }] : [];
  });
  // Every way of the web, faint, so a route can be planned past the ways on from here.
  const webWays = web.zones.flatMap((zone) =>
    zone.onward.flatMap((number) => {
      const to = byNumber.get(number);
      return to ? [{ track: false, faint: true, width: WAY_M, points: [local(zone.at), local(to.at)] }] : [];
    }),
  );
  // The week's public way, inked from zone to zone, so players in public rooms find where the others pass.
  const publicWay = web.zones.flatMap((zone) =>
    !zone.public
      ? []
      : zone.onward.flatMap((number) => {
          const to = byNumber.get(number);
          return to?.public
            ? [{ track: false, inked: true, width: WAY_M, points: [local(zone.at), local(to.at)] }]
            : [];
        }),
  );
  const sheet: LandSheet = {
    name,
    origin,
    width: east - west + 2 * margin,
    height: south - north + 2 * margin,
    // The whole web: no span is too wide, so the map opens at the least scale, every mark inside it, and the wheel
    // draws in to the names that stand too close to be lettered from there.
    span: Number.POSITIVE_INFINITY,
    sea: [],
    coast: [],
    relief: [],
    index: [],
    rivers: [],
    grounds: [],
    walks: [],
    paths: [
      ...webWays,
      ...publicWay,
      ...(path.length > 1 ? [{ track: true, width: WAY_M, points: path }] : []),
      ...ways,
    ],
    standing: [],
    low: [],
    overhead: [],
    plants: [],
    ring: [],
    places: web.zones.map((zone) => ({
      name: label(zone).join(' · '),
      at: local(zone.at),
      near: true,
      loss: hard(zone),
    })),
    marks,
  };
  return { sheet, you: local(here.at) };
}
