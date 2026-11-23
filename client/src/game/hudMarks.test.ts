import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Node, Picture } from '../ui/node.ts';
import type { Interface } from '../ui/ui.ts';
import { markNodes, type ScreenMark } from './hudMarks.ts';

/** What a picture's drawing does on a context that only notes it. */
function drawnBy(picture: Picture): string[] {
  const calls: string[] = [];
  const context = new Proxy({} as Record<string, unknown>, {
    get:
      (_held, name: string) =>
      (...args: unknown[]) =>
        calls.push(`${name}(${args.map(String).join(',')})`),
    set: () => true,
  }) as unknown as OffscreenCanvasRenderingContext2D;
  const source = picture.source as { draw: (context: OffscreenCanvasRenderingContext2D, w: number, h: number) => void };
  source.draw(context, 64, 64);
  return calls;
}

test("a locked node's mark is a padlock drawn in its grey, no glyph a system's face would colour", () => {
  const ui = { clicked: () => false, hovered: () => false, focusOn: () => undefined } as unknown as Interface;
  const mark = {
    id: 'tidewall-patrol',
    kind: 'patrol',
    name: 'Tidewall',
    note: 'locked',
    x: 100,
    y: 100,
    sizePx: 32,
    locked: true,
    chosen: false,
    arrowDegrees: null,
  } as unknown as ScreenMark;
  const [ring] = markNodes(ui, [mark], () => undefined).filter((node): node is Node => !!node && 'picture' in node);
  const calls = drawnBy(ring?.picture as Picture);
  assert.ok(
    calls.some((call) => call.startsWith('fillRect(')),
    'its body',
  );
  assert.ok(!calls.some((call) => call.startsWith('fillText(')), 'no text glyph at all');
});
