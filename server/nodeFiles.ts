// The bake's node files as a room reads them: a node's own file, and where a node lies from the bake's index.
import layout from '../content/world/layout.json' with { type: 'json' };
import { type Listed, reachOf } from './arrival.ts';
import { livingPorts } from './seaPorts.ts';

/** A node's baked file's text, or null when there is none. */
export async function nodeText(nodes: Fetcher, id: string): Promise<string | null> {
  const file = await nodes.fetch(`https://nodes/${id}.json`);
  return file.ok ? await file.text() : null;
}

/** Where a node lies and what leads into it, from the bake's index, the living port cities read from the room's main
 *  ports (`mainPorts`, a JSON list); null when the index is missing. */
export async function nodeReach(nodes: Fetcher, id: string, mainPorts: string): Promise<ReturnType<typeof reachOf>> {
  const index = await nodes.fetch('https://nodes/index.json');
  return index.ok ? reachOf((await index.json()) as Listed[], layout.continents, id, livingPorts(mainPorts)) : null;
}
