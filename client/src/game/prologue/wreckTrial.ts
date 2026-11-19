import type { CardAt } from '../../player/cards.ts';
import type { Input } from '../../player/input.ts';
import type { Landmass } from '../landmass.ts';
import type { FootView } from '../footView.ts';
import type { CloseSource, Drawer, GameScene } from '../scene.ts';
import { offshore } from '../seaLaw.ts';
import { readWreck } from './wreckLayout.ts';
import { type WreckContext, WreckRun } from './wreckRun.ts';

/** What trying the wreck draws with: the game's scene and where its close ground comes from, its input, its view of
 *  the fight on foot, its canvas, and its drawers for the figures and the fight's blood and marks (its `standing`). */
export interface TrialDrawing {
  readonly scene: GameScene;
  readonly closeSource: CloseSource;
  readonly input: Input;
  readonly footView: FootView;
  readonly canvas: HTMLCanvasElement;
  readonly standing: (
    ships: readonly never[],
    figures: readonly CardAt[],
    fight: { under: Drawer; over: Drawer },
  ) => Drawer[];
}

/** The longest frame stepped, seconds, as the game's own. */
const LONGEST_FRAME_S = 0.1;

/**
 * Plays the wreck for trying it under `npm run dev` (`?wreck=1`), in place of the first node: once `takeFirst`
 * hands over the node the game entered first (taking it from the game) and it is left, the wreck opens offshore of the landmass's city,
 * where the sea lies as the voyage's anchorage does, and is drawn frame by frame. The run and the walker are left on `window` (`wreck`, `walker`), for a browser check to drive.
 */
export async function tryWreck(
  context: WreckContext,
  landmass: Landmass,
  takeFirst: () => { leave(): void } | null,
  drawing: TrialDrawing,
): Promise<void> {
  let first = takeFirst();
  while (!first) {
    await new Promise((done) => setTimeout(done, 100));
    first = takeFirst();
  }
  first.leave();
  const [social, plan] = [landmass.nodes[0]?.centre ?? [0, 0], landmass.plan];
  const origin = offshore(landmass.heightAt, plan?.centre ?? social, plan?.harbour ?? social);
  const wreck = await WreckRun.open(context, readWreck(), origin);
  Object.assign(window, { wreck, walker: context.walker });
  const { walker, groundAt } = context;
  const { scene, closeSource, input, standing, footView, canvas } = drawing;
  const play = (then: number, now: number) => {
    const controls = input.frame();
    const seconds = Math.min(LONGEST_FRAME_S, (now - then) / 1000);
    const size = { width: canvas.width, height: canvas.height };
    const aspect = size.width / Math.max(1, size.height);
    const shown = wreck.frame(controls, seconds, now / 1000, {
      paused: false,
      hands: controls.locked,
      aspect,
      held: false,
    });
    scene.keepClose([walker.player.body.x, walker.player.body.y], closeSource, () => undefined);
    const viewport = { width: canvas.clientWidth, height: canvas.clientHeight };
    const fight = footView.frame(wreck, shown, seconds, { size, viewport, groundAt });
    const drawers = [...standing([], shown.figures, fight), wreck.drawer];
    scene.draw(shown.shot, size, now / 1000, seconds, drawers);
    requestAnimationFrame((next) => play(now, next));
  };
  requestAnimationFrame((now) => play(now, now));
}
