// The Prop Forge: a room's furniture and a yard's pieces made in code, each fitted to the box the classic piece
// filled and dressed in the pictures it wore. Its shape is its family's, built from the box, the side it stands
// against, its pictures and its doors alone.
import type { ForgedModel, Picture } from './model.ts';
import type { PropMeasure, PropTable } from './tables.ts';
import { boxFrame, towardDoor, type View } from './frame.ts';
import { PLAIN_WOOD, partBuilder } from './parts.ts';
import { withDoors } from './doors.ts';
import { AGAINST_PLUS_Z, PROP_ROLES, type Family, type FamilyName } from './propRoles.ts';
import { HOME_FAMILIES } from './familiesHome.ts';
import { INDOOR_FAMILIES } from './familiesIndoor.ts';
import { OUTDOOR_FAMILIES } from './familiesOutdoor.ts';
import { GRAVE_FAMILIES } from './familiesGrave.ts';

/** Every family, by name. */
export const PROP_FAMILIES: Readonly<Record<FamilyName, Family>> = {
  ...HOME_FAMILIES,
  ...INDOOR_FAMILIES,
  ...OUTDOOR_FAMILIES,
  ...GRAVE_FAMILIES,
};

/**
 * The piece's model: its family's parts in its box, in its pictures, its front turned to its door, or away from
 * the wall it stands against; its doors kept. Null for an id the table does not hold or no family builds.
 */
export function propModel(table: PropTable, id: number): ForgedModel | null {
  const role = PROP_ROLES.get(id),
    measure: PropMeasure | undefined = table[id];
  if (!role || !measure) return null;
  const parts = partBuilder();
  const fit = boxFrame(measure);
  const view: View = measure.doors?.length
    ? towardDoor(parts, fit, measure.doors)
    : { add: AGAINST_PLUS_Z.has(id) ? parts.mirror(fit.z0 + fit.z1) : parts, fit, doors: [] };
  const looks: readonly Picture[] = measure.looks.length ? measure.looks : [PLAIN_WOOD];
  PROP_FAMILIES[role](view.add, view.fit, looks, { ...measure, doors: view.doors }, id);
  return withDoors(parts.model(), { ...measure, looks }, fit);
}
