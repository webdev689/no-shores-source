import { type GlowField, type GlowLook, glowField, recolourToGlow } from '../elementGlow.ts';
import { type Colours, type Strip, composeFrame } from '../forge/compose.ts';
import type { Rgb } from '../forge/dyes.ts';
import { type Figure, type ForgeLooks, layerPath, layersOf } from '../forge/looks.ts';

/** A frame to compose: the figure as drawn (a mirrored view's layers already swapped), its move, view and frame, the
 *  ramps its dyed layers take, the glow its weapon or a cast's spark takes (0 for none), and, for a page's picture,
 *  the layers drawn by themselves (a weapon whole, or a horse without its rider). */
export interface ComposeJob {
  readonly figure: Figure;
  readonly anim: string;
  readonly view: number;
  readonly frame: number;
  readonly ramps: Readonly<Record<string, readonly Rgb[]>>;
  /** The layers whose ramp covers them whole: a dye worn's or a faction's colour on its armour (`layerRamps`). */
  readonly whole?: readonly string[] | undefined;
  readonly glow: GlowLook;
  readonly alone?: readonly string[] | undefined;
}

/** The forge's looks a job is drawn by: given layers alone, its body read as one that stacks only those. */
function looksOf(job: ComposeJob, looks: ForgeLooks): ForgeLooks {
  const own = looks.bodies[job.figure.body];
  if (!job.alone || !own) return looks;
  const layers = Object.fromEntries(job.alone.map((layer) => [layer, own.layers[layer] ?? []]));
  return { ...looks, bodies: { [job.figure.body]: { ...own, layers } } };
}

/** A frame composed, as a card is made from it: its pixels, size and feet, and the field round its weapon if it
 *  glows. */
export interface ComposedCard {
  readonly width: number;
  readonly height: number;
  readonly root: readonly [number, number];
  readonly pixels: Uint8Array;
  readonly field: GlowField | null;
}

/** The move a cast plays, whose spark glows in its Art's element; the forge draws the spark as what hangs free, so it
 *  is named to count as the weapon. */
export const CAST = 'cast';
const SPARK: ReadonlySet<string> = new Set(['spark']);

/** The strips a job's frame is composed from: each of its layers' colour and depth. */
export function stripsOf(job: ComposeJob, looks: ForgeLooks): string[] {
  return layersOf(job.figure, job.anim, looksOf(job, looks)).flatMap((layer) => [
    layerPath(job.figure.body, layer, job.anim),
    layerPath(job.figure.body, layer, job.anim, true),
  ]);
}

/** Composes a job's frame as a card is made from it: a cast's spark recoloured to its Art's glow, and a glowing
 *  weapon's outline field; null where the forge drew nothing. */
export async function composeCard(
  job: ComposeJob,
  looks: ForgeLooks,
  colours: Colours,
  strip: (path: string) => Promise<Strip | null>,
): Promise<ComposedCard | null> {
  const cast = job.anim === CAST;
  const { figure, anim, view, frame, ramps, glow } = job;
  const composed = await composeFrame(
    figure,
    anim,
    view,
    frame,
    looksOf(job, looks),
    colours,
    ramps,
    strip,
    cast ? SPARK : undefined,
    new Set(job.whole),
  );
  if (!composed) return null;
  if (glow && cast) recolourToGlow(composed.pixels, glow, composed.held);
  const field =
    glow && composed.weapon.includes(1) ? glowField(composed.weapon, composed.width, composed.height, glow) : null;
  const { width, height, root, pixels } = composed;
  return { width, height, root, pixels, field };
}
