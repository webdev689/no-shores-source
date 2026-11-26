// What moves on the held map: on land, from the room the player stands in (its every snapshot holds all its players),
// every other player where they stand, in their nameplate's colours, and the zone's public event while it runs; at
// sea, every other player's ship on the sea's chart, which its room sends about once a second, and with it every
// hostile ship and standing island in the water the player's ship lies in.
import type { MapMarks } from '../heldmap/landSheet.ts';
import type { PublicEvent } from '../network/publicMessages.ts';
import type { IsleMark } from '../heldmap/heldMap.ts';
import type { SeenCharted, SeenIsle, SeenMark } from '../network/seaHarbour.ts';
import type { OtherPlayers } from '../player/others.ts';
import { ofCompany } from './companyHud.ts';
import { mapEventOf } from './publicLaw.ts';

/** The other players in the room and the zone's public event running, as the land's map marks them; `company` says
 *  whether a player's name is in the viewer's company. */
export function mapMarksOf(
  event: PublicEvent | null,
  others: Pick<OtherPlayers, 'placed' | 'plateOf'>,
  company = ofCompany(),
): MapMarks {
  const running = mapEventOf(event);
  return {
    others: [...others.placed].map(([number, placed]) => ({
      at: [placed.x, placed.y] as const,
      company: company(others.plateOf(number)?.name ?? ''),
    })),
    events: running ? [running] : [],
  };
}

/** Every other player's ship on the sea's `charted`, and each hostile ship among its `marks`, as the sea's map marks
 *  them; the player is `own`. */
export function chartMarksOf(
  charted: readonly SeenCharted[],
  own: number,
  marks: readonly SeenMark[] = [],
  company = ofCompany(),
): MapMarks {
  const others = charted.filter((ship) => ship.player !== own);
  return {
    others: others.map((ship) => ({ at: ship.at, company: company(ship.name) })),
    events: [],
    hostiles: marks.filter((mark) => mark.kind === 'hostile'),
  };
}

/** The islands the sea's map marks: those the player has `found`, wherever they lie, and each standing in their ship's
 *  water among the chart's `marks`, each once. */
export function isleMarksOf(found: readonly SeenIsle[], marks: readonly SeenMark[]): IsleMark[] {
  const isles = [...found, ...marks].flatMap(({ at, kind }) => (kind === 'hostile' ? [] : [{ at, kind }]));
  const first = ([east, south]: readonly [number, number]) =>
    isles.findIndex((isle) => isle.at[0] === east && isle.at[1] === south);
  return isles
    .filter(({ at }, index) => first(at) === index)
    .map(({ at, kind }) => ({ at, kind, isle: kind !== 'cove' }));
}
