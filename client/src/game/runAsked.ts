// Under `npm run dev` only: `&run=<room>` in the address goes into that dungeon's run once the player first stands
// on foot, so an Elite Dungeon's encounters can be pictured headless (`tools/claude-toolkit/webgpu-shot.cjs`).
import { nodeOfRoom } from './rooms.ts';
import type { NodeInfo } from './worldData.ts';

/** How often the page looks whether the player stands on foot yet, ms. */
const LOOK_EVERY_MS = 500;

/** Goes into the run `search` names (`&run=node-<id>--…--run-<instance>`) as soon as `onFoot` says the player
 *  stands; nothing for an address that names none or a node the world does not hold. */
export function enterAskedRun(
  search: string,
  nodes: readonly NodeInfo[],
  onFoot: () => boolean,
  intoRun: (node: NodeInfo, run: string) => void,
): void {
  const run = new URLSearchParams(search).get('run');
  const where = run === null ? null : nodeOfRoom(run);
  const node = where && nodes.find((each) => each.id === where.id);
  if (run === null || !node) return;
  const waiting = setInterval(() => {
    if (!onFoot()) return;
    clearInterval(waiting);
    intoRun(node, run);
  }, LOOK_EVERY_MS);
}
