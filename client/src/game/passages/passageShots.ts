// Pictures of the passages headless, for `tools/uiShot.mjs` (`Passages.md` "Pictures"), each drawn by the game's own
// drawers: a zone of a week's web laid by the room module as the page lays it (above ground the islands' ground,
// modules and plants lit by the sky of the hollow's own climate, under ground the dungeon's scene lit by its torches
// and the pieces' lights), its pieces over it; the way between zones as its camera frames the island, its dots over a
// plain ground; the map; and the passages' panels. The game never imports it.
import { REVERSED_DEPTH } from '../../editor/orbit.ts';
import { BUFFER_USAGE, type Gpu, TEXTURE_USAGE } from '../../gpu.ts';
import { ISLE_MANIFEST } from '../../islands/isleManifest.ts';
import type { IsleShown } from '../../islands/islePlan.ts';
import { GROWTH_ROLES, IslesView } from '../../islands/isleView.ts';
import { cityClimate } from '../../city/plan.ts';
import { ShadowMap } from '../../shadow.ts';
import { startSkyLaw } from '../../sky/skyLaw.ts';
import { SkyDriver } from '../../sky/skyDriver.ts';
import { skyUniformFor } from '../../sky/skyUniform.ts';
import { DAY_S } from '../../sky/worldClock.ts';
import { type PassagePiece, type PassagePlan, type PassageZone, startPassageDoor } from '../../rules/passageRules.ts';
import type { Node } from '../../ui/node.ts';
import type { Interface } from '../../ui/ui.ts';
import { SAMPLES } from '../../water/waterView.ts';
import { fromEyeMatrix, type Shot } from '../camera.ts';
import { passagePieceLights, passagePiecesLaid, stylePacks } from '../dungeonDressing.ts';
import { loadStylePack, PASSAGE_PACK } from '../dungeonModules.ts';
import { runSky } from '../breachLook.ts';
import { DungeonScene } from '../dungeonScene.ts';
import { DungeonView } from '../dungeonView.ts';
import { IslesNature } from '../isleNature.ts';
import { warmFlora } from '../../nature/flora.ts';
import type { Drawer } from '../scene.ts';
import { viewOn } from '../../heldmap/heldMapLaw.ts';
import { paintLand } from '../../heldmap/landLetters.ts';
import { passageSheet } from './passageMap.ts';
import { athericCardNode, athericCards } from './athericBounty.ts';
import { haulNode, lampNode, MouthsCardView, signNode, wayDotsNode } from './passagePanels.ts';
import { boxedPieces, pieceMesh, type PieceState, UNTOUCHED } from './passagePieces.ts';
import { PieceView } from './pieceView.ts';
import { RISE_S, DRAW_S, wayAt, wayOf } from './passageWay.ts';
import { AIM, cameraOrbit } from '../../player/playerCamera.ts';
import { MODULE_NAMES } from '../../islands/isleModules.ts';
import { floorOf, withPieces, zoneIsle, zoneLayout } from './passageZone.ts';
import { haulView, lampPrompt, mouthsChoice, onwardSign } from './passageWords.ts';

const MAP_READ = 0x1;
const ISLAND = 'continent-1';
/** The island's climate (content/world/layout.json), which the game dresses and lights its zones by. */
const CLIMATE = 'temperate-coast';
/** Behind a hollow, where the game draws its sky's dome with the water's backdrop. */
const SKY: GPUColor = [0.55, 0.66, 0.78, 1];

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

/** A zone of a week's web drawn as the game draws it, from the eye `asked` stands, as a PNG's data URL. */
export async function zoneShot(asked: ZoneAsked): Promise<string> {
  const { week, state = UNTOUCHED, done = false } = asked;
  const view = asked.view ?? { width: 1280, height: 720 };
  const door = await doorOf();
  const web = door.web(ISLAND, week);
  if (!web) throw new Error(`no web in week ${week}`);
  const ground = (zone: PassageZone) => (zone.ground.kind === 'open' ? zone.ground.form : zone.ground.style);
  const zone = web.zones.find((each) =>
    asked.number !== undefined
      ? each.number === asked.number
      : (!asked.ground || ground(each) === asked.ground) &&
        (!asked.size || each.size === asked.size) &&
        door.plan(ISLAND, week, each.number) !== null,
  );
  const plan = zone && door.plan(ISLAND, week, zone.number);
  if (!plan) throw new Error(`no zone laid in week ${week} as asked: ${JSON.stringify(asked)}`);
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('no GPU adapter');
  const device = await adapter.requestDevice();
  const format: GPUTextureFormat = 'rgba8unorm';
  const target = device.createTexture({
    size: [view.width, view.height],
    format,
    usage: TEXTURE_USAGE.renderAttachment | TEXTURE_USAGE.copySource,
  });
  const gpu = { device, format, context: { getCurrentTexture: () => target } } as unknown as Gpu;
  const heights = door.heights(ISLAND, week, plan.zone.number);
  const shot = zoneEye(plan, floorOf(plan, heights), asked);
  const pieces = new PieceView(gpu);
  if (plan.ground.kind === 'open') {
    if (!heights) throw new Error('an open zone with no heights');
    const shown = zoneIsle(plan, heights);
    if (!shown) throw new Error('an open zone with no hollow');
    await hollowFrames(
      gpu,
      withPieces(shown, plan, state, done),
      shot,
      { at: plan.zone.at, hour: asked.hour ?? 11 },
      (isles) => {
        // Each piece's boxes only while the islands' passage pack does not hold it, as the game stands them.
        const boxes = boxedPieces(plan.pieces, state, done, (module) => isles.hasModule('passage', module));
        if (boxes.length > 0) pieces.set(pieceMesh(boxes, state));
        else pieces.clear();
        return pieces;
      },
    );
  } else {
    const layout = zoneLayout(plan);
    if (!layout) throw new Error('an under zone with no layout');
    const pack = await loadStylePack(PASSAGE_PACK);
    const dungeon = new DungeonView(gpu);
    const climate = cityClimate(CLIMATE);
    const laid = pack && passagePiecesLaid(layout, pack, climate.climate, plan.pieces, state, done);
    dungeon.set(layout, climate, [56, 2], {}, await stylePacks(layout), laid ?? undefined);
    dungeon.setPieces(laid, 'shown', pack ? passagePieceLights(plan.pieces, state) : []);
    const boxes = boxedPieces(plan.pieces, state, done, (module) => pack?.modules.has(module) ?? false);
    if (boxes.length > 0) pieces.set(pieceMesh(boxes, state));
    const scene = new DungeonScene(gpu);
    const drawers: Drawer[] = [
      { drawInto: (pass, fromEye, eyed, time) => dungeon.drawInto(pass, fromEye, eyed.eye, time) },
      { drawInto: (pass, fromEye, eyed) => pieces.drawInto(pass, fromEye, eyed) },
    ];
    for (let frame = 0; frame < 3; frame++) {
      // Under ground the sky only says so, with no dark to fade into, as the game's dungeon frame has it.
      scene.draw(shot, view, 0, drawers, { look: { ...runSky(0), darkM: 0 }, lamps: [] });
      await device.queue.onSubmittedWorkDone();
      // Room for the dungeon's pictures to be painted before the next frame.
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
  const picture = await readBack(device, target);
  // A device let go, so the software GPU keeps room for the next picture's.
  device.destroy();
  return picture;
}

/** What a zone's picture asks: the week, and the zone by its `number`, else the first laid of its `ground` (a form
 *  above ground, a style under) and `size`; its pieces as `state` and `done` find them; `width` by `height` pixels;
 *  the eye behind the arrival (`eye`, metres back and up and its pitch down), over the zone (`above`) or `distance`
 *  from the first piece of a kind (`aim`), and above ground the world's hour. */
export interface ZoneAsked {
  readonly week: number;
  readonly number?: number;
  readonly ground?: string;
  readonly size?: PassageZone['size'];
  readonly state?: PieceState;
  readonly done?: boolean;
  readonly view?: { readonly width: number; readonly height: number };
  readonly eye?: { readonly back: number; readonly up: number; readonly pitch: number };
  readonly above?: boolean;
  readonly aim?: { readonly kind: PassagePiece['kind']; readonly distance: number; readonly up: number };
  /** The game's own camera behind a body standing at the arrival (under ground, where no `eye` is asked, always), or
   *  above ground `back` metres (3 unless said) short of the placement nearest it whose module begins `near` (a
   *  strand's wreck), facing it. */
  readonly own?: { readonly near?: string; readonly back?: number };
  readonly hour?: number;
}

/** The game's own third-person camera (`cameraOrbit`, as the foot's view stands at its start) behind a body at the
 *  arrival, or above ground `back` m short of the placement nearest it whose module begins `near`, facing it: its boom
 *  kept off the hollow's ground and its dressing's and the pieces' blocks (under ground, the way in's leaf) as the
 *  foot's is. */
function ownEye(plan: PassagePlan, floor: (x: number, y: number) => number | null, near?: string, back = 3): Shot {
  const ground = plan.ground.kind === 'open' ? plan.ground : null;
  if (near && !ground) throw new Error('a placement is pictured above ground');
  let [[x, y], yaw] = [plan.sites.arrive, plan.sites.facing];
  const placed = near ? (ground?.placements ?? []).filter((one) => MODULE_NAMES[one[0]]?.startsWith(near)) : [];
  const nearest = placed.sort((one, two) => Math.hypot(one[1] - x, one[2] - y) - Math.hypot(two[1] - x, two[2] - y))[0];
  if (near && !nearest) throw new Error(`zone ${plan.zone.number} holds no ${near}`);
  if (nearest) {
    const away = Math.hypot(x - nearest[1], y - nearest[2]) || 1;
    [x, y] = [nearest[1] + ((x - nearest[1]) / away) * back, nearest[2] + ((y - nearest[2]) / away) * back];
    yaw = Math.atan2(nearest[1] - x, -(nearest[2] - y));
  }
  const blocks = [...(ground?.blocks ?? []), ...plan.solids].map(([minX, minY, maxX, maxY, top]) => ({
    ...{ minX, minY, maxX, maxY, top },
    bottom: -1_000,
  }));
  const head = [x, y, (floor(x, y) ?? 0) + STANDING_EYE_M] as const;
  const view = { firstPerson: false, distance: 4.5, shown: 4.5 };
  const orbit = cameraOrbit(head, yaw, START_PITCH, view, blocks, 0, AIM, floor);
  const forward = [
    Math.cos(orbit.pitch) * Math.sin(yaw),
    -Math.cos(orbit.pitch) * Math.cos(yaw),
    -Math.sin(orbit.pitch),
  ];
  const eye: [number, number, number] = [
    orbit.targetX - (forward[0] ?? 0),
    orbit.targetY - (forward[1] ?? 0),
    orbit.targetZ - (forward[2] ?? 0),
  ];
  return { eye, yaw, pitch: orbit.pitch, fov: 1.1, near: 0.1, far: 2_000 };
}

/** A standing body's eye over its feet (crates/movement `TUNING.eye`), and the foot's view's pitch as it starts. */
const STANDING_EYE_M = 1.7;
const START_PITCH = 0.1;

/** The eye a zone's picture is drawn from, as `asked` stands it. */
function zoneEye(plan: PassagePlan, floor: (x: number, y: number) => number | null, asked: ZoneAsked): Shot {
  if (asked.own) return ownEye(plan, floor, asked.own.near, asked.own.back);
  const lens = { fov: 1.1, near: 0.1, far: 2_000 };
  const piece = asked.aim && plan.pieces.find((each) => each.kind === asked.aim?.kind);
  if (asked.aim && !piece) throw new Error(`zone ${plan.zone.number} has no ${asked.aim.kind}`);
  if (piece && asked.aim) {
    // In front of the piece looking back at it: a lamp from the arrival's side, as a body comes to it between two of
    // its stones; any other along its facing.
    const [arriveX, arriveY] = plan.sites.arrive;
    const toArrival = Math.atan2(arriveX - piece.at[0], -(arriveY - piece.at[1]));
    const facing = piece.kind === 'lamp' ? toArrival : piece.facing;
    const [east, south] = [Math.sin(facing), -Math.cos(facing)];
    const [x, y] = [piece.at[0] + east * asked.aim.distance, piece.at[1] + south * asked.aim.distance];
    const eye: [number, number, number] = [x, y, (floor(x, y) ?? piece.at[2]) + asked.aim.up];
    const pitch = Math.atan2(eye[2] - piece.at[2] - 1.2, asked.aim.distance);
    return { eye, yaw: facing + Math.PI, pitch, ...lens };
  }
  const yaw = plan.sites.facing;
  if (asked.above) {
    const reach = plan.ground.kind === 'open' ? Math.max(...plan.ground.ring.map(([x, y]) => Math.hypot(x, y))) : 40;
    const back = reach * 0.9;
    const [x, y] = [-Math.sin(yaw) * back, Math.cos(yaw) * back];
    return { eye: [x, y, (floor(0, 0) ?? 0) + reach * 1.3], yaw, pitch: 0.95, ...lens };
  }
  // Under ground the arrival stands by the way in's wall: the game's own camera, kept off its leaf, stands there.
  if (!asked.eye && plan.ground.kind !== 'open') return ownEye(plan, floor);
  const { back, up, pitch } = asked.eye ?? { back: 2, up: 1.8, pitch: 0.05 };
  const [x, y] = plan.sites.arrive;
  const [east, south] = [Math.sin(yaw), -Math.cos(yaw)];
  return { eye: [x - east * back, y - south * back, (floor(x, y) ?? 0) + up], yaw, pitch, ...lens };
}

/** A hollow drawn as the game draws one: the islands' ground and modules and the land's own plants, lit and shadowed
 *  by the sky of its own climate over where it lies in the world (`at`) at the world's `hour`, under no sea; `pieces`
 *  answers what draws over it each frame. */
async function hollowFrames(
  gpu: Gpu,
  shown: IsleShown,
  shot: Shot,
  { at, hour }: { readonly at: readonly [number, number]; readonly hour: number },
  pieces: (isles: IslesView) => PieceView,
): Promise<void> {
  const { device } = gpu;
  const law = fetch('/land.wasm')
    .then((answer) => answer.arrayBuffer())
    .then(startSkyLaw);
  const sky = new SkyDriver(law, skyUniformFor(device), { seconds: () => (hour / 24) * DAY_S });
  await law;
  const isles = new IslesView(gpu, ISLE_MANIFEST, null, undefined, GROWTH_ROLES);
  const nature = new IslesNature(gpu);
  isles.show([shown]);
  nature.show([shown]);
  // The kits' packs and the plants' flora fetched first, as the game warms them before a place is shown.
  await Promise.all([isles.warm(shown), warmFlora(shown.climate)]);
  const shadow = new ShadowMap(gpu);
  const { width, height } = gpu.context.getCurrentTexture();
  const usage = TEXTURE_USAGE.renderAttachment;
  const colour = device.createTexture({ size: [width, height], format: gpu.format, usage, sampleCount: SAMPLES });
  const depth = device.createTexture({
    size: [width, height],
    format: REVERSED_DEPTH.format,
    usage,
    sampleCount: SAMPLES,
  });
  const ground = isles.groundAt(shot.eye[0], shot.eye[1]) ?? 0;
  for (let frame = 0; frame < 6; frame++) {
    // A matrix of each frame's own, as the game's: the plants keep their tiles once a frame, known by it.
    const fromEye = fromEyeMatrix(shot, width / height);
    const { look } = sky.frame([shot.eye[0] + at[0], shot.eye[1] + at[1], shot.eye[2]], shown.climate, [], ground);
    isles.show([shown]);
    const encoder = device.createCommandEncoder();
    shadow.update(shot.eye, shot.yaw, Math.max(1, shot.eye[2] - ground), look.key);
    shadow.cast(encoder, (cast) => {
      isles.castInto(cast, fromEye, shot, 0, shadow);
      nature.castInto(cast, fromEye, shot, 0, shadow);
    });
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: colour.createView(),
          resolveTarget: gpu.context.getCurrentTexture().createView(),
          clearValue: SKY,
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
    isles.drawInto(pass, fromEye, shot, 0, shadow);
    nature.drawInto(pass, fromEye, shot, 0, shadow);
    pieces(isles).drawInto(pass, fromEye, shot);
    pass.end();
    device.queue.submit([encoder.finish()]);
    await device.queue.onSubmittedWorkDone();
    // Room for the kits' packs and the plants' forms to come before the next frame.
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}

/** The passages' door this module opened, for the interface's pictures, which build without waiting; and the moment
 *  of the way between zones its picture shows (seconds from its start). */
let shownWeb: Awaited<ReturnType<typeof doorOf>> | null = null;
let wayS = RISE_S + DRAW_S / 2;
export async function loadDoor(wayAtS = RISE_S + DRAW_S / 2): Promise<void> {
  shownWeb = await doorOf();
  wayS = wayAtS;
}

/** The way between zones at the moment `loadDoor` was given (its leg half drawn unless said), framed over the
 *  island: its dots over a plain ground. */
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
    open: true,
    viewport: view,
  });
  const frame = wayAt(way, wayS);
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
      // A Gauntlet's far mouth, its zone beyond on the public way.
      signNode(onwardSign({ ...zone, public: true }, true, null, [], true), ui.size),
      haulNode(haul, ui.size),
      // The fourth lamp, cold for one on Lanternfall's last step.
      {
        ...lampNode(lampPrompt(false, false, true), 0.5),
        float: { to: 'screen', at: [0.5, 1], anchor: [0.5, 1], y: -110 },
      },
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
