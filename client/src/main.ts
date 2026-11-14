import { canvasSize } from './canvasSize.ts';
import { GpuUnavailable, startGpu } from './gpu.ts';

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
  const gpu = await startGpu(canvas);
  const frame = (): void => {
    const encoder = gpu.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: gpu.context.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    pass.end();
    gpu.device.queue.submit([encoder.finish()]);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
} catch (error) {
  if (!(error instanceof GpuUnavailable)) throw error;
  document.body.textContent = error.message;
  document.body.style.cssText = 'color:#ddd;font:16px system-ui;padding:24px';
}
