import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Node, Picture } from '../ui/node.ts';
import type { Interface } from '../ui/ui.ts';
import type { AccountLink } from '../network/accounts.ts';
import { guildHeld, keepGuild } from './guild/guildHeld.ts';
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

test("the guild's own outposts are marked by a star over the ring and in words, not by their colours alone", async () => {
  Object.assign(globalThis, { addEventListener: () => undefined });
  const banner = { cut: 'swallowtail', cloth: 'navy', device: 'halves', deviceColour: 'gold', sign: 'anchor' };
  const full = { ...banner, signColour: 'salt', ground: 'roundel', groundColour: 'crimson', staff: 'driftwood' };
  keepGuild({
    guild: () => Promise.resolve({ guild: { key: '0a1b2c3d4e5f60718293a4b5c6d7e8f9', rank: 2, banner: full } }),
    outposts: () => Promise.resolve({ outposts: [{ site: 'gull-cove-outpost' }] }),
  } as unknown as AccountLink);
  await guildHeld();
  await Promise.resolve();
  const ui = { clicked: () => false, hovered: () => false, focusOn: () => undefined } as unknown as Interface;
  const mark = (id: string) =>
    ({
      id,
      kind: 'outpost',
      name: 'Gull Cove',
      note: 'raised',
      x: 0,
      y: 0,
      sizePx: 32,
      locked: false,
      chosen: false,
      arrowDegrees: null,
    }) as unknown as ScreenMark;
  const [own] = markNodes(ui, [mark('gull-cove-outpost')], () => undefined);
  const [other] = markNodes(ui, [mark('far-rocks-outpost')], () => undefined);
  const stars = (node?: Node) => (node?.children ?? []).filter((child) => !!child && child.picture?.key.includes('★'));
  assert.equal(stars(own).length, 1, 'a star over its own');
  assert.equal(stars(other).length, 0, 'none over another guild’s');
  assert.match(own?.label ?? '', /your guild's outpost/);
  assert.doesNotMatch(other?.label ?? '', /your guild/);
});
