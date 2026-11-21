import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Pictures } from './pictures.ts';

/** A bitmap as the SVG drawer hands one back, noting whether it was closed. */
function bitmap(): ImageBitmap & { closed: boolean } {
  const made = { width: 8, height: 8, closed: false, close: () => (made.closed = true) };
  return made as unknown as ImageBitmap & { closed: boolean };
}

function picturesWith(copied: unknown[]): Pictures {
  const device = { queue: { copyExternalImageToTexture: (from: { source: unknown }) => copied.push(from.source) } };
  const room = () => ({ x: 0, y: 0, layer: 0, width: 8, height: 8 });
  return new Pictures(device as unknown as GPUDevice, room, () => ({}) as GPUTexture);
}

test('a bitmap drawn for a picture is closed once it is copied into the atlas', async () => {
  const copied: unknown[] = [];
  const pictures = picturesWith(copied);
  const drawn = bitmap();
  pictures.drawSvg = () => Promise.resolve(drawn);
  pictures.texels({ key: 'mark', source: { svg: '<svg/>' } }, 8, 8);
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(copied, [drawn]);
  assert.ok(drawn.closed);
});

test('a bitmap that comes after the atlas was laid afresh is closed and not copied', async () => {
  const copied: unknown[] = [];
  const pictures = picturesWith(copied);
  const drawn = bitmap();
  let arrive: (image: ImageBitmap) => void = () => undefined;
  pictures.drawSvg = () => new Promise((resolve) => (arrive = resolve));
  pictures.texels({ key: 'mark', source: { svg: '<svg/>' } }, 8, 8);
  pictures.clear();
  arrive(drawn);
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(copied, []);
  assert.ok(drawn.closed);
});
