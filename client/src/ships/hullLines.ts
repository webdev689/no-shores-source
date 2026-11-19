// Each hull's own line at her waterline, read from her mesh: how wide she is there from her stern to her bow, so the
// water keeps out of her and foams along her own sides rather than round an ellipse. Until her mesh has come, a fair
// hull of her length and beam stands in.
import { FAIR_LINE, STATIONS } from '../water/hullMask.ts';
import { HULL_NAMES, hullName } from './hulls.ts';
import { loadShip, type ShipMesh, VERTEX_BYTES } from './shipMesh.ts';

/** The station `along` (metres toward her bow from amidships, over her half length) falls nearest. */
function stationOf(share: number): number {
  return Math.min(STATIONS - 1, Math.max(0, Math.round(((share + 1) / 2) * (STATIONS - 1))));
}

/** Her half beam at each station where her mesh's faces cross her waterline (z = 0), as a share of half her
 *  waterline's beam; a station no face crosses takes its neighbours' mean. */
export function waterlineOf(mesh: ShipMesh): Float32Array {
  const view = new DataView(mesh.vertices);
  const point = (vertex: number): [number, number, number] => {
    const byte = vertex * VERTEX_BYTES;
    return [view.getFloat32(byte, true), view.getFloat32(byte + 4, true), view.getFloat32(byte + 8, true)];
  };
  const [halfLength, halfBeam] = [mesh.waterline.lengthM / 2, mesh.waterline.beamM / 2];
  const line = new Float32Array(STATIONS).fill(Number.NaN);
  const cross = (from: [number, number, number], to: [number, number, number]) => {
    if (from[2] > 0 === to[2] > 0 || from[2] === to[2]) return;
    const share = from[2] / (from[2] - to[2]);
    const [x, y] = [from[0] + (to[0] - from[0]) * share, from[1] + (to[1] - from[1]) * share];
    if (Math.abs(x) > halfLength * 1.02) return;
    const station = stationOf(x / halfLength);
    line[station] = Math.max(
      Number.isNaN(line[station] ?? Number.NaN) ? 0 : (line[station] ?? 0),
      Math.abs(y) / halfBeam,
    );
  };
  for (let corner = 0; corner + 2 < mesh.indices.length; corner += 3) {
    const [first, second, third] = [0, 1, 2].map((offset) => point(mesh.indices[corner + offset] ?? 0)) as [
      [number, number, number],
      [number, number, number],
      [number, number, number],
    ];
    cross(first, second);
    cross(second, third);
    cross(third, first);
  }
  return fillGaps(line);
}

/** Fills each station no face crossed from its nearest neighbours, and holds every share within 0 to 1. */
function fillGaps(line: Float32Array): Float32Array {
  const known = [...line.keys()].filter((station) => !Number.isNaN(line[station] ?? Number.NaN));
  if (known.length === 0) return FAIR_LINE.slice();
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

/** Every hull's line, each read from her mesh once it is asked for. */
export class HullLines {
  private readonly load: (name: string) => Promise<ShipMesh>;
  private readonly lines = new Map<number, Float32Array>();
  private readonly asked = new Set<number>();

  constructor(load: (name: string) => Promise<ShipMesh> = loadShip) {
    this.load = load;
  }

  /** Hull `hull`'s line: her mesh's once it has come, the fair line until then (asking for her mesh). */
  line(hull: number): Float32Array {
    const kept = this.lines.get(hull);
    if (kept) return kept;
    if (!this.asked.has(hull)) {
      this.asked.add(hull);
      this.load(hullName(hull))
        .then((mesh) => this.lines.set(hull, waterlineOf(mesh)))
        // A mesh that did not come leaves her the fair line: the ship itself retries hers (`ShipModels`).
        .catch(() => undefined);
    }
    return FAIR_LINE;
  }

  /** Every hull's line in hull order. */
  table(): Float32Array {
    const out = new Float32Array(HULL_NAMES.length * STATIONS);
    HULL_NAMES.forEach((_name, hull) => out.set(this.lines.get(hull) ?? FAIR_LINE, hull * STATIONS));
    return out;
  }
}
