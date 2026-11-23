// The versions of the ground nature grows on, and where each changed it: a tile scattered on an older version is
// scattered again only if the ground under it has changed since, so a new close patch redoes the tiles it covers and
// keeps the thousands it does not.
import { TILE_M } from './scatter.ts';

/** A world rect, metres: west, north, east, south. */
export type GroundArea = readonly [number, number, number, number];

/** Changes remembered: a tile scattered before the oldest is scattered again wherever it lies. */
const KEPT_CHANGES = 32;

export class GroundChanges {
  /** The ground's version now. */
  version = 0;
  private readonly changes: { readonly version: number; readonly areas: readonly GroundArea[] | null }[] = [];

  /** The ground has changed within `areas`, or everywhere for null. */
  change(areas: readonly GroundArea[] | null): void {
    this.version += 1;
    this.changes.push({ version: this.version, areas });
    if (this.changes.length > KEPT_CHANGES) this.changes.shift();
  }

  /** Whether a tile's ground is the same now as on version `since` (`NatureGround.unchanged`). */
  readonly unchanged = (tileX: number, tileY: number, since: number): boolean => {
    if (since === this.version) return true;
    if ((this.changes[0]?.version ?? Infinity) > since + 1) return false;
    const [west, north] = [tileX * TILE_M, tileY * TILE_M];
    return this.changes.every(
      ({ version, areas }) =>
        version <= since ||
        (areas !== null &&
          areas.every(
            (area) => area[0] > west + TILE_M || area[2] < west || area[1] > north + TILE_M || area[3] < north,
          )),
    );
  };
}
