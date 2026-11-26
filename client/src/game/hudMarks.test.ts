import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Node, Picture } from '../ui/node.ts';
import type { Interface } from '../ui/ui.ts';
import type { AccountLink } from '../network/accounts.ts';
import { hexOf } from './guild/bannerLaw.ts';
import { keepGuild } from './guild/guildHeld.ts';
import { markNodes, type ScreenMark } from './hudMarks.ts';

/** What a picture's drawing does on a context that only notes it. */
function drawnBy(picture: Picture, texels = 64): string[] {
  const calls: string[] = [];
  const context = new Proxy({} as Record<string, unknown>, {
    get:
      (_held, name: string) =>
      (...args: unknown[]) => {
        calls.push(`${name}(${args.map(String).join(',')})`);
        // A gradient asked for takes its stops, and they are noted too.
        return { addColorStop: (...stop: unknown[]) => calls.push(`addColorStop(${stop.map(String).join(',')})`) };
      },
    set: (_held, name: string, value: unknown) => (calls.push(`${name}=${String(value)}`), true),
  }) as unknown as OffscreenCanvasRenderingContext2D;
  const source = picture.source as { draw: (context: OffscreenCanvasRenderingContext2D, w: number, h: number) => void };
  source.draw(context, texels, texels);
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
  await keepGuild({
    guild: () => Promise.resolve({ guild: { key: '0a1b2c3d4e5f60718293a4b5c6d7e8f9', rank: 2, banner: full } }),
    outposts: () => Promise.resolve({ outposts: [{ site: 'gull-cove-outpost' }] }),
  } as unknown as AccountLink);
  await Promise.resolve();
  const ui = { clicked: () => false, hovered: () => false, focusOn: () => undefined } as unknown as Interface;
  const mark = (id: string, named = false) =>
    ({
      named,
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
  const [ownNamed] = markNodes(ui, [mark('gull-cove-outpost', true)], () => undefined);
  const [other] = markNodes(ui, [mark('far-rocks-outpost')], () => undefined);
  const stars = (node?: Node) => (node?.children ?? []).filter((child) => !!child && child.picture?.key.includes('★'));
  assert.equal(stars(own).length, 1, 'a star over its own');
  assert.equal(stars(other).length, 0, 'none over another guild’s');
  assert.match(own?.label ?? '', /your guild's outpost/);
  assert.doesNotMatch(other?.label ?? '', /your guild/);
  const named = (node?: Node) => (node?.children ?? []).map((child) => (child && child.text?.words) ?? '').join('|');
  const drawn = (node?: Node) => drawnBy(node?.picture as Picture);
  const strokes = (calls: string[]) => calls.filter((call) => call.startsWith('stroke')).length;
  assert.ok(strokes(drawn(own)) > strokes(drawn(other)), 'its ring and glyph edged in light, to read on any cloth');
  // A flag drawn, not the face's flag glyph (which reads as a "P" at a mark's size), its cloth filled in the
  // banner's cloth with a band of its device's colour.
  const calls = drawn(own);
  assert.ok(!calls.some((call) => call.startsWith('fillText(')), 'no text glyph');
  const filled = (colour: string) =>
    calls.some((call, index) => call === `fillStyle=${colour}` && calls[index + 1]?.startsWith('fillRect('));
  assert.ok(filled(hexOf('navy')) && filled(hexOf('gold')), 'its cloth and its device in their colours');
  assert.match(named(ownNamed), /Your guild's outpost · raised/, 'its note says it is the guild’s own');
});

test("the Playlist's mark is its shield drawn, its ticks turning and a ring spreading from it; still under reduced motion", () => {
  const ui = (seconds: number) =>
    ({
      clicked: () => false,
      hovered: () => false,
      focusOn: () => undefined,
      age: () => seconds,
    }) as unknown as Interface;
  const mark = {
    ...{ id: 'overlook-playlist', kind: 'playlist', name: 'Playlist', note: '1.2 km', x: 100, y: 100, sizePx: 40 },
    ...{ locked: false, chosen: false, named: false, arrowDegrees: null },
  } as unknown as ScreenMark;
  const laidAt = (seconds: number) => markNodes(ui(seconds), [mark], () => undefined);
  const ringAt = (seconds: number) => laidAt(seconds).find((node) => node.id === 'mark:overlook-playlist');
  // Its dial over its ring, its spreading ring laid on the screen beside it.
  const child = (seconds: number, key: string) =>
    laidAt(seconds)
      .flatMap((node) => [node, ...(node.children ?? [])])
      .find((each) => !!each && each.picture?.key.startsWith(key)) || undefined;
  const calls = drawnBy(ringAt(1)?.picture as Picture);
  assert.ok(
    calls.some((call) => call.startsWith('quadraticCurveTo(')),
    'its shield',
  );
  assert.ok(!calls.some((call) => call.startsWith('fillText(')), 'no glyph');
  assert.ok((child(1, 'mark dial')?.picture?.turn ?? 0) < (child(2, 'mark dial')?.picture?.turn ?? 0), 'turning');
  assert.ok(Number(child(1.5, 'mark ripple')?.width) > Number(child(0.5, 'mark ripple')?.width), 'spreading');
  Object.assign(globalThis, { matchMedia: () => ({ matches: true }) });
  try {
    assert.equal(child(2, 'mark dial')?.picture?.turn, 0, 'its ticks still');
    assert.equal(child(1.5, 'mark ripple'), undefined, 'no ring');
  } finally {
    Reflect.deleteProperty(globalThis, 'matchMedia');
  }
});

test("the Playlist's mark's ticks and ring stay over a pixel wide at its smallest, so turning they never blink", () => {
  const ui = {
    clicked: () => false,
    hovered: () => false,
    focusOn: () => undefined,
    age: () => 1,
  } as unknown as Interface;
  const mark = {
    ...{ id: 'far-playlist', kind: 'playlist', name: 'Playlist', note: '9 km', x: 0, y: 0, sizePx: 20 },
    ...{ locked: false, chosen: false, named: false, arrowDegrees: null },
  } as unknown as ScreenMark;
  const nodes = markNodes(ui, [mark], () => undefined).flatMap((node) => [node, ...(node.children ?? [])]);
  for (const key of ['mark dial', 'mark ripple']) {
    const picture = nodes.find((node) => !!node && node.picture?.key.startsWith(key))?.picture;
    assert.ok(picture, key);
    // Drawn at its own texels, which stand over the mark's 20 pixels.
    const texels = picture.pixel?.width ?? 0;
    const widths = drawnBy(picture, texels).flatMap((call) =>
      call.startsWith('lineWidth=') ? [Number(call.slice(10))] : [],
    );
    assert.ok(
      widths.length > 0 && Math.min(...widths) / (texels / 20) >= 1.2,
      `${key}: ${widths.join(', ')} of ${texels}`,
    );
  }
});

test("the Playlist's spreading ring lies under every mark's ring; a locked Playlist mark stands still", () => {
  const ui = {
    clicked: () => false,
    hovered: () => false,
    focusOn: () => undefined,
    age: () => 1,
  } as unknown as Interface;
  const mark = (id: string, kind: string, x: number, locked = false) =>
    ({
      ...{ id, kind, name: id, note: '1 km', x, y: 0, sizePx: 48, locked, chosen: false, named: false },
      arrowDegrees: null,
    }) as unknown as ScreenMark;
  const laid = markNodes(
    ui,
    [mark('overlook-port', 'port', 0), mark('overlook-playlist', 'playlist', 52)],
    () => undefined,
  );
  const ripple = laid.findIndex((node) => node.picture?.key.startsWith('mark ripple'));
  const rings = laid.flatMap((node, place) => (node.id?.startsWith('mark:') ? [place] : []));
  assert.ok(ripple >= 0 && rings.length === 2 && ripple < Math.min(...rings), 'laid before them all');
  const locked = markNodes(ui, [mark('overlook-playlist', 'playlist', 0, true)], () => undefined);
  const keys = locked
    .flatMap((node) => [node, ...(node.children ?? [])])
    .map((node) => (node && node.picture?.key) || '');
  assert.ok(!keys.some((key) => key.startsWith('mark dial') || key.startsWith('mark ripple')));
});
