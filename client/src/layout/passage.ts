// The ways between a patrol area and its instances: standing in a gate's basin a player may go through it into the
// instance it leads to, arriving at the instance's way in; standing at an instance's way in, back out to the gate.
import type { NodeInfo } from '../game/worldData.ts';
import type { NodeLayout } from './layouts.ts';

type Point = readonly [number, number];

/** A way through: the node it leads to, its name, and where in that node the player arrives. */
export interface Passage {
  readonly to: string;
  readonly name: string;
  readonly into: boolean;
  readonly arrive: Point;
}

/** The way through the gate or way in the player stands in, in a node's layout, or null. */
export function passageAt(
  layouts: readonly NodeLayout[],
  nodes: readonly NodeInfo[],
  here: string,
  at: Point,
): Passage | null {
  const layout = layouts.find((each) => each.id === here);
  const area = layout?.areas.find(
    (each) => each.leads_to && Math.hypot(at[0] - each.at[0], at[1] - each.at[1]) <= each.radius,
  );
  if (!area?.leads_to) return null;
  const target = nodes.find((node) => node.id === area.leads_to);
  const there = layouts.find((each) => each.id === area.leads_to);
  if (!target || !there) return null;
  // Into an instance, the player arrives at its way in; back out, at the gate that leads to where they were.
  const meeting = there.areas.find((each) => each.leads_to === here);
  return {
    to: target.id,
    name: target.name,
    into: area.kind === 'gate',
    arrive: meeting?.at ?? target.spawns[0] ?? target.centre,
  };
}
