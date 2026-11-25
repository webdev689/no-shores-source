// The passages' map: held in a passage zone, the held map shows the week's web instead of the land, as a land sheet
// (heldmap/landSheet.ts) the map paints as it paints any land: every zone a mark at its place on the island, by its
// deal's glyph, its currents and its lamp named under it; the way the player has come as a track, the ways on from
// where they stand as footpaths. It is built only in a passage zone: the sea, the island's side and the land's map
// show nothing of the web.
import type { LandGlyph } from '../../heldmap/landGlyphs.ts';
import type { LandMark, LandSheet } from '../../heldmap/landSheet.ts';
import type { Point2 } from '../../islands/islePlan.ts';
import type { PassageDeal, PassageWeb, PassageZone } from '../../rules/passageRules.ts';

/** Each deal's glyph and what the map's table calls it: the glyphs the land's map already draws. */
export const DEAL_MARKS: Readonly<Record<PassageDeal, { readonly glyph: LandGlyph; readonly word: string }>> = {
  skirmish: { glyph: 'foes', word: 'A skirmish' },
  kindle: { glyph: 'objective', word: 'A mission' },
  hold: { glyph: 'objective', word: 'A mission' },
  hunt: { glyph: 'objective', word: 'A mission' },
  reckoning: { glyph: 'objective', word: 'A mission' },
  gauntlet: { glyph: 'objective', word: 'A mission' },
  ambush: { glyph: 'objective', word: 'A mission' },
  sever: { glyph: 'objective', word: 'A mission' },
  vault: { glyph: 'door', word: 'A vault' },
  vein: { glyph: 'resource', word: 'A vein' },
  reliquary: { glyph: 'vault', word: 'A reliquary' },
  lamp: { glyph: 'beacon', word: 'A lamp' },
};

const LAMP_WORDS = ['The first lamp', 'The second lamp', 'The third lamp', 'The fourth lamp'];

/** A lamp by its number, as the mouths' choice offers it: "The second lamp". */
export const lampWords = (lamp: number): string => LAMP_WORDS[lamp - 1] ?? `Lamp ${lamp}`;

/** Where the player is in the web: the zone they stand in, the zones they came through in order (the first behind a
 *  mouth of the patrol zone), and the lamps they have lit this week, by number. */
export interface PassageWhere {
  readonly here: number;
  readonly come: readonly number[];
  readonly lit: readonly number[];
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
  const label = (zone: PassageZone): string[] => {
    const lamp = zone.lamp === null ? [] : [`${lampWords(zone.lamp)}${where.lit.includes(zone.lamp) ? ', lit' : ''}`];
    return [...lamp, ...zone.currents.map((current) => current.name)];
  };
  const come = where.come.flatMap((number) => {
    const zone = byNumber.get(number);
    return zone ? [local(zone.at)] : [];
  });
  const path = [...(patrol ? [local(patrol.at)] : []), ...come, local(here.at)];
  const ways = here.onward.flatMap((number) => {
    const zone = byNumber.get(number);
    return zone ? [{ track: false, width: WAY_M, points: [local(here.at), local(zone.at)] }] : [];
  });
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
    paths: [...(path.length > 1 ? [{ track: true, width: WAY_M, points: path }] : []), ...ways],
    standing: [],
    low: [],
    overhead: [],
    plants: [],
    ring: [],
    places: web.zones.flatMap((zone) => {
      const words = label(zone);
      return words.length > 0 ? [{ name: words.join(' · '), at: local(zone.at) }] : [];
    }),
    marks,
  };
  return { sheet, you: local(here.at) };
}
