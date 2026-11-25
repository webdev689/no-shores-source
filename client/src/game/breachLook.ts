// How a Breach's run is lit and what of it is drawn: its own underground sky (no sun or moon, a low cool light from
// nowhere, all lost in the dark past a reach), the shores drawn only while someone is in one or being taken there,
// and the bells' sockets that stand empty of a bell foe, where a bell hangs dim and asleep.
import type { BreachSeen } from '../network/breachMessages.ts';
import { AFTERNOON, type Lamp, type SkyLook } from '../sky/skyUniform.ts';
import { moduleHasSocket, moduleNumber, moduleParts, moduleSocket, moduleSocketFacing } from '../city/modules.ts';
import { type BreachPlan, socketAt, spaceAt } from './breachPlan.ts';
import { DARK_RGB } from './dungeonScene.ts';

type Point = readonly [number, number, number];

/** How far off, metres, all of the run is lost in the dark: it fades from a third of the way. */
export const RUN_DARK_M = 120;

/** The run's sky at the world's second `seconds`: underground, no key light and no weather, a low cool ambient from
 *  above and a darker one from below, its fog and its horizon the dark the scene is cleared to. */
export function runSky(seconds: number): SkyLook {
  return {
    ...AFTERNOON,
    key: [0, 0, 1],
    keyBright: 0,
    keyLight: [0, 0, 0],
    sun: [0, 0, -1],
    daylight: 0,
    moon: [0, 0, -1],
    zenith: DARK_RGB,
    horizon: DARK_RGB,
    cloud: 0,
    ambientSky: [0.23, 0.27, 0.35],
    ambientGround: [0.08, 0.09, 0.12],
    fogColour: DARK_RGB,
    worldS: seconds,
    darkM: RUN_DARK_M,
  };
}

/** The light a figure's hands are lit by in the run at the eye: as the figures' shader lights a card standing there
 *  (the ambient an upright face keeps, the lamps half turned to it), held under 1.2 so a lamp beside it does not burn
 *  it white. */
export function runLightAt(sky: SkyLook, lamps: readonly Lamp[]): [number, number, number] {
  const shaded = 0.55 / 0.35;
  return [0, 1, 2].map((part) => {
    const ambient = (((sky.ambientSky[part] ?? 0) + (sky.ambientGround[part] ?? 0)) / 2) * shaded;
    const lit = lamps.reduce((sum, lamp) => {
      const near = Math.max(0, 1 - Math.hypot(...lamp.fromEye) ** 2 / lamp.reachM ** 2);
      return sum + (lamp.light[part] ?? 0) * near * near * 0.6;
    }, 0);
    return Math.min(1.2, ambient + lit);
  }) as [number, number, number];
}

/** The shores of `plan` drawn now: each a player stands in (of `bodies`), and each being opened to (the Two Shores'
 *  rifts, opening or open) or the Steward's taken are in. The rest stand unseen across the dark. */
export function shoresShown(plan: BreachPlan, seen: BreachSeen, bodies: readonly Point[]): Set<string> {
  const shown = new Set<string>();
  const rifted = plan.shores.shores ?? [];
  seen.rifts.forEach((rift, nth) => rift > 0 && rifted[nth] && shown.add(rifted[nth]));
  const taken = plan.shores.steward?.[seen.awayShore];
  if (taken) shown.add(taken);
  for (const [x, y] of bodies) {
    const space = spaceAt(plan, x, y);
    if (space && isShore(plan, space.key)) shown.add(space.key);
  }
  return shown;
}

/** Whether a space of the plan is a shore an encounter takes players to. */
export const isShore = (plan: BreachPlan, key: string): boolean =>
  Object.values(plan.shores).some((shores) => shores.includes(key));

/** How near a bell socket a bell foe stands for its bell to be the foe's, metres. */
const BELL_HELD_M = 1.5;

/** The bell sockets (`bell-1` on) of the spaces `drawn` names that no bell foe of `bells` stands at. */
export function idleBells(plan: BreachPlan, drawn: (key: string) => boolean, bells: readonly Point[]): Point[] {
  const idle: Point[] = [];
  for (const space of plan.spaces) {
    if (!drawn(space.key)) continue;
    const module = moduleNumber(space.module);
    for (let nth = 1; moduleHasSocket(module, `bell-${nth}`); nth++) {
      const socket = socketAt(space.module, `bell-${nth}`, space.at, space.turn);
      const held = bells.some((bell) => Math.hypot(bell[0] - socket[0], bell[1] - socket[1]) <= BELL_HELD_M);
      if (!held) idle.push(socket);
    }
  }
  return idle;
}

/** The gate's doorway as its seal's socket (`gate`) stands in it, from the gate's own parts (the solid the doorway is
 *  shut with, from its face back): its half width, its height, and how far its face stands from the socket along the
 *  way the socket faces (y); null where the gate has no such part. */
export function gateWay(): [number, number, number] | null {
  const gate = moduleNumber('breach-gate');
  const [x, y, z] = moduleSocket(gate, 'gate');
  const inside = moduleParts(gate).find(
    ([west = 0, north = 0, bottom = 0, east = 0, south = 0, top = 0]) =>
      west <= x && x <= east && north <= y && y <= south && bottom <= z + 1 && z + 1 <= top,
  );
  if (!inside) return null;
  const [west = 0, north = 0, , east = 0, south = 0, top = 0] = inside;
  const face = moduleSocketFacing(gate, 'gate')[1] >= 0 ? south - y : north - y;
  return [Math.min(x - west, east - x), top - z, face];
}
