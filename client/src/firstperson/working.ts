// The tools the hands work a material node with in first person, as the first-person forge renders them
// (tools/forge/tools/sprite-forge/fptools.py): the Pick-Axe striking ore, the Wood-Axe cutting timber, the Sickle
// reaping herbs and the bare hand reaching into salvage. Each stroke's frames share one canvas, laid where the forge's
// table (its `frames.json`) puts it on the 320 x 200 design screen; the strokes repeat while the node is worked.
import { type FrameSource, type Picture, paintSet } from './fpFrames.ts';
import { DESIGN_HEIGHT } from './fpMotion.ts';
import { hardened } from './heldPictures.ts';

export type Tool = 'pickaxe' | 'woodaxe' | 'sickle' | 'gather';

/** The tool each kind of node is worked with, by what its place holds. */
export const TOOL_OF: Readonly<Record<string, Tool>> = {
  ore: 'pickaxe',
  timber: 'woodaxe',
  herbs: 'sickle',
  salvage: 'gather',
};

/** Each tool's stroke as the forge rendered it: its record, its frames, and its canvas on the design screen (x, y,
 *  width, height; its corner off the screen where it runs past), from the forge's `frames.json`.
 *  shortcut: copied from renders of fptools.py (the gather hand's with every armour set, as published, which widens
 *  its canvas), whose table is not published with its frames; publish it beside them and read it if a tool is drawn
 *  again. */
export const STROKES: Readonly<Record<Tool, { record: string; frames: number; rect: readonly number[] }>> = {
  pickaxe: { record: 'StrikeDown', frames: 5, rect: [164, -64, 188, 328] },
  woodaxe: { record: 'StrikeDownRight', frames: 5, rect: [-47, 66, 295, 198] },
  sickle: { record: 'Reap', frames: 5, rect: [178, 122, 157, 142] },
  gather: { record: 'Reach', frames: 5, rect: [-57, 84, 339, 180] },
};

/** How long one stroke takes, seconds. */
export const STROKE_S = 0.5;

/** The tools whose frames are a hand, which the forge renders again in each armour set's gauntlets (fptools.py's
 *  `ARMOURED`). */
const ARMOURED: readonly Tool[] = ['gather'];

/** Where the forge publishes a tool's frame, bare or in an armour set's gauntlets. */
export const toolPath = (tool: Tool, frame: number, set: string | null = null) =>
  `@art/tools/${tool}/${STROKES[tool].record}-${frame}${set ? `_${set}` : ''}.png`;

/** The stroke's frame `seconds` into working: each stroke from its first frame to its last, again and again. */
export function strokeFrame(tool: Tool, seconds: number): number {
  const { frames } = STROKES[tool];
  const into = (((seconds % STROKE_S) + STROKE_S) % STROKE_S) / STROKE_S;
  return Math.min(frames - 1, Math.floor(into * frames));
}

/** A tool's frame as the forge drew it, its edges hard as the held things' are, a hand in the gauntlets worn (`hands`,
 *  their set) where the forge drew it so; null where it has not come. */
export async function toolPicture(
  source: FrameSource,
  tool: Tool,
  frame: number,
  hands: string | null = null,
): Promise<Picture | null> {
  const own = hands && ARMOURED.includes(tool) ? await source.strip(toolPath(tool, frame, hands)) : null;
  const strip = own ?? (await source.strip(toolPath(tool, frame)));
  if (!strip) return null;
  const pixels = own ? await paintSet(source, own, hands, 'Steel') : hardened(strip);
  return { width: strip.width, height: strip.height, pixels, at: [0, 0] };
}

/** Where a tool's frame lies on the design screen as the hands come up to work (`up` 0 below the screen, 1 up). */
export function toolPlace(tool: Tool, up: number) {
  const [x = 0, y = 0, width = 0, height = 0] = STROKES[tool].rect;
  return { x, y: y + (1 - up) * (DESIGN_HEIGHT - y), width, height, flip: false };
}
