// A picture of the interface for checking it headless, with nothing else drawn: a node tree built by `build` drawn
// through the real renderer onto a texture of its own over a plain ground, read back as a PNG's data URL. It takes a
// few frames so pictures have come, hearing `events` on the second (or frame `at`), once the first has laid what they
// press; an event may name a node (`on`) in place of a place, heard at the middle of where it was laid, and a frame of
// its own (`at`). Used by `tools/uiShot.mjs`; the game never imports it.
import { BUFFER_USAGE, type Gpu, TEXTURE_USAGE } from '../gpu.ts';
import { readFace } from './faceReader.ts';
import type { Node } from './node.ts';
import { Interface, type UiEvent } from './ui.ts';
import { UiRenderer } from './uiRenderer.ts';

/** `GPUMapMode.READ`, by the specification's value. */
const MAP_READ = 0x1;

/** A pointer's event at a node laid last frame, by its id, in place of a place. */
export interface AimedEvent {
  readonly kind: 'pointer' | 'down' | 'up';
  readonly on: string;
  readonly button?: number;
}

/** An event a shot hears, on its own frame if it says one. */
export type ShotEvent = (UiEvent | AimedEvent) & { readonly at?: number };

/** `event` with a place: an aimed one at the middle of its node's box, or nothing where none was laid. */
function placed(ui: Interface, event: ShotEvent): UiEvent | null {
  if (!('on' in event)) return event;
  const box = ui.boxOf(event.on);
  if (!box) {
    // Said, as the tool prints the page's warnings, so a shot aimed at a node never laid is not taken for a press.
    console.warn(`a shot's event names ${event.on}, which was not laid`);
    return null;
  }
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  return event.kind === 'pointer' ? { kind: 'pointer', x, y } : { kind: event.kind, x, y, button: event.button ?? 0 };
}

/** Draws `build`'s tree at `width` by `height` CSS pixels and `scale` device pixels each, over `ground`. */
export async function shot(
  build: (ui: Interface) => Node,
  view: { readonly width: number; readonly height: number; readonly scale: number },
  more: {
    readonly events?: readonly ShotEvent[];
    readonly ground?: readonly number[];
    readonly frames?: number;
    readonly at?: number;
  } = {},
): Promise<string> {
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('no GPU adapter');
  const device = await adapter.requestDevice();
  const format: GPUTextureFormat = 'rgba8unorm';
  const width = view.width * view.scale;
  const height = view.height * view.scale;
  const target = device.createTexture({
    size: [width, height],
    format,
    usage: TEXTURE_USAGE.renderAttachment | TEXTURE_USAGE.copySource,
  });
  const gpu = { device, format, context: { getCurrentTexture: () => target } } as unknown as Gpu;
  const ui = new Interface(new UiRenderer(gpu, await readFace()));
  const frames = Math.max(2, more.frames ?? 4);
  const [red = 0.2, green = 0.25, blue = 0.3] = more.ground ?? [];
  for (let frame = 0; frame < frames; frame++) {
    const encoder = device.createCommandEncoder();
    encoder
      .beginRenderPass({
        colorAttachments: [
          { view: target.createView(), clearValue: [red, green, blue, 1], loadOp: 'clear', storeOp: 'store' },
        ],
      })
      .end();
    device.queue.submit([encoder.finish()]);
    const heard = (more.events ?? []).filter((event) => (event.at ?? more.at ?? 1) === frame);
    ui.frame(
      { width, height, scale: view.scale },
      heard.flatMap((event) => placed(ui, event) ?? []),
      1 / 60,
    );
    ui.draw(build(ui));
    ui.renderer.present(width, height);
    await device.queue.onSubmittedWorkDone();
    // Room for a picture's fetch or decode to land before the next frame.
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  const row = Math.ceil((width * 4) / 256) * 256;
  const buffer = device.createBuffer({
    size: row * height,
    usage: BUFFER_USAGE.copyDestination | BUFFER_USAGE.mapRead,
  });
  const encoder = device.createCommandEncoder();
  encoder.copyTextureToBuffer({ texture: target }, { buffer, bytesPerRow: row }, [width, height]);
  device.queue.submit([encoder.finish()]);
  await buffer.mapAsync(MAP_READ);
  const bytes = new Uint8Array(buffer.getMappedRange());
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let line = 0; line < height; line++)
    pixels.set(bytes.subarray(line * row, line * row + width * 4), line * width * 4);
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext('2d')?.putImageData(new ImageData(pixels, width, height), 0, 0);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  const reader = new FileReader();
  return new Promise((resolve) => {
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}
