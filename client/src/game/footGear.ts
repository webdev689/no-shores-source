// What a player's gear lays on foot: a quest's puzzle points ringed under beams, gold once lit, and a named ward it
// defends. The marks over what they can use are `combat/marksOver.ts`'s, the drops lying for them their own pictures
// (`combat/drops.ts`), and each resource node the forge's picture of its resource standing on the ground with no mark
// or beam (`nodeCards.ts`). And what E does where they stand: a station's or Shape's offer opened (or its keeper spoken
// with, while a quest asks it), a puzzle's point used, or a node within reach gathered while E is held. The room judges
// every use; the rings and beams only show where.

import type { DropsShown } from '../combat/drops.ts';
import { markRing } from '../combat/marks.ts';
import { ASKS, type GearAsk, type GearState } from '../network/gearMessages.ts';
import { resourceName } from '../player/gear.ts';
import { openGearWindow } from './gearScreen.ts';
import { SERVED_M, offerAt } from './plazaLife.ts';
import { KEEPERS } from './keepers.ts';
import { goalOf, puzzlePoints } from './quests/questBook.ts';
import { shapeSpot } from './townsfolk.ts';
import { chime } from './uiSounds.ts';
import type { NodeInfo } from './worldData.ts';

/** How near a resource node a player stands to gather it, and a puzzle's point to use it; how long E is held to gather
 *  a node, and how far the body may stir meanwhile: as the room has them (`asks.rs`). The most of a resource a player
 *  carries, as the gear crate has it (`character.rs`): a node of one they are full of is not offered. */
export const NODE_REACH_M = 2.5;
export const POINT_REACH_M = 3;
export const GATHER_S = 2;
export const GATHER_STIR_M = 0.3;
export const STOCK_MOST = 200;
/** A puzzle's point unlit and lit, and a ward a quest defends, in the players' green. */
const UNLIT = [0.62, 0.72, 0.9] as const;
const LIT = [0.98, 0.84, 0.45] as const;
const WARD = [0.42, 0.86, 0.42] as const;
/** How tall a puzzle point's or a ward's beam stands, and half of how wide it is, metres: it is seen hundreds of metres
 *  off. */
const BEAM = { height: 40, half: 0.5 } as const;
/** How much of its opacity a beam keeps at its top. */
const BEAM_TOP = 0.2;

/** Shape's offer, opened as a counter's is, within the reach a counter serves. */
const SHAPE_OFFER = { words: KEEPERS.shape.title, opens: { view: 'shape' } } as const;

/** The stations of the place a player stands in, and where Shape may stand there. */
type Here = Pick<NodeInfo, 'stations' | 'visitorSpots'>;

/** What E does where a player stands: its deed in words, and the doing; and for a node, which, as E is held there. */
export interface Use {
  readonly words: string;
  readonly run: () => void;
  readonly gather?: number;
}

/** What E does at a counter of a kind (its offer's view) besides opening it: speaking with its keeper, while a quest
 *  asks it (quests/quests.ts). */
export type Speak = (counter: string, ask: (asked: GearAsk) => void) => Use | null;

/** The use within reach of a player at (x, y): a station's offer (its keeper spoken with where `speak` says so), then
 *  Shape's, before a node, so a counter is never lost to one. A node is not offered on horseback (`mounted`), nor one
 *  whose resource the player is full of. */
export function useAt(
  x: number,
  y: number,
  here: Here,
  gear: GearState | null,
  ask: (asked: GearAsk) => void,
  speak: Speak = () => null,
  mounted = false,
): Use | null {
  const shape = shapeSpot(gear?.shape, here.visitorSpots ?? []);
  const near = shape && Math.hypot(shape[0] - x, shape[1] - y) <= SERVED_M;
  const offer = offerAt(here.stations ?? [], x, y) ?? (near ? SHAPE_OFFER : null);
  if (offer) return speak(offer.opens.view, ask) ?? { words: offer.words, run: () => openGearWindow(offer.opens) };
  // A point already lit is used no more: the room would take it as a wrong one.
  const reached = (each: { x: number; y: number }) => Math.hypot(each.x - x, each.y - y) <= POINT_REACH_M;
  const point = puzzlePoints(gear?.quest).find((each) => !each.lit && reached(each));
  if (point) {
    const named = point.name.replace(/^The /, 'the ');
    return { words: `Use ${named}`, run: () => ask({ kind: ASKS.usePoint, column: point.index }) };
  }
  const node = gear?.nodes.find((each) => Math.hypot(each.x - x, each.y - y) <= NODE_REACH_M);
  if (!node || mounted || (gear?.resources[node.resource] ?? 0) >= STOCK_MOST) return null;
  return {
    words: `Hold to gather ${resourceName(node.resource)}`,
    run: () => ask({ kind: ASKS.gather, node: node.index }),
    gather: node.index,
  };
}

/** A beam of light standing `height` over `base`, in two crossed planes so it is seen from every side, fading upward. */
function markBeam(
  out: number[],
  base: readonly number[],
  { height, half }: { readonly height: number; readonly half: number },
  colour: readonly number[],
): void {
  const [x = 0, y = 0, z = 0] = base;
  const [red = 1, green = 1, blue = 1, opacity = 1] = colour;
  const vertex = (east: number, south: number, up: number, alpha: number) =>
    out.push(x + east, y + south, z + up, red, green, blue, alpha);
  const top = opacity * BEAM_TOP;
  for (const [east, south] of [
    [half, 0],
    [0, half],
  ] as const) {
    vertex(-east, -south, 0, opacity);
    vertex(east, south, 0, opacity);
    vertex(east, south, height, top);
    vertex(-east, -south, 0, opacity);
    vertex(east, south, height, top);
    vertex(-east, -south, height, top);
  }
}

/** A quest's puzzle points and the ward it defends by name at `seconds` of the page's clock, each a ring on `floor`'s
 *  height where it stands under a beam. */
export function questRings(gear: GearState | null, floor: (x: number, y: number) => number, seconds: number): number[] {
  const out: number[] = [];
  const beat = 0.55 + 0.25 * Math.sin(seconds * 3);
  for (const { x, y, lit } of puzzlePoints(gear?.quest)) {
    const base = [x, y, floor(x, y)] as const;
    const colour = lit ? LIT : UNLIT;
    markRing(out, base, POINT_REACH_M - 0.1, POINT_REACH_M, [...colour, 0.5]);
    markRing(out, base, 0.3, 0.6, [...colour, lit ? 1 : beat]);
    markBeam(out, base, BEAM, [...colour, lit ? 1 : Math.min(1, beat + 0.25)]);
  }
  // A ward a figure stands for is drawn as that figure (quests/quests.ts); a named one is marked here.
  const ward = gear?.quest?.claimed === false ? null : gear?.quest?.ward;
  if (ward && !goalOf(gear?.quest, 'defend')?.who) {
    const base = [ward.x, ward.y, floor(ward.x, ward.y)] as const;
    markRing(out, base, 1.4, 1.6, [...WARD, 0.7]);
    markBeam(out, base, BEAM, [...WARD, Math.min(1, beat + 0.25)]);
  }
  return out;
}

/** The drops lying for the player (`lying`), flying and standing, seen from `eye`, laid after the marks in `out`, and
 *  where each came to rest this frame; a Rare or finer chimes as it comes to rest. */
export function dropsLaid(
  drops: DropsShown,
  lying: Parameters<DropsShown['frame']>[0],
  clock: number,
  eye: readonly [number, number, number],
  out: number[],
) {
  const shown = drops.frame(lying, clock, eye, out);
  const rarest = Math.max(-1, ...shown.rested);
  if (rarest >= 2) chime(rarest);
  return shown;
}

/** On foot the story is always behind the page: every way there comes after it, played through or passed over (Begin
 *  at the title, a `?at=` link, a story that could not start or go on). So no character is kept out of the patrols by
 *  a prologue that did not run. */
export const STORY_BEHIND_ON_FOOT = true;

/** Whether the page tells its room the prologue is done: once the story is behind it, and once for each word on the
 *  gear that says it is not kept, so a kept character claimed after the first word is told again. */
export function tellsPrologue(gear: GearState | null, played: boolean, told: GearState | null): boolean {
  return played && gear !== null && gear !== told && gear.prologueDone === false;
}
