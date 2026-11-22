// The interface's renderer: its atlas of glyphs, tiles and pictures, and each frame's quads drawn in one pass over
// whatever the frame drew before it, at the frame's end, on the canvas's own texture.
import { BUFFER_USAGE, type Gpu, TEXTURE_USAGE } from '../gpu.ts';
import { ATLAS_SIZE, Layers, type Placed } from './atlas.ts';
import type { Glyph } from './glyphs.ts';
import type { Picture } from './node.ts';
import { Pictures } from './pictures.ts';
import { type Box, type Colour, colourOf, QUAD_FLOATS, QuadList, UNCLIPPED } from './quads.ts';
import { type Face, layLine, widthOf } from './text.ts';
import { UI_SHADER } from './uiShader.ts';

/** Device pixels a CSS pixel of the interface takes: the screen's ratio to a whole pixel, so every cell and edge
 *  lands on whole pixels; a ratio of 1.5 draws at 2. */
export const uiScale = (ratio: number): number => Math.max(1, Math.round(ratio));

/** Bytes a quad takes. */
const QUAD_BYTES = QUAD_FLOATS * 4;

export class UiRenderer {
  readonly quads = new QuadList();
  readonly face: Face;
  private readonly gpu: Gpu;
  private readonly pipeline: GPURenderPipeline;
  private atlas: GPUTexture;
  private readonly view: GPUBuffer;
  private binding: GPUBindGroup;
  private readonly layers = new Layers();
  private readonly placed = new Map<Glyph | string, Placed | null>();
  private readonly pictures: Pictures;
  /** Whether the atlas had no room left this frame: it is laid afresh once the frame is drawn. */
  private full = false;
  private instances: GPUBuffer | null = null;
  /** Pictures already said to be too large to draw, so each is said once. */
  private readonly tooLarge = new Set<string>();

  constructor(gpu: Gpu, face: Face) {
    this.gpu = gpu;
    this.face = face;
    const { device, format } = gpu;
    const module = device.createShaderModule({ code: UI_SHADER });
    const attribute = (shaderLocation: number) => ({
      shaderLocation,
      offset: shaderLocation * 16,
      format: 'float32x4' as const,
    });
    this.pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module,
        entryPoint: 'vertex_main',
        buffers: [{ arrayStride: QUAD_BYTES, stepMode: 'instance', attributes: [0, 1, 2, 3, 4].map(attribute) }],
      },
      fragment: {
        module,
        entryPoint: 'fragment_main',
        targets: [
          {
            format,
            blend: {
              color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
            },
          },
        ],
      },
      primitive: { topology: 'triangle-strip' },
    });
    this.view = device.createBuffer({ size: 16, usage: BUFFER_USAGE.uniform | BUFFER_USAGE.copyDestination });
    this.atlas = this.atlasOf(1);
    this.binding = this.bindingOf(this.atlas);
    this.pictures = new Pictures(
      device,
      (width, height) => this.room(width, height),
      () => this.atlas,
    );
  }

  /** The atlas with `count` layers. */
  private atlasOf(count: number): GPUTexture {
    return this.gpu.device.createTexture({
      size: [ATLAS_SIZE, ATLAS_SIZE, count],
      format: 'rgba8unorm',
      // Copied into from pictures (which asks for drawing too), and copied from when it grows.
      usage:
        TEXTURE_USAGE.textureBinding |
        TEXTURE_USAGE.copyDestination |
        TEXTURE_USAGE.copySource |
        TEXTURE_USAGE.renderAttachment,
    });
  }

  private bindingOf(atlas: GPUTexture): GPUBindGroup {
    return this.gpu.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.view } },
        { binding: 1, resource: atlas.createView({ dimension: '2d-array' }) },
      ],
    });
  }

  /** Room in the atlas for a `width` by `height` picture, a layer more opened when the last is full. */
  private room(width: number, height: number): Placed | null {
    const box = this.layers.place(width, height);
    if (!box && this.layers.fits(width, height)) this.full = true;
    if (box && box.layer >= this.atlas.depthOrArrayLayers) {
      const grown = this.atlasOf(this.layers.count);
      const encoder = this.gpu.device.createCommandEncoder();
      encoder.copyTextureToTexture({ texture: this.atlas }, { texture: grown }, [
        ATLAS_SIZE,
        ATLAS_SIZE,
        this.atlas.depthOrArrayLayers,
      ]);
      this.gpu.device.queue.submit([encoder.finish()]);
      this.atlas.destroy();
      this.atlas = grown;
      this.binding = this.bindingOf(grown);
    }
    return box;
  }

  /** The width of `words` at `size`, in CSS pixels. */
  measure(words: string, size: number): number {
    return widthOf(this.face, words, size);
  }

  /** Where `glyph` lies in the atlas, laid there as it is first wanted: its cells white, the rest clear. */
  glyphTexels(glyph: Glyph): Placed | null {
    if (this.placed.has(glyph)) return this.placed.get(glyph) ?? null;
    const box = this.room(glyph.width, glyph.height);
    if (box) {
      const pixels = new Uint8Array(glyph.cells.length * 4);
      glyph.cells.forEach((cell, index) => pixels.fill(cell ? 255 : 0, index * 4, index * 4 + 4));
      this.write(box, pixels);
    }
    this.placed.set(glyph, box);
    return box;
  }

  /** Where the tile `key` lies in the atlas, laid there from `pixels` (RGBA, `width` by `height`) the first time. */
  tileTexels(key: string, width: number, height: number, pixels: () => Uint8Array): Placed | null {
    if (this.placed.has(key)) return this.placed.get(key) ?? null;
    const box = this.room(width, height);
    if (box) this.write(box, pixels());
    this.placed.set(key, box);
    return box;
  }

  /** `words` at `size` (a whole multiple of the face's grid) with their line's top-left at `x`, `y` (device pixels),
   *  each unit `scale` device pixels, in `ink.colour`; under them a hard shadow `ink.shadow.step` units down and
   *  right where given; all faded in by `ink.fade`. */
  text(
    words: string,
    where: { readonly x: number; readonly y: number; readonly size: number; readonly scale: number },
    ink: {
      readonly colour: string;
      readonly shadow?: { readonly colour: string; readonly step: number };
      readonly fade?: number;
    },
    clip: Box = UNCLIPPED,
  ): void {
    const { x, y, size, scale } = where;
    const fade = ink.fade ?? 1;
    const { glyphs } = layLine(this.face, words, size);
    const draw = (offset: number, css: string) => {
      const [red, green, blue, alpha] = colourOf(css);
      const tone: Colour = [red, green, blue, alpha * fade];
      for (const laid of glyphs) {
        const texels = this.glyphTexels(laid.glyph);
        if (!texels) continue;
        const box = {
          x: x + (laid.x + offset) * scale,
          y: y + (laid.y + offset) * scale,
          width: laid.glyph.width * size * scale,
          height: laid.glyph.height * size * scale,
        };
        this.quads.add(box, tone, clip, texels);
      }
    };
    if (ink.shadow) draw(ink.shadow.step, ink.shadow.colour);
    draw(0, ink.colour);
  }

  /** Draws the frame's quads over what the canvas holds, and starts the next frame's list. */
  present(width: number, height: number): void {
    const { device, context } = this.gpu;
    const data = this.quads.data;
    if (this.quads.count > 0) {
      if (!this.instances || this.instances.size < data.byteLength) {
        this.instances?.destroy();
        this.instances = device.createBuffer({
          size: Math.max(data.byteLength, QUAD_BYTES * 256) * 2,
          usage: BUFFER_USAGE.vertex | BUFFER_USAGE.copyDestination,
        });
      }
      device.queue.writeBuffer(this.instances, 0, data);
      device.queue.writeBuffer(this.view, 0, new Float32Array([width, height, 0, 0]));
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [{ view: context.getCurrentTexture().createView(), loadOp: 'load', storeOp: 'store' }],
      });
      pass.setPipeline(this.pipeline);
      pass.setBindGroup(0, this.binding);
      pass.setVertexBuffer(0, this.instances);
      pass.draw(4, this.quads.count);
      pass.end();
      device.queue.submit([encoder.finish()]);
    }
    this.quads.clear();
    // A full atlas starts again from empty, once this frame no longer reads it: what the next frame wants is laid
    // again as it is wanted, so pictures drawn at sizes now gone (a window resized) give back their room.
    if (this.full) {
      this.full = false;
      this.layers.clear();
      this.placed.clear();
      this.pictures.clear();
    }
  }

  /** `picture` over `box` (device pixels) inside `clip`, faded by `fade`; nothing until its pixels have come. One
   *  larger than a layer of the atlas is laid there scaled down to fit and stretched back over its box; one whose own
   *  texels are given (pixel art, raw pixels) cannot be scaled, and is said once and not drawn. */
  picture(picture: Picture, box: Box, clip: Box = UNCLIPPED, fade = 1): void {
    let width = picture.pixel?.width ?? Math.round(box.width);
    let height = picture.pixel?.height ?? Math.round(box.height);
    const most = ATLAS_SIZE - 1;
    if (width > most || height > most) {
      if (picture.pixel || 'pixels' in picture.source) {
        if (!this.tooLarge.has(picture.key)) console.warn(`a picture larger than the atlas holds: ${picture.key}`);
        this.tooLarge.add(picture.key);
        return;
      }
      const fit = most / Math.max(width, height);
      [width, height] = [Math.max(1, Math.floor(width * fit)), Math.max(1, Math.floor(height * fit))];
    }
    const texels = this.pictures.texels(picture, width, height);
    if (!texels) return;
    const [red, green, blue, alpha] = picture.tint ? colourOf(picture.tint) : [1, 1, 1, 1];
    this.quads.add(box, [red, green, blue, alpha * fade], clip, texels, ((picture.turn ?? 0) * Math.PI) / 180);
  }

  private write(box: Placed, pixels: Uint8Array): void {
    this.gpu.device.queue.writeTexture(
      { texture: this.atlas, origin: [box.x, box.y, box.layer] },
      pixels as Uint8Array<ArrayBuffer>,
      { bytesPerRow: box.width * 4 },
      [box.width, box.height],
    );
  }
}
