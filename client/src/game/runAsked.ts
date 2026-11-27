// Under `npm run dev` only: `&run=<room>` in the address goes into that dungeon's run, or a Breach's, once the player
// stands on foot: an Elite Dungeon's (`node-<id>--run-…`) or a patrol's dungeon's
// (`node-<id>--elite--dungeon-<n>--run-…`), so each can be pictured headless (`tools/claude-toolkit/webgpu-shot.cjs`).
import { nodeOfRoom } from './rooms.ts';
import type { NodeInfo } from './worldData.ts';

/** How often the page asks again, ms: a trip asked while the arrival's veil still stands is refused. */
const ASK_EVERY_MS = 3_000;

/** Goes into the run `search` names (`&run=node-<id>--…--run-<instance>`), asking again until `inside` says the player
 *  stands in a dungeon; nothing for an address that names none or a node the world does not hold. */
export function enterAskedRun(
  search: string,
  nodes: readonly NodeInfo[],
  inside: () => boolean | null,
  intoRun: (node: NodeInfo, run: string) => void,
): void {
  const run = new URLSearchParams(search).get('run');
  const where = run === null ? null : nodeOfRoom(run);
  const node = where && nodes.find((each) => each.id === where.id);
  if (run === null || !node) return;
  const asking = setInterval(() => {
    // null: not on foot yet; true: in a dungeon, the run gone into.
    const there = inside();
    if (there === true) clearInterval(asking);
    else if (there === false) intoRun(node, run);
  }, ASK_EVERY_MS);
}
