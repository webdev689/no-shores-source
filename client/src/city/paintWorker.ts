// Paints the city's pictures off the page's thread: each takes 20 to 40 ms, and a city wears a hundred or more.
import { paintPicture, type PictureUse } from '../textures/picture.ts';
import { levelsOf, resampled, type LayerLevels } from './layerImage.ts';

/** A picture to paint, for its layer. */
export type PaintJob = {
  readonly layer: number;
  readonly archive: number;
  readonly record: number;
  readonly uses: readonly PictureUse[];
};

/** A painted layer's levels, or none where nothing could be painted. */
export type Painted = { readonly layer: number; readonly levels: LayerLevels | null; readonly milliseconds: number };

const scope = globalThis as unknown as {
  addEventListener(type: 'message', listener: (event: MessageEvent<PaintJob>) => void): void;
  postMessage(message: Painted, transfer: Transferable[]): void;
};

scope.addEventListener('message', (event) => {
  const { layer, archive, record, uses } = event.data;
  const started = performance.now();
  const named = new Set(uses);
  const picture = paintPicture(archive, record, 0, new Map([[`${archive}.${record}`, named]]));
  const levels = picture ? levelsOf(resampled(picture.rgba, picture.width, picture.height)) : null;
  scope.postMessage(
    { layer, levels, milliseconds: performance.now() - started },
    levels ? levels.map((level) => level.buffer) : [],
  );
});
