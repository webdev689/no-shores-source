import { canvasSize } from './canvasSize.ts';
import { startGame } from './game/game.ts';
import { GpuUnavailable, startGpu } from './gpu.ts';
import { stopped } from './ui/page.ts';

const canvas = document.querySelector<HTMLCanvasElement>('#game');
if (!canvas) throw new Error('index.html has no <canvas id="game">');

/** Keeps the drawing buffer at the canvas's displayed size in device pixels, so nothing is blurred or stretched. */
function fitCanvas(target: HTMLCanvasElement): void {
  const size = canvasSize(target.clientWidth, target.clientHeight, window.devicePixelRatio);
  if (target.width !== size.width || target.height !== size.height) {
    target.width = size.width;
    target.height = size.height;
  }
}

new ResizeObserver(() => fitCanvas(canvas)).observe(canvas);
fitCanvas(canvas);

try {
  await startGame(await startGpu(canvas), canvas);
} catch (error) {
  if (error instanceof GpuUnavailable) stopped(error.message);
  else stopped(`The game could not start: ${error instanceof Error ? error.message : String(error)}`);
}
