// Pictures of the passages headless, with nothing else of the game drawn: a zone of the week's web laid by the room
// module as the page lays it and drawn by the game's own drawers onto a texture of its own (above ground the islands'
// layer under a plain sky, under ground the dungeon's renderer in its dark), its pieces over it; the way between zones
// as its camera frames the island, its dots over a plain ground (the island's land is the sea's view's, not drawn
// here); and the passages' panels from fixtures, for `tools/uiShot.mjs`. The game never imports it.
import { REVERSED_DEPTH } from '../../editor/orbit.ts';
import { BUFFER_USAGE, type Gpu, TEXTURE_USAGE } from '../../gpu.ts';
import { ISLE_MANIFEST } from '../../islands/isleManifest.ts';
import { IslesView } from '../../islands/isleView.ts';
import { cityClimate } from '../../city/plan.ts';
import { ShadowMap } from '../../shadow.ts';
import { startPassageDoor } from '../../rules/passageRules.ts';
import type { Node } from '../../ui/node.ts';
import type { Interface } from '../../ui/ui.ts';
import { SAMPLES } from '../../water/waterView.ts';
import { fromEyeMatrix, type Shot } from '../camera.ts';
import { passagePiecesLaid, stylePacks } from '../dungeonDressing.ts';
import { loadStylePack, PASSAGE_PACK } from '../dungeonModules.ts';
import { DungeonView } from '../dungeonView.ts';
import { viewOn } from '../../heldmap/heldMapLaw.ts';
import { paintLand } from '../../heldmap/landLetters.ts';
import { passageSheet } from './passageMap.ts';
import { athericCardNode, athericCards } from './athericBounty.ts';
import { haulNode, lampNode, MouthsCardView, signNode, wayDotsNode } from './passagePanels.ts';
import { pieceMesh, type PieceState } from './passagePieces.ts';
import { PieceView } from './pieceView.ts';
import { RISE_S, DRAW_S, wayAt, wayOf } from './passageWay.ts';
import { floorOf, withPieces, zoneIsle, zoneLayout } from './passageZone.ts';
import { haulView, lampPrompt, mouthsChoice, onwardSign } from './passageWords.ts';

const MAP_READ = 0x1;
const ISLAND = 'continent-1';
const SKY: GPUColor = [0.55, 0.66, 0.78, 1];
const DARK: GPUColor = [0.01, 0.01, 0.015, 1];

async function doorOf() {
  const answer = await fetch('/room.wasm');
  return startPassageDoor(await WebAssembly.compile(await answer.arrayBuffer()));
}

/** The texture's pixels as a PNG's data URL. */
async function readBack(device: GPUDevice, target: GPUTexture): Promise<string> {
  const [width, height] = [target.width, target.height];
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
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

/** Zone `number` of `week`'s web drawn from `shot` (the zone's metres), its pieces as `state` finds them, `width` by
 *  `height` pixels; the first zone of the kind asked when `number` is negative. */
export async function zoneShot(
  week: number,
  kind: 'open' | 'under',
  number: number,
  state: PieceState,
  view: { readonly width: number; readonly height: number },
  eye?: { readonly back: number; readonly up: number; readonly pitch: number },
  /** Where the eye stands, in place of behind the arrival: its point on the ground and the bearing it looks along. */
  stood?: { readonly at: readonly [number, number]; readonly yaw: number },
): Promise<string> {
  const door = await doorOf();
  const web = door.web(ISLAND, week);
  if (!web) throw new Error('no web');
  const zones = web.zones.filter((zone) => zone.ground.kind === kind && door.plan(ISLAND, week, zone.number));
  const zone = number >= 0 ? web.zones.find((each) => each.number === number) : zones[0];
  const plan = zone && door.plan(ISLAND, week, zone.number);
  if (!plan) throw new Error(`no ${kind} zone ${number} laid`);
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('no GPU adapter');
  const device = await adapter.requestDevice();
  const format: GPUTextureFormat = 'rgba8unorm';
  const size = [view.width, view.height];
  const target = device.createTexture({
    size,
    format,
    usage: TEXTURE_USAGE.renderAttachment | TEXTURE_USAGE.copySource,
  });
  const gpu = { device, format, context: { getCurrentTexture: () => target } } as unknown as Gpu;
  const usage = TEXTURE_USAGE.renderAttachment;
  const colour = device.createTexture({ size, format, usage, sampleCount: SAMPLES });
  const depth = device.createTexture({ size, format: REVERSED_DEPTH.format, usage, sampleCount: SAMPLES });
  const heights = door.heights(ISLAND, week, plan.zone.number);
  const floor = floorOf(plan, heights);
  const pieces = new PieceView(gpu);
  // As the game stands them: above ground the kit's modules, only the lights drawn as boxes; under ground the
  // passages' pack's, or boxes while it has not come.
  const pack = kind === 'under' ? await loadStylePack(PASSAGE_PACK) : null;
  if (!pack) pieces.set(pieceMesh(plan.pieces, state, kind === 'open'));
  // Above ground from over the arrival, its back to the rim's rock; under ground from behind it in the way in.
  const { back, up, pitch } =
    eye ?? (kind === 'open' ? { back: -4, up: 14, pitch: 0.45 } : { back: 14, up: 9, pitch: 0.3 });
  const [x, y] = stood?.at ?? plan.sites.arrive;
  const yaw = stood?.yaw ?? plan.sites.facing;
  const [east, south] = [Math.sin(yaw), -Math.cos(yaw)];
  const ground = floor(x, y) ?? 0;
  const shot: Shot = {
    eye: [x - east * back, y - south * back, ground + up],
    yaw,
    pitch,
    fov: 1.1,
    near: 0.1,
    far: 2_000,
  };
  const fromEye = fromEyeMatrix(shot, view.width / view.height);
  const shadow = ShadowMap.none(gpu);
  let draw: (pass: GPURenderPassEncoder) => void;
  if (plan.ground.kind === 'open') {
    if (!heights) throw new Error('an open zone with no heights');
    const isles = new IslesView(gpu, ISLE_MANIFEST, null);
    const shown = zoneIsle(plan, heights);
    if (shown) isles.show([withPieces(shown, plan, state, false)]);
    draw = (pass) => isles.drawInto(pass, fromEye, shot, 0, shadow);
  } else {
    const layout = zoneLayout(plan);
    if (!layout) throw new Error('an under zone with no layout');
    const dungeon = new DungeonView(gpu);
    const climate = cityClimate('woodland');
    const laid = pack && passagePiecesLaid(layout, pack, climate.climate, plan.pieces, state, false);
    dungeon.set(layout, climate, [56, 2], {}, await stylePacks(layout), laid ?? undefined);
    dungeon.setPieces(laid, 'shown');
    draw = (pass) => dungeon.drawInto(pass, fromEye, shot.eye, 0);
  }
  for (let frame = 0; frame < 6; frame++) {
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: colour.createView(),
          resolveTarget: target.createView(),
          clearValue: kind === 'open' ? SKY : DARK,
          loadOp: 'clear',
          storeOp: 'discard',
        },
      ],
      depthStencilAttachment: {
        view: depth.createView(),
        depthClearValue: REVERSED_DEPTH.clearValue,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    });
    draw(pass);
    pieces.drawInto(pass, fromEye, shot);
    pass.end();
    device.queue.submit([encoder.finish()]);
    await device.queue.onSubmittedWorkDone();
    // Room for the kits' packs to come before the next frame.
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  return readBack(device, target);
}

/** The passages' door this module opened, for the interface's pictures, which build without waiting. */
let shownWeb: Awaited<ReturnType<typeof doorOf>> | null = null;
export async function loadDoor(): Promise<void> {
  shownWeb = await doorOf();
}

/** The way between zones while its leg is half drawn, framed over the island: its dots over a plain ground. */
export function wayShot(ui: Interface): Node {
  const web = shownWeb?.web(ISLAND, 2_900);
  if (!web) return {};
  const [from, to] = [web.zones[1], web.zones.find((zone) => zone.number === web.zones[1]?.onward[0])];
  if (!from || !to) return {};
  const view = ui.size;
  const way = wayOf({
    from: { eye: [from.at[0], from.at[1] + 4, 3], look: [from.at[0], from.at[1], 1], fov: 1.1 },
    come: [[from.at[0] + 14_000, from.at[1]], from.at],
    to: to.at,
    framed: web.zones.map((zone) => zone.at),
    arrive: { at: [to.at[0], to.at[1], 0], facing: 0 },
    viewport: view,
  });
  const frame = wayAt(way, RISE_S + DRAW_S / 2);
  return {
    ...wayDotsNode(
      frame,
      view,
      web.zones.map((zone) => zone.at),
    ),
    fill: '#3f4a3a',
  };
}

/** The mouths' choice at the Chalk Adit's door, in a company, the first two lamps lit this week. */
export function mouthsShot(ui: Interface): Node {
  const web = shownWeb?.web(ISLAND, 2_900);
  const choice = web && mouthsChoice(web, 'The Chalk Adit', true, [1, 2]);
  if (!choice) return {};
  const card = new MouthsCardView({ go: () => undefined, close: () => undefined });
  card.show(choice);
  return { width: 'grow', height: 'grow', children: [card.layer(ui)] };
}

/** An onward mouth's sign, the haul with its warning and the lamp's prompt half held, over a plain ground. */
export function panelsShot(ui: Interface): Node {
  const web = shownWeb?.web(ISLAND, 2_900);
  const zone = web?.zones.find((each) => each.currents.length > 1);
  if (!web || !zone) return {};
  const haul = haulView({
    items: [{ name: 'Gorse Hauberk', rarity: 'Rare' }],
    vestiges: 2,
    materials: [{ name: 'Brineglass', count: 3 }],
    lantern: true,
  });
  return {
    width: 'grow',
    height: 'grow',
    children: [
      signNode(onwardSign(zone, true), ui.size),
      haulNode(haul, ui.size),
      { ...lampNode(lampPrompt(false, false), 0.5), float: { to: 'screen', at: [0.5, 1], anchor: [0.5, 1], y: -110 } },
    ],
  };
}

/** The passages' map as the held map paints it on land, over a parchment's colour, three zones in, the first lamp
 *  lit: a PNG's data URL. */
export async function mapShot(width = 1000, height = 700): Promise<string> {
  const web = shownWeb?.web(ISLAND, 2_900);
  if (!web) throw new Error('no web');
  const first = web.zones[0];
  const second = web.zones.find((zone) => zone.number === first?.onward[0]);
  const here = second?.onward[0] ?? 0;
  const { sheet, you } = passageSheet(
    web,
    { here, come: [first?.number ?? 0, second?.number ?? 0], lit: [1] },
    'The passages',
    null,
  );
  const ink = { width, height };
  const view = viewOn(you, ink, { width: sheet.width, height: sheet.height }, sheet.span);
  const inked = new OffscreenCanvas(width, height);
  const painter = inked.getContext('2d') as unknown as Parameters<typeof paintLand>[0];
  paintLand(painter, ink, { x: 0, y: 0 }, 1, {
    sheet,
    view,
    ink,
    scale: 1,
    covers: [],
    table: null,
    player: { at: you, heading: 0 },
  });
  const canvas = new OffscreenCanvas(width, height);
  const page = canvas.getContext('2d');
  if (!page) throw new Error('no 2D canvas');
  page.fillStyle = '#d9c9a3';
  page.fillRect(0, 0, width, height);
  page.drawImage(inked, 0, 0);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

/** Lanternfall's bounty as the Journal's bounties show it, on its third step, 37 of 100 foes down. */
export function athericShot(ui: Interface): Node {
  const [card] = athericCards([{ id: 'lanternfall', step: 2, count: 37, finished: false }]);
  const width = Math.min(320, ui.size.width - 32);
  return {
    width: 'grow',
    height: 'grow',
    padding: 24,
    children: [card ? { width, children: [athericCardNode(card)] } : null],
  };
}
