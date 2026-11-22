// What Manage shows of the player's Sloop: what the naval rules say it is, its measure, where its voyage stands and
// its repair. Its power, modules and crew come with the player's gear (`shipGear.ts`).
import { sloopBuildText } from '../network/localRoom.ts';
import { fetchRoomWasm } from '../rules/combatRules.ts';
import { capital } from '../player/gear.ts';
import { withKey } from './controls.ts';

/** The Sloop's build as the room's door gives it (crates/room-wasm/src/deck_door.rs `sloop_build_json`). */
export interface SloopBuild {
  readonly name: string;
  readonly hull: number;
  readonly sail: number;
  readonly crew: number;
  readonly guns: { readonly port: number; readonly starboard: number };
  readonly loads: readonly string[];
}

/** Its waterline's measure, metres. */
export interface Measure {
  readonly lengthM: number;
  readonly beamM: number;
  readonly draughtM: number;
}

/** Where its voyage stands: its heading (radians clockwise from north), its pace's step, and the words for it, as
 *  the sea has them. */
export interface Voyaging {
  readonly heading: number;
  readonly paceStep: number;
  readonly voyageNote: string;
}

/** Its hurts as the sea keeps them, shares of whole, and the words for its repair. */
export interface Kept {
  readonly hull: number;
  readonly sail: number;
  readonly crew: number;
  readonly repair: string;
}

/** One part of the panel: its heading and its rows, label and value. */
export interface PanelPart {
  readonly heading: string;
  readonly rows: readonly (readonly [string, string])[];
}

/** The panel: its name, and its parts in order. */
export interface ShipPanel {
  readonly title: string;
  readonly parts: readonly PanelPart[];
}

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

/** The room's module fetched from `base` (asked again each time, so a new page never runs on an old one) and compiled
 *  once, and the Sloop's build as its naval rules hold it, read the
 *  first time it is asked once the module has come; null until then, or when it does not read. */
export function roomModuleFrom(base: string): {
  readonly module: Promise<WebAssembly.Module>;
  readonly sloop: () => SloopBuild | null;
} {
  const module = fetchRoomWasm(base)
    .then((answer) => (answer.ok ? answer.arrayBuffer() : Promise.reject(new Error(`room.wasm: ${answer.status}`))))
    .then((bytes) => WebAssembly.compile(bytes));
  let [compiled, built]: [WebAssembly.Module | null, SloopBuild | null | undefined] = [null, undefined];
  void module.then((made) => (compiled = made)).catch(() => undefined);
  const sloop = () =>
    (compiled && built === undefined ? (built = sloopBuildOf(sloopBuildText(compiled))) : built) ?? null;
  return { module, sloop };
}

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

/** The panel once its build is read, none before: for its build, its measure and its voyage, if it is under one. */
export function shipPanelOnceBuilt(
  build: SloopBuild | null,
  measure: Measure,
  voyage: Voyaging | null,
  kept: Kept | null = null,
): ShipPanel | null {
  return build ? shipPanelOf(build, measure, voyage, kept) : null;
}

/** The panel for its build, its measure, its voyage if it is under one, and the hurts the sea keeps with it (whole
 *  when it has said none) with its repair. */
export function shipPanelOf(
  build: SloopBuild,
  measure: Measure,
  voyage: Voyaging | null,
  kept: Kept | null = null,
): ShipPanel {
  const have = (whole: number, share = 1) => `${Math.round(whole * share)} / ${whole}`;
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
          ['Hull', have(build.hull, kept?.hull)],
          ['Canvas', have(build.sail, kept?.sail)],
          ...(build.crew > 0 ? [['Men', have(build.crew, kept?.crew)] as const] : []),
          ['Guns', guns],
          ['Loads', build.loads.map(capital).join(', ')],
          ['Length', metres(measure.lengthM)],
          ['Beam', metres(measure.beamM)],
          ['Draught', metres(measure.draughtM)],
        ],
      },
      ...(voyage
        ? [
            {
              heading: 'Voyage',
              rows: [
                ['Heading', compassOf(voyage.heading)],
                ['Pace', `×${voyage.paceStep}`],
                ['Now', voyage.voyageNote],
              ] as const,
            },
          ]
        : []),
      ...(kept ? [{ heading: 'Repair', rows: [[withKey('Repair the ship', 'repair'), kept.repair]] as const }] : []),
    ],
  };
}
