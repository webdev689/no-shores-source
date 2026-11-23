import type { CityPainter } from '../city/painter.ts';
import { Atmosphere, drawsNothing } from '../cinema/atmosphere.ts';
import { CLEAR, swellGained, type Weather } from '../cinema/weather.ts';
import { LightLayer } from '../combat/lightLayer.ts';
import { type Gpu, TEXTURE_USAGE } from '../gpu.ts';
import { perfZone, PERF, timedEncoder } from '../perfMeter.ts';
import { motionReduced } from '../plus/kit.ts';
import { ShadowMap } from '../shadow.ts';
import { BoltView } from '../sky/bolts.ts';
import { FallView } from '../sky/fall.ts';
import { CITY_LAMPS, EVENT_LAMPS, type LampPlace, carriedLight, lampsRound } from '../sky/lamps.ts';
import { SKY_NOW, SkyDriver } from '../sky/skyDriver.ts';
import { startSkyLaw } from '../sky/skyLaw.ts';
import { type SkyLook, skyUniformFor } from '../sky/skyUniform.ts';
import { cloudBaseOf } from '../overworld/overworldCamera.ts';
import { CLOSE_RANGE_M, closeUpData, groundUnder, PATCH_SAMPLES, PATCH_STEP_M, REFRESH_M } from '../editor/closeUp.ts';
import type { GroundPatch, LandView, Swell } from '../rules/landRules.ts';
import { clipmapLevels, finestSpacing } from '../terrain/clipmap.ts';
import type { CloseGround } from '../terrain/landClient.ts';
import type { GroundPaint } from '../terrain/groundColour.ts';
import { type TerrainData, TerrainView } from '../terrain/terrainView.ts';
import type { HullMask } from '../water/hullMask.ts';
import { waterUnder } from '../water/shore.ts';
import { dropPatchWater, type PatchWater, SAMPLES, WaterView } from '../water/waterView.ts';
import { frameOf, fromEyeMatrix, type Shot } from './camera.ts';
import { BlurView } from './blur.ts';
import { DepthCopy } from './depthCopy.ts';
import { DrainView } from './drain.ts';
import { groundTiles } from './groundTiles.ts';
import { sceneScale, sceneSize } from './renderScale.ts';
import { Upscale } from './upscale.ts';

/** Anything else drawn with the land, into the same pass: a city, its nature, the figures. Its points are measured
 *  from the eye, which it is handed in world metres. One that casts shadows draws them first, into the sun's map
 *  (`castInto`), and every one is handed the map to receive them; one may draw again over the water (`overWater`), and
 *  what gives light draws it into the light layer (`lightInto`). */
export interface Drawer {
  drawInto(pass: GPURenderPassEncoder, fromEye: Float32Array, shot: Shot, time: number, shadow: ShadowMap): void;
  castInto?(pass: GPURenderPassEncoder, fromEye: Float32Array, shot: Shot, time: number, shadow: ShadowMap): void;
  /** Called once a frame before anything is recorded, for work that replaces what the frame draws with (a texture,
   *  a bind group): done mid-frame it would swap them under passes already recorded. */
  prepare?(shot: Shot): void;
  /** Draws over the finished picture `target`, after the water, tested against the scene's `depth` (one float a pixel,
   *  reversed) by hand: what is seen through and must not be covered by the water laid over the land. */
  overWater?(encoder: GPUCommandEncoder, target: GPUTextureView, fromEye: Float32Array, depth: GPUTexture): void;
  /** Draws its light into the light layer's pass (`LightLayer.encode`), after the water and under the hands; the
   *  scene's `depth` (one float a pixel, reversed) is there for a light that lights only what stands near it. */
  lightInto?(pass: GPURenderPassEncoder, fromEye: Float32Array, depth: GPUTexture): void;
}

/** Where the exact ground round a point comes from: the land worker's sampler. */
export type CloseSource = (left: number, top: number, step: number, size: number) => Promise<CloseGround>;

interface CloseUp {
  readonly ground: CloseGround;
  readonly water: PatchWater;
  readonly centre: readonly [number, number];
}

/** The middle ground's samples a side and their spacing, 8 km square every 16 m, and how far the eye moves before
 *  it is sampled again, metres: enough to show the patrol areas' canyons as far as their pieces are drawn. */
const MIDDLE_SAMPLES = 513;
const MIDDLE_STEP_M = 16;
const MIDDLE_REFRESH_M = 1500;

/**
 * One landmass drawn for the game: its 1 km land in rings round the eye, the exact ground round the player, the
 * drawers handed in, then the water's sky, haze and surface over all of it. The land is drawn in its window's metres,
 * as the terrain and the water read it; everything else is handed world metres.
 */
/** What an overlay drawn over the finished picture is drawn in: the picture's size and the light at the eye. */
export interface Overlay {
  readonly width: number;
  readonly height: number;
  readonly light: readonly [number, number, number];
}

/** The light on a cloud flown through, as the sky lights its own: its top stands high in the sun's full light while
 *  the sun is up, white with a cast of the key's colour (a peach one at first light), fading as the sun sinks under
 *  the horizon, its shade the horizon's colour. A clear afternoon's is about the day's white. */
function cloudLight(look: SkyLook): readonly [number, number, number] {
  const brightest = Math.max(...look.keyLight, 1e-6);
  const lit = Math.min(1, Math.max(0, (look.sun[2] + 0.1) / 0.15));
  return [0, 1, 2].map(
    (part) => lit * (0.55 + (0.4 * (look.keyLight[part] ?? 0)) / brightest) + 0.15 * (look.horizon[part] ?? 0),
  ) as unknown as readonly [number, number, number];
}

export class GameScene {
  readonly gpu: Gpu;
  private readonly water: WaterView;
  private readonly shadow: ShadowMap;
  private readonly copy: DepthCopy;
  private readonly drain: DrainView;
  private readonly blur: BlurView;
  private readonly light: LightLayer;
  private readonly atmosphere: Atmosphere;
  private readonly upscale: Upscale;
  /** What the story's sky and sea are doing, read each frame: the water drawn on its gained swell, its weather laid
   *  over the finished picture before the first person's hands. Clear draws the picture exactly as without it. */
  weather: Weather = CLEAR;
  /** The sky over the eye, read from the sky's law each frame. */
  readonly sky: SkyDriver;
  /** Lamps a story lays besides the city's while it shows them: the wreck's fires. */
  lamps: readonly LampPlace[] = [];
  /** The city's, the events' and the scene's own lamps together, written afresh each frame into one list. */
  private readonly joined: LampPlace[] = [];
  private readonly fall: FallView;
  private readonly bolts: BoltView;
  private terrain: { view: LandView; drawn: TerrainView; tiles: CityPainter } | null = null;
  private close: CloseUp | null = null;
  /** Where the middle ground was last sampled round, and whether a sampling is on its way. */
  private middle: { readonly centre: readonly [number, number]; pending: boolean } | null = null;
  private shownClose: CloseUp | null = null;
  private pending = false;
  /** The scene's targets at the size it draws at, and the picture it draws into when that is not the canvas's. */
  private targets: {
    colour: GPUTexture;
    depth: GPUTexture;
    multisampled: GPUTexture;
    multidepth: GPUTexture;
    picture: GPUTexture | null;
  } | null = null;

  constructor(gpu: Gpu) {
    this.gpu = gpu;
    this.water = new WaterView(gpu);
    this.shadow = new ShadowMap(gpu);
    this.light = new LightLayer(gpu, 'float');
    this.atmosphere = new Atmosphere(gpu);
    const law = fetch(`${import.meta.env.BASE_URL}land.wasm`)
      .then((answer) => (answer.ok ? answer.arrayBuffer() : Promise.reject(new Error(`land.wasm: ${answer.status}`))))
      .then(startSkyLaw);
    this.sky = new SkyDriver(law, skyUniformFor(gpu.device));
    this.fall = new FallView(gpu);
    this.bolts = new BoltView(gpu);
    this.copy = new DepthCopy(gpu);
    this.drain = new DrainView(gpu);
    this.blur = new BlurView(gpu);
    this.upscale = new Upscale(gpu);
  }

  /** Draws this landmass from now on, wearing its biome's ground tiles. */
  setLand(view: LandView, data: TerrainData, biome: string | null): void {
    this.terrain?.drawn.destroy();
    this.terrain?.tiles.destroy();
    const [drawn, tiles] = [new TerrainView(this.gpu, data), groundTiles(this.gpu, biome)];
    drawn.wearTiles(tiles.view);
    this.terrain = { view, drawn, tiles };
    this.middle = null;
    dropPatchWater(this.close?.water ?? null);
    [this.close, this.shownClose] = [null, null];
  }

  /** Draws what the layouts lay on the land, as painted, or nothing painted. */
  paintGround(paint: GroundPaint | null): void {
    this.terrain?.drawn.paintGround(paint);
  }

  get land(): LandView | null {
    return this.terrain?.view ?? null;
  }

  /** The ground's height at a world point: exact within the close-up, the 1 km land's elsewhere, 0 off the window. */
  groundAt(x: number, y: number): number | null {
    const view = this.terrain?.view;
    if (!view) return null;
    const close = this.close?.ground.patch;
    const exact = close ? groundUnder(close, x, y) : null;
    if (exact !== null) return exact;
    const [column, row] = [(x - view.leftM) / view.cellM - 0.5, (y - view.topM) / view.cellM - 0.5];
    const [left, top] = [Math.floor(column), Math.floor(row)];
    if (left < 0 || top < 0 || left >= view.width - 1 || top >= view.height - 1) return null;
    const cell = (east: number, south: number) => view.heights[(top + south) * view.width + left + east] ?? 0;
    const [across, down] = [column - left, row - top];
    const upper = cell(0, 0) + (cell(1, 0) - cell(0, 0)) * across;
    const lower = cell(0, 1) + (cell(1, 1) - cell(0, 1)) * across;
    return upper + (lower - upper) * down;
  }

  /** Keeps the exact ground round a world point, sampled again once the point moves 400 m. */
  keepClose(focus: readonly [number, number], source: CloseSource, redraw: () => void): void {
    const view = this.terrain?.view;
    if (!view || this.pending) return;
    if (this.close && Math.hypot(focus[0] - this.close.centre[0], focus[1] - this.close.centre[1]) < REFRESH_M) return;
    this.pending = true;
    const half = ((PATCH_SAMPLES - 1) * PATCH_STEP_M) / 2;
    // The land's door samples in world metres, as the patch and the shore's field keep them.
    const [left, top] = [Math.round(focus[0] - half), Math.round(focus[1] - half)];
    source(left, top, PATCH_STEP_M, PATCH_SAMPLES)
      .then((ground) => {
        this.pending = false;
        if (this.terrain?.view !== view) return;
        dropPatchWater(this.close?.water ?? null);
        this.close = { ground, water: this.water.patchWater(ground.field, [view.leftM, view.topM]), centre: focus };
        redraw();
      })
      .catch(() => {
        this.pending = false;
      });
  }

  /** Keeps the middle ground round a world point (the terrain's showMiddle), sampled again once it moves 1.5 km. */
  keepMiddle(focus: readonly [number, number], source: CloseSource): void {
    const terrain = this.terrain;
    if (!terrain || this.middle?.pending) return;
    const centre = this.middle?.centre;
    if (centre && Math.hypot(focus[0] - centre[0], focus[1] - centre[1]) < MIDDLE_REFRESH_M) return;
    const asked = { centre: [focus[0], focus[1]] as const, pending: true };
    this.middle = asked;
    const half = ((MIDDLE_SAMPLES - 1) * MIDDLE_STEP_M) / 2;
    const [left, top] = [Math.round(focus[0] - half), Math.round(focus[1] - half)];
    source(left, top, MIDDLE_STEP_M, MIDDLE_SAMPLES)
      .then(({ patch }) => {
        asked.pending = false;
        if (this.terrain !== terrain) return;
        const corner = [left - terrain.view.leftM, top - terrain.view.topM] as const;
        terrain.drawn.showMiddle({ corner, step: MIDDLE_STEP_M, size: MIDDLE_SAMPLES, heights: patch.heights });
      })
      .catch(() => {
        // Asked again on the next frame, unless a newer land asked its own since.
        if (this.middle === asked) this.middle = null;
      });
  }

  /** The exact ground round the player as last sampled, or null before any. */
  closePatch(): GroundPatch | null {
    return this.close?.ground.patch ?? null;
  }

  /** Whether the exact ground round a world point has come, and the middle ground round it. */
  closeReady(x: number, y: number): boolean {
    const centre = this.close?.centre;
    const middle = this.middle && !this.middle.pending;
    return !!centre && !!middle && Math.hypot(x - centre[0], y - centre[1]) < REFRESH_M;
  }

  /** The water at a world point now, on the swell as drawn: its surface over the sea or a lake or river, or null on
   *  dry ground. */
  waterAt(x: number, y: number, time: number): { surface: number; fresh: boolean } | null {
    const view = this.terrain?.view;
    const field = this.close?.ground.field;
    if (view && field) {
      const water = waterUnder(field, this.drawnSwell(view), { x, y }, time);
      if (water) return water.kind === 'dry' ? null : { surface: water.surface, fresh: water.kind === 'fresh' };
    }
    return (this.groundAt(x, y) ?? 0) < 0 ? { surface: 0, fresh: false } : null;
  }

  /** Presses the water's ripples at a world point, at their next step. */
  stir(stir: { readonly x: number; readonly y: number; readonly radiusM: number; readonly strength: number }): void {
    const view = this.terrain?.view;
    if (view) this.water.stir(stir.x - view.leftM, stir.y - view.topM, stir.radiusM, stir.strength);
  }

  /** Draws one frame from `shot` into the canvas, at the resolution chosen (`renderScale.ts`) and stretched over it,
   *  with the drawers drawn with the land; `after` may draw over the finished picture at the canvas's own size (the
   *  first person's hands) before it is shown, `hulls` are the ships on the water (world metres), which it keeps out
   *  of and foams round, and the water's ripples follow `focus` (world metres; the eye unless said). The sky is the
   *  weather's over the eye, in the open sea's air `atSea`, else the landmass's. Last, the whole picture blurs by a
   *  deviation of `blur` device pixels, drains toward grey by `drain` and darkens by `dark` (each 0 to 1), under
   *  whatever the interface draws over it. */
  draw(
    shot: Shot,
    size: { width: number; height: number },
    time: number,
    seconds: number,
    drawers: readonly Drawer[],
    more: {
      readonly after?: (encoder: GPUCommandEncoder, view: GPUTextureView, over: Overlay) => void;
      readonly hulls?: readonly HullMask[];
      readonly focus?: readonly [number, number];
      /** The swell to draw in place of the land's: the sea by weather. */
      readonly swell?: Swell;
      readonly atSea?: boolean;
      /** What the player's left hand carries (`torch_l`, `lantern`) and where their feet are (world metres): a light
       *  there lights round them. */
      readonly carried?: { readonly left: string | null; readonly feet: readonly [number, number, number] };
      readonly blur?: number;
      readonly drain?: number;
      readonly dark?: number;
    } = {},
  ): void {
    const terrain = this.terrain;
    if (!terrain) return;
    const { view, drawn } = terrain;
    for (const drawer of drawers) drawer.prepare?.(shot);
    const origin = [view.leftM, view.topM] as const;
    const local: Shot = { ...shot, eye: [shot.eye[0] - origin[0], shot.eye[1] - origin[1], shot.eye[2]] };
    const drawnAt = sceneSize(size, sceneScale());
    PERF.current?.scene(drawnAt.width, drawnAt.height, drawnAt.width / size.width);
    const fromEye = fromEyeMatrix(shot, drawnAt.width / drawnAt.height);
    const ground = this.groundAt(shot.eye[0], shot.eye[1]) ?? 0;
    const above = Math.max(1, shot.eye[2] - Math.max(0, ground));
    const near = above < CLOSE_RANGE_M ? this.close : null;
    if (near !== this.shownClose) {
      drawn.showCloseUp(near && closeUpData(near.ground.patch, near.ground.field.levels, view));
      this.shownClose = near;
    }
    const rings = clipmapLevels(local.eye[0], local.eye[1], finestSpacing(above));
    const pixelAngle = (2 * Math.tan(shot.fov / 2)) / drawnAt.height;
    drawn.prepare(
      { fromEye, eye: local.eye, time, rings, far: shot.far, pixelAngle },
      { exaggeration: 1, brush: null },
    );
    const scaled = drawnAt.width !== size.width || drawnAt.height !== size.height;
    const targets = this.targetsOf(drawnAt.width, drawnAt.height, scaled);
    const encoder = timedEncoder(this.gpu.device);
    // The lamps follow the daylight the sky last showed: a frame behind, which no eye can tell.
    const light = carriedLight(more.carried?.left);
    const lamps = lampsRound(
      shot.eye,
      this.lamps.length > 0 || EVENT_LAMPS.current.length > 0 ? this.lampsJoined() : CITY_LAMPS.current,
      light && more.carried ? { light, feet: more.carried.feet } : null,
      SKY_NOW.current.look.daylight,
      time,
    );
    const { look } = this.sky.frame(shot.eye, more.atSea ? 'sea' : (view.climate ?? 'sea'), lamps, ground);
    // The sun's shadows first: what casts draws its depth along the sun into each cascade, for everything after to read.
    this.shadow.update(shot.eye, shot.yaw, above, look.key);
    perfZone('shadows');
    this.shadow.cast(encoder, (cast) => {
      for (const drawer of drawers) drawer.castInto?.(cast, fromEye, shot, time, this.shadow);
    });
    perfZone('main');
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: targets.multisampled.createView(),
          resolveTarget: targets.colour.createView(),
          clearValue: [0, 0, 0, 1],
          loadOp: 'clear',
          storeOp: 'discard',
        },
      ],
      depthStencilAttachment: {
        view: targets.multidepth.createView(),
        depthClearValue: 0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    });
    drawn.drawInto(pass, this.shadow);
    for (const drawer of drawers) drawer.drawInto(pass, fromEye, shot, time, this.shadow);
    pass.end();
    this.copy.encode(encoder, targets.multidepth, targets.depth);
    const camera = frameOf(local);
    const canvas = this.gpu.context.getCurrentTexture();
    const target = (targets.picture ?? canvas).createView();
    const eyeWater = this.waterAt(shot.eye[0], shot.eye[1], time);
    // The weather's fog thickens the haze: their densities add.
    const air = { clearM: 1 / (1 / Math.max(25_000, above * 60) + look.fogDensity), fogDensity: look.fogDensity };
    perfZone('water');
    this.water.encode(encoder, {
      camera: { ...camera, fromEye, tanHalfView: Math.tan(shot.fov / 2) },
      size: [drawnAt.width, drawnAt.height],
      time,
      seconds,
      exaggeration: 1,
      fogM: air.clearM,
      world: [...origin],
      // The sea's own swell, made by its weather, as handed; else the land's, raised by the weather's sea.
      swell: more.swell ?? this.drawnSwell(view),
      coarse: drawn.cells,
      patch: near?.water ?? null,
      eyeWater,
      eyeAboveM: Math.abs(shot.eye[2] - (eyeWater?.surface ?? ground)),
      focus: more.focus ? [more.focus[0] - origin[0], more.focus[1] - origin[1]] : [local.eye[0], local.eye[1]],
      hulls: (more.hulls ?? []).map((hull) => ({ ...hull, x: hull.x - origin[0], y: hull.y - origin[1] })),
      shadow: this.shadow,
      drawn: targets,
      target,
    });
    perfZone('over water');
    for (const drawer of drawers) drawer.overWater?.(encoder, target, fromEye, targets.depth);
    // The weather over all of it: what falls round the eye, and lightning's bolts while they flash.
    perfZone('weather');
    const over = { target, depth: targets.depth, size: [drawnAt.width, drawnAt.height] as const };
    this.fall.encode(encoder, over, { fromEye, eye: shot.eye, aboveM: above }, look, time);
    const { strikes, worldS, reading } = SKY_NOW.current;
    const groundAt = (x: number, y: number) => this.groundAt(x, y);
    // The bolts leave the deck the Overworld's camera stays under; under thin cover, where half cover's base would be.
    const baseM = cloudBaseOf(reading && { ...reading, cloud: Math.max(reading.cloud, 0.5) }) ?? 0;
    this.bolts.encode(encoder, over, { fromEye, eye: shot.eye }, { list: strikes, worldS, baseM, groundAt, air });
    perfZone('light');
    if (drawers.some((drawer) => drawer.lightInto))
      this.light.encode(encoder, target, targets.depth, (light) => {
        for (const drawer of drawers) drawer.lightInto?.(light, fromEye, targets.depth);
      });
    // The story's weather over the game's; clear, as it stands outside the story, lays nothing and makes no pass.
    perfZone('atmosphere');
    if (!drawsNothing(this.weather))
      this.atmosphere.encode(encoder, target, targets.depth, {
        weather: this.weather,
        camera: { ...camera, eye: shot.eye },
        tanHalfView: Math.tan(shot.fov / 2),
        size: [drawnAt.width, drawnAt.height],
        time,
        motionReduced: motionReduced(),
        light: cloudLight(look),
      });
    const shown = targets.picture ? canvas.createView() : target;
    if (targets.picture) {
      perfZone('upscale');
      this.upscale.encode(encoder, targets.picture, shown);
    }
    perfZone('hands');
    more.after?.(encoder, shown, { width: size.width, height: size.height, light: SKY_NOW.current.held });
    perfZone('blur and drain');
    this.blur.encode(encoder, canvas, more.blur ?? 0);
    this.drain.encode(encoder, canvas, more.drain ?? 0, more.dark ?? 0);
    this.gpu.device.queue.submit([encoder.finish()]);
  }

  /** The city's, the events' and the scene's own lamps, in that order, in the list kept for them. */
  private lampsJoined(): readonly LampPlace[] {
    const joined = this.joined;
    joined.length = 0;
    for (const lamp of CITY_LAMPS.current) joined.push(lamp);
    for (const lamp of EVENT_LAMPS.current) joined.push(lamp);
    for (const lamp of this.lamps) joined.push(lamp);
    return joined;
  }

  /** The swell as drawn: the rules' own, its waves raised by the weather's gain. */
  private drawnSwell(view: LandView) {
    return view.swell && swellGained(view.swell, this.weather.seaGain);
  }

  /** The targets at `width` by `height`, with a picture of their own to draw into when `scaled` from the canvas's. */
  private targetsOf(width: number, height: number, scaled: boolean) {
    const kept = this.targets;
    if (kept?.colour.width === width && kept.colour.height === height && !!kept.picture === scaled) return kept;
    for (const texture of Object.values(kept ?? {})) texture?.destroy();
    const usage = TEXTURE_USAGE.renderAttachment | TEXTURE_USAGE.textureBinding;
    const { device, format } = this.gpu;
    const size = [width, height];
    this.targets = {
      colour: device.createTexture({ size, format, usage }),
      depth: device.createTexture({ size, format: 'r32float', usage }),
      multisampled: device.createTexture({ size, format, usage: TEXTURE_USAGE.renderAttachment, sampleCount: SAMPLES }),
      multidepth: device.createTexture({ size, format: 'depth32float', usage, sampleCount: SAMPLES }),
      picture: scaled ? device.createTexture({ size, format, usage }) : null,
    };
    return this.targets;
  }
}
