// Where a player stands on foot besides a node's own spawns: the address's `&spawn=` (a way to look at one place)
// and the far side of a layout's gate, when the player goes through it.
import { passageAt } from '../layout/passage.ts';
import { boundWord } from './controls.ts';
import type { Happening } from './flow.ts';
import type { Landmass } from './landmass.ts';
import { bearingTo } from './nodes.ts';
import { lockedWords, type NodeInfo } from './worldData.ts';

type Point = readonly [number, number];

/** The arriving node with `&spawn=<east>,<south>[,<bearing in degrees>]` as its spawn, and the facing asked. */
export function askedArrival(node: NodeInfo, search: string): { node: NodeInfo; facing: number | null } {
  const asked = new URLSearchParams(search).get('spawn')?.split(',').map(Number) ?? [];
  if (asked.length < 2 || !asked.every(Number.isFinite)) return { node, facing: null };
  const facing = asked[2] === undefined ? null : (asked[2] * Math.PI) / 180;
  return { node: { ...node, spawns: [[asked[0], asked[1]]] }, facing };
}

/** The way through a gate the player stands at: its offer's words, the flow's happening (null for a gate shut on a
 *  locked node, which takes no one), and the node to arrive in with its spawn at the far side, facing into it. */
export interface GateWay {
  readonly offer: string;
  readonly happening: Happening | null;
  readonly node: NodeInfo;
  readonly facing: number;
}

/** The way through the gate or way in at a point of a node, or null. */
export function gateWay(landmass: Pick<Landmass, 'layouts' | 'nodes'>, here: string, spot: Point): GateWay | null {
  const passage = passageAt(landmass.layouts, landmass.nodes, here, spot);
  const node = passage && landmass.nodes.find((each) => each.id === passage.to);
  if (!passage || !node) return null;
  return {
    offer: node.locked
      ? lockedWords(node.name)
      : `${passage.into ? 'Enter' : 'Return to'} ${passage.name}  ${boundWord('use')}`,
    happening: node.locked ? null : { kind: 'pass', node: node.id, name: node.name, into: passage.into },
    node: { ...node, spawns: [passage.arrive] },
    facing: bearingTo(passage.arrive, node.centre),
  };
}
