// Each hull's own line at its waterline, read from its mesh: how wide it is there from its stern to its bow, so the
// water keeps out of it and foams along its own sides rather than round an ellipse. Until its mesh has come, a fair
// hull of its length and beam stands in.
import { FAIR_LINE, HULL_FIT, STATIONS, stationPlace, stationShare } from '../water/hullMask.ts';
import { type ShipMesh, VERTEX_BYTES } from './shipMesh.ts';

/** How many times finer than its stations its waterline is read, to place each station and keep the line within it. */
const FINE = 32;

/** Its half beam at each station where its mesh's faces cross its waterline (z = 0), as a share of half its
 *  waterline's beam, lowered where the line between two stations (as lineAt draws it) would stand outside its hull
 *  (a thin stern post with its body flaring out of it forward), so the water's footprint never shows past it. */
export function waterlineOf(mesh: ShipMesh): Float32Array {
  const view = new DataView(mesh.vertices);
  const point = (vertex: number): [number, number, number] => {
    const byte = vertex * VERTEX_BYTES;
    return [view.getFloat32(byte, true), view.getFloat32(byte + 4, true), view.getFloat32(byte + 8, true)];
  };
  const [halfLength, halfBeam] = [mesh.waterline.lengthM / 2, mesh.waterline.beamM / 2];
  const last = (STATIONS - 1) * FINE;
  const fine = new Float32Array(last + 1).fill(Number.NaN);
  const crossing = (from: [number, number, number], to: [number, number, number]): [number, number][] => {
    if (from[2] > 0 === to[2] > 0 || from[2] === to[2]) return [];
    const share = from[2] / (from[2] - to[2]);
    return [[from[0] + (to[0] - from[0]) * share, from[1] + (to[1] - from[1]) * share]];
  };
  // Each face cut by its waterline gives a piece of the line: its half beam is laid at every fine step it spans.
  const lay = ([aftX, aftY]: [number, number], [foreX, foreY]: [number, number]) => {
    const stepOf = (x: number) => stationPlace(x / halfLength) * FINE;
    const [from, to] = [
      Math.max(0, Math.ceil(stepOf(Math.min(aftX, foreX)) - 1e-4)),
      Math.min(last, Math.floor(stepOf(Math.max(aftX, foreX)) + 1e-4)),
    ];
    for (let step = from; step <= to; step++) {
      const x = stationShare(step / FINE) * halfLength;
      // A step past the face (a face beyond either end of its waterline maps onto that end) is no part of it.
      if (x < Math.min(aftX, foreX) - 1e-3 || x > Math.max(aftX, foreX) + 1e-3) continue;
      const toward = foreX === aftX ? 1 : Math.min(1, Math.max(0, (x - aftX) / (foreX - aftX)));
      const y = foreX === aftX ? Math.max(Math.abs(aftY), Math.abs(foreY)) : Math.abs(aftY + (foreY - aftY) * toward);
      fine[step] = Math.max(Number.isNaN(fine[step] ?? Number.NaN) ? 0 : (fine[step] ?? 0), y / halfBeam);
    }
  };
  for (let corner = 0; corner + 2 < mesh.indices.length; corner += 3) {
    const [first, second, third] = [0, 1, 2].map((offset) => point(mesh.indices[corner + offset] ?? 0)) as [
      [number, number, number],
      [number, number, number],
      [number, number, number],
    ];
    const [start, end] = [...crossing(first, second), ...crossing(second, third), ...crossing(third, first)];
    if (start && end) lay(start, end);
  }
  if (fine.every((share) => Number.isNaN(share))) return FAIR_LINE.slice();
  const filled = fillGaps(fine);
  return keepInside(
    // Each station starts as wide as its line is round it, half a station either way: as full as its hull allows.
    Float32Array.from({ length: STATIONS }, (_value, station) =>
      Math.max(...filled.subarray(Math.max(0, (station - 0.5) * FINE), (station + 0.5) * FINE + 1)),
    ),
    filled,
  );
}

/** Lowers a station wherever the line to its neighbour (as lineAt draws it) would stand past its hull: `fine` is its
 *  line read `FINE` times between stations, and the water draws the line `HULL_FIT` of its size, so a point is held to
 *  its hull where it is drawn. The end nearer the point is lowered, the other too where that end alone cannot be.
 *  Lowering only ever narrows the line, so one walk from its stern to its bow leaves every point within it. */
function keepInside(line: Float32Array, fine: Float32Array): Float32Array {
  const hullAt = (step: number) => {
    const place = stationPlace(stationShare(step / FINE) * HULL_FIT) * FINE;
    const low = Math.floor(place);
    const [first, next] = [fine[low] ?? 0, fine[Math.min(fine.length - 1, low + 1)] ?? 0];
    return (first + (next - first) * (place - low)) / HULL_FIT;
  };
  for (let station = 0; station + 1 < STATIONS; station++) {
    for (let step = 0; step <= FINE; step++) {
      const [ahead, under] = [step / FINE, hullAt(station * FINE + step)];
      const [aft, fore] = [line[station] ?? 0, line[station + 1] ?? 0];
      if (aft * (1 - ahead) + fore * ahead <= under) continue;
      const [near, far, nearWeight, farWeight] =
        ahead < 0.5 ? [station, station + 1, 1 - ahead, ahead] : [station + 1, station, ahead, 1 - ahead];
      const lowered = (under - (line[far] ?? 0) * farWeight) / nearWeight;
      line[near] = Math.max(0, lowered);
      if (lowered < 0) line[far] = under / farWeight;
    }
  }
  return line;
}

/** Fills each point of a line no face crossed from its nearest neighbours, and holds every share within 0 to 1. */
function fillGaps(line: Float32Array): Float32Array {
  const known = [...line.keys()].filter((station) => !Number.isNaN(line[station] ?? Number.NaN));
  return line.map((share, station) => {
    if (!Number.isNaN(share)) return Math.min(1, share);
    const before = known.filter((each) => each < station).at(-1);
    const after = known.find((each) => each > station);
    const value = (index: number | undefined) => (index === undefined ? undefined : line[index]);
    const [low, high] = [value(before) ?? value(after) ?? 0, value(after) ?? value(before) ?? 0];
    if (before === undefined || after === undefined) return Math.min(1, low);
    return Math.min(1, low + ((high - low) * (station - before)) / (after - before));
  });
}

/** Every hull's line, each read from its mesh as that mesh comes to be drawn (`take`), the fair line until then. */
export class HullLines {
  private readonly lines = new Map<number, Float32Array>();

  /** Hull `hull`'s line: its mesh's once it has come, the fair line until then. */
  line(hull: number): Float32Array {
    return this.lines.get(hull) ?? FAIR_LINE;
  }

  /** Reads hull `hull`'s line from its mesh, come to be drawn. */
  take(hull: number, mesh: ShipMesh): void {
    this.lines.set(hull, waterlineOf(mesh));
  }
}

/** The hull lines every ship's footprint on the water is drawn in: each hull's read once, from the mesh its model is
 *  opened with (`openHull`), so a footprint takes its own line as its ship comes to be drawn in it. */
export const HULL_LINES = new HullLines();
