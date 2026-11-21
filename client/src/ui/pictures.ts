// The interface's pictures, laid into the atlas as each is first wanted, at the size it is drawn: a file fetched and
// scaled, SVG markup drawn at that size, RGBA pixels written as they are, or 2D drawing done there. A live image is
// copied in again whenever its version changes. A picture shows nothing until its pixels have come.
import type { Placed } from './atlas.ts';
import type { Picture, PictureSource } from './node.ts';

/** Draws SVG markup at `width` by `height` pixels. Only a page can decode SVG, so a worker hands this to its page. */
export type SvgDrawer = (svg: string, width: number, height: number) => Promise<ImageBitmap>;

/** Draws SVG markup in the page, through an image that is decoded and never shown. */
export const drawSvgInPage: SvgDrawer = async (svg, width, height) => {
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await image.decode();
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext('2d')?.drawImage(image, 0, 0, width, height);
  return canvas.transferToImageBitmap();
};

interface Entry {
  readonly placed: Placed | null;
  ready: boolean;
  version: number;
}

type Image = ImageBitmap | OffscreenCanvas | HTMLCanvasElement;

export class Pictures {
  private readonly device: GPUDevice;
  private readonly room: (width: number, height: number) => Placed | null;
  private readonly atlas: () => GPUTexture;
  private readonly entries = new Map<string, Entry>();
  /** How SVG is drawn: in the page unless a worker says otherwise. */
  drawSvg: SvgDrawer = drawSvgInPage;

  constructor(device: GPUDevice, room: (width: number, height: number) => Placed | null, atlas: () => GPUTexture) {
    this.device = device;
    this.room = room;
    this.atlas = atlas;
  }

  /** Where `picture` lies in the atlas at `width` by `height` texels, once its pixels have come; null until then, or
   *  when it could not be had. */
  texels(picture: Picture, width: number, height: number): Placed | null {
    const key = `${picture.key} ${width}x${height}`;
    const { source } = picture;
    let entry = this.entries.get(key);
    if (!entry) {
      entry = { placed: this.room(width, height), ready: false, version: -1 };
      this.entries.set(key, entry);
      if (entry.placed && !('image' in source)) this.load(entry, source, width, height, Boolean(picture.pixel));
    }
    if ('image' in source && entry.placed && entry.version !== source.version) {
      entry.version = source.version;
      this.copy(entry.placed, sized(source.image, width, height));
      entry.ready = true;
    }
    return entry.ready ? entry.placed : null;
  }

  private load(entry: Entry, source: PictureSource, width: number, height: number, pixel: boolean): void {
    const placed = entry.placed;
    if (!placed) return;
    const done = (image: Image) => {
      this.copy(placed, image);
      entry.ready = true;
    };
    const failed = (error: unknown) => console.warn('a picture could not be had:', error);
    if ('pixels' in source) {
      this.device.queue.writeTexture(
        { texture: this.atlas(), origin: [placed.x, placed.y, placed.layer] },
        source.pixels() as Uint8Array<ArrayBuffer>,
        { bytesPerRow: width * 4 },
        [width, height],
      );
      entry.ready = true;
    } else if ('draw' in source) {
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext('2d');
      if (!context) return;
      source.draw(context, width, height);
      done(canvas);
    } else if ('svg' in source) {
      this.drawSvg(source.svg, width, height).then(done, failed);
    } else if ('url' in source) {
      fetch(source.url)
        .then((answer) => (answer.ok ? answer.blob() : Promise.reject(new Error(`${source.url}: ${answer.status}`))))
        .then((blob) =>
          createImageBitmap(blob, {
            resizeWidth: width,
            resizeHeight: height,
            resizeQuality: pixel ? 'pixelated' : 'high',
          }),
        )
        .then(done, failed);
    }
  }

  private copy(placed: Placed, image: Image): void {
    this.device.queue.copyExternalImageToTexture(
      { source: image },
      { texture: this.atlas(), origin: [placed.x, placed.y, placed.layer] },
      [placed.width, placed.height],
    );
  }
}

/** `image` at exactly `width` by `height`, drawn smaller or larger when it is not. */
function sized(image: Image, width: number, height: number): Image {
  if (image.width === width && image.height === height) return image;
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext('2d')?.drawImage(image, 0, 0, width, height);
  return canvas;
}
