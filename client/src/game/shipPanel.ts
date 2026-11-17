// What Manage shows of the player's Sloop: what the naval rules say she is, her measure, where her voyage stands, and
// the parts of managing her still to come, marked Later.

/** The Sloop's build as the room's door gives it (crates/room-wasm/src/deck_door.rs `sloop_build_json`). */
export interface SloopBuild {
  readonly name: string;
  readonly hull: number;
  readonly sail: number;
  readonly crew: number;
  readonly guns: { readonly port: number; readonly starboard: number };
  readonly loads: readonly string[];
}

/** Her waterline's measure, metres. */
export interface Measure {
  readonly lengthM: number;
  readonly beamM: number;
  readonly draughtM: number;
}

/** Where her voyage stands: her heading (radians clockwise from north), her pace's step, and the words for it. */
export interface Voyaging {
  readonly heading: number;
  readonly pace: number;
  readonly note: string;
}

/** One part of the panel: its heading and its rows, label and value; or a part still to come. */
export interface PanelPart {
  readonly heading: string;
  readonly rows: readonly (readonly [string, string])[];
  readonly later: boolean;
}

/** The panel: her name, and its parts in order. */
export interface ShipPanel {
  readonly title: string;
  readonly parts: readonly PanelPart[];
}

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

/** The build in the door's JSON, if it is one. */
export function sloopBuildOf(text: string): SloopBuild | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const build = value as Record<string, unknown>;
  const guns = build['guns'] as Record<string, unknown> | undefined;
  const loads = build['loads'];
  const counted = [build['hull'], build['sail'], build['crew'], guns?.['port'], guns?.['starboard']].every(isCount);
  if (typeof build['name'] !== 'string' || !counted || !Array.isArray(loads)) return null;
  if (!loads.every((load) => typeof load === 'string')) return null;
  return value as SloopBuild;
}

const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

/** A heading as the compass reads it: whole degrees clockwise from north, and its nearest of the eight points. */
export function compassOf(heading: number): string {
  const degrees = ((Math.round((heading * 180) / Math.PI) % 360) + 360) % 360;
  return `${degrees}° ${POINTS[Math.round(degrees / 45) % POINTS.length] ?? 'N'}`;
}

const metres = (value: number) => `${value.toFixed(1)} m`;
const capital = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/** The panel for her build, her measure and her voyage. Her hurts are not kept between fights, so she is whole. */
export function shipPanelOf(build: SloopBuild, measure: Measure, voyage: Voyaging): ShipPanel {
  const guns =
    build.guns.port === build.guns.starboard
      ? `${build.guns.port} a side`
      : `${build.guns.port} to port, ${build.guns.starboard} to starboard`;
  return {
    title: `Your ${build.name}`,
    parts: [
      {
        heading: 'Vessel',
        rows: [
          ['Hull', `${build.hull} / ${build.hull}`],
          ['Canvas', `${build.sail} / ${build.sail}`],
          ['Guns', guns],
          ['Loads', build.loads.map(capital).join(', ')],
          ['Length', metres(measure.lengthM)],
          ['Beam', metres(measure.beamM)],
          ['Draught', metres(measure.draughtM)],
        ],
        later: false,
      },
      {
        heading: 'Voyage',
        rows: [
          ['Heading', compassOf(voyage.heading)],
          ['Pace', `×${voyage.pace}`],
          ['Under way', voyage.note],
        ],
        later: false,
      },
      { heading: 'Cargo', rows: [], later: true },
      { heading: 'Crew', rows: [], later: true },
    ],
  };
}
