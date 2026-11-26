// The ways between a patrol area and its instances: standing in a gate's basin a player may go through it into the
// instance it leads to, arriving at the instance's way in; standing at an instance's way in, back out to the gate.
// A gate the layout marks as crossing to another patrol area (Saltmere's three link each to both others) crosses to
// it, arriving at its gate toward the one left.
import type { NodeLayout } from './layouts.ts';

type Point = readonly [number, number];

/** A node as the game holds it, as far as a passage reads it. */
interface Named {
  readonly id: string;
  readonly name: string;
  readonly spawns: readonly Point[];
  readonly centre: Point;
}

/** A way through: the node it leads to, its name, whether it leads into an instance, whether it crosses to another
 *  patrol area, and where in that node the player arrives. */
export interface Passage {
  readonly to: string;
  readonly name: string;
  readonly into: boolean;
  readonly across: boolean;
  readonly arrive: Point;
}

/** The way through the gate or way in the player stands in, in a node's layout, or null. */
export function passageAt(
  layouts: readonly NodeLayout[],
  nodes: readonly Named[],
  here: string,
  spot: Point,
): Passage | null {
  const layout = layouts.find((each) => each.id === here);
  const area = layout?.areas.find(
    (each) => each.leads_to && Math.hypot(spot[0] - each.at[0], spot[1] - each.at[1]) <= each.radius,
  );
  if (!area?.leads_to) return null;
  const target = nodes.find((node) => node.id === area.leads_to);
  const there = layouts.find((each) => each.id === area.leads_to);
  if (!target || !there) return null;
  // Into an instance, the player arrives at its way in; back out, or across, at the gate that leads to where they
  // were.
  const meeting = there.areas.find((each) => each.leads_to === here);
  const across = area.crosses === true;
  return {
    to: target.id,
    name: target.name,
    into: area.kind === 'gate' && !across,
    across,
    arrive: meeting?.at ?? target.spawns[0] ?? target.centre,
  };
}
