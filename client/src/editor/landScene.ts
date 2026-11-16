import { type Gpu, TEXTURE_USAGE } from '../gpu.ts';
import type { GroundPatch, LandView } from '../rules/landRules.ts';
import { loadShip } from '../ships/shipMesh.ts';
import { ShipView } from '../ships/shipView.ts';
import { type ShoreField, waterUnder } from '../water/shore.ts';
import { type Body, bodyStep, EYE_M, type Footing } from '../water/swimming.ts';
import { dropPatchWater, type PatchWater, SAMPLES, WaterView } from '../water/waterView.ts';
import { clipmapLevels, finestSpacing } from './clipmap.ts';
import {
  CLOSE_RANGE_M,
  closeUpData,
  groundUnder,
  PATCH_SAMPLES,
  PATCH_STEP_M,
  REFRESH_M,
  shownExaggeration,
  walkStep,
} from './closeUp.ts';
import type { CloseGround } from './landClient.ts';
import type { CellRect } from './landMask.ts';
import { cameraOf, FIELD_OF_VIEW, type Orbit, PITCH_LIMITS, viewProjection } from './orbit.ts';
import { heightAt } from './reliefView.ts';
import { Sailing, type SailSource } from './sailing.ts';
import { type TerrainData, type TerrainOptions, TerrainView } from './terrainView.ts';

/** Where the close-up's exact ground comes from, and where a ship is sailed. */
export interface GroundSource extends SailSource {
  ground(id: string, left: number, top: number, step: number, size: number): Promise<CloseGround | null>;
  isOpen(id: string): boolean;
}

/** The scene drawn so far, for the water: the land's colour and depth (one sample a pixel, the depth as metres-ready
 *  floats) and the multisampled colour and depth the passes draw into. */
export interface Drawn {
  readonly colour: GPUTexture;
  readonly depth: GPUTexture;
  readonly multisampled: GPUTexture;
  readonly multidepth: GPUTexture;
}

/** Copies the land's multisampled depth into one float a pixel, which the water's shaders can read. */
const DEPTH_COPY = /* wgsl */ `
@group(0) @binding(0) var depths: texture_depth_multisampled_2d;

@vertex
fn copy_vertex(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
  let corner = vec2f(f32((index << 1u) & 2u), f32(index & 2u));
  return vec4f(corner * 2.0 - 1.0, 0.0, 1.0);
}

// The mean of the pixel's samples: the depth at its centre on a slope. The nearest sample would sit far in front of
// it where the view grazes the ground, a pixel spanning hundreds of metres there.
@fragment
fn copy_fragment(@builtin(position) position: vec4f) -> @location(0) vec4f {
  var sum = 0.0;
  for (var sample = 0; sample < ${SAMPLES}; sample++) {
    sum += textureLoad(depths, vec2i(position.xy), sample);
  }
  return vec4f(sum / ${SAMPLES}.0, 0.0, 0.0, 1.0);
}
`;

/** One frame of the 3D view: the landmass, its 1 km window, the camera, and the walker's keys. */
export interface SceneFrame {
  readonly id: string;
  readonly data: TerrainData;
  readonly view: LandView;
  readonly orbit: Orbit;
  readonly size: { readonly width: number; readonly height: number };
  readonly exaggeration: number;
  readonly brush: TerrainOptions['brush'];
  readonly walking: boolean;
  /** The Sloop is asked for: she is put to sea at the camera's target and sailed. */
  readonly sailing: boolean;
  readonly held: ReadonlySet<string>;
  /** Keys pressed (not repeats) since the last frame; the scene takes them. */
  readonly pressed: string[];
  readonly source: GroundSource | null;
  readonly editsVersion: number;
  /** A stroke is being drawn: the land changes under it, so the close-up waits for it to end. */
  readonly stroking: boolean;
}

interface CloseUp {
  readonly id: string;
  readonly patch: GroundPatch;
  readonly field: ShoreField;
  readonly water: PatchWater;
  readonly centre: readonly [number, number];
  readonly version: number;
}

/** A swimmer may look up at the surface from below; on land the camera stays above the horizon. */
const SWIMMER_LOWEST_PITCH = -1.2;
const STROKE_WORDS = { walk: 'Walking', wade: 'Wading', swim: 'Swimming', dive: 'Diving' } as const;
/** A wader's stride or a swimmer's stroke, metres: each pushes the water once. */
const STROKE_M = 0.35;

/**
 * The 3D view of a landmass: its 1 km land, the exact ground round the camera's target, the water over both, and a
 * walker who wades, swims and dives in it. The editor has no world clock, so the water moves by the page's.
 */
export class LandScene {
  private readonly gpu: Gpu;
  private readonly redraw: () => void;
  private readonly fail: (error: unknown) => void;
  private readonly water: WaterView;
  private terrain: { id: string; view: TerrainView } | null = null;
  private closeUp: CloseUp | null = null;
  /** The edits version of the frame being drawn: a close-up made before it is stale. */
  private version = 0;
  private patchPending = false;
  private body: Body | null = null;
  private footing: Footing | null = null;
  private travelled = 0;
  private drawn: Drawn | null = null;
  private shownClose: CloseUp | null = null;
  private readonly depthCopy: GPURenderPipeline;
  private lastFrame = performance.now();
  private sailing: Sailing | null = null;
  /** Putting her to sea is with the rules, or they refused it: no more is asked until the owner asks again. */
  private sailAsked: 'no' | 'asking' | 'refused' = 'no';
  private ship: ShipView | null = null;
  private shipLoading = false;

  constructor(gpu: Gpu, redraw: () => void, fail: (error: unknown) => void) {
    this.gpu = gpu;
    this.redraw = redraw;
    this.fail = fail;
    this.water = new WaterView(gpu);
    const module = gpu.device.createShaderModule({ code: DEPTH_COPY });
    this.depthCopy = gpu.device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'copy_vertex' },
      fragment: { module, entryPoint: 'copy_fragment', targets: [{ format: 'r32float' }] },
    });
  }

  /** Lets the 1 km terrain go, so the next frame builds it again. */
  reset(): void {
    this.terrain?.view.destroy();
    this.terrain = null;
    this.shownClose = null;
    [this.body, this.footing] = [null, null];
  }

  /** Lays changed cells on the 1 km terrain. */
  update(data: TerrainData, rect: CellRect | null): void {
    this.terrain?.view.update(data, rect);
  }

  /** The lowest the camera may look: up from below the surface while swimming, else just above the horizon. */
  get lowestPitch(): number {
    return this.body?.stroke === 'swim' || this.body?.stroke === 'dive' ? SWIMMER_LOWEST_PITCH : PITCH_LIMITS.lowest;
  }

  /** The close-up, while it is of this landmass and made since its land last changed. */
  private current(id: string): CloseUp | null {
    return this.closeUp?.id === id && this.closeUp.version === this.version ? this.closeUp : null;
  }

  /** The ground's height at a world point: exact where the close-up reaches, the 1 km land's elsewhere; the sea's
   *  still surface over the sea. */
  private groundAt(id: string, view: LandView, x: number, y: number): number {
    const close = this.current(id);
    const exact = close ? groundUnder(close.patch, x, y) : null;
    return Math.max(0, exact ?? heightAt(view, x, y) ?? 0);
  }

  /** What the walker or the Sloop is doing and where, for the panel. */
  describe(view: LandView, orbit: Orbit): string {
    const [x, y] = [orbit.targetX + view.leftM, orbit.targetY + view.topM];
    const place = `${(x / 1000).toFixed(3)} km east, ${(y / 1000).toFixed(3)} km south`;
    if (this.sailing) return `Sailing at ${place}. ${this.sailing.describe()}`;
    const where = `${STROKE_WORDS[this.body?.stroke ?? 'walk']} at ${place}`;
    const { bed, surface } = this.footing ?? { bed: 0, surface: null };
    if (surface === null || surface <= bed) return `${where}, on ground at ${bed.toFixed(1)} m`;
    return `${where}, in ${(surface - bed).toFixed(1)} m of water`;
  }

  /** Steps the walker, keeps the close-up, and draws the land, then the water. Answers the camera as drawn and, for
   *  the scale cues, the ground at its target when the close-up shows. */
  draw(frame: SceneFrame): { orbit: Orbit; feet: readonly [number, number, number] | null; sailing: boolean } {
    const now = performance.now();
    const seconds = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    const time = now / 1000;
    this.version = frame.editsVersion;
    const { view, id } = frame;
    let orbit = frame.walking ? this.walk(frame, seconds, time) : frame.orbit;
    if (!frame.walking) [this.body, this.footing] = [null, null];
    if (frame.sailing) orbit = this.sail(frame, seconds, time);
    else [this.sailing, this.sailAsked] = [null, 'no'];
    this.keepCloseUp(frame, orbit);
    const shown = shownExaggeration(frame.exaggeration, orbit.distance);
    const ground = this.groundAt(id, view, orbit.targetX + view.leftM, orbit.targetY + view.topM);
    orbit = { ...orbit, targetZ: (this.body?.eye ?? this.sailing?.lookAtM() ?? ground) * shown };

    if (this.terrain?.id !== id) {
      this.reset();
      this.terrain = { id, view: new TerrainView(this.gpu, frame.data) };
    }
    const terrain = this.terrain.view;
    // The close-up shows while it is current: near enough, and made after the last change to the land.
    const near = orbit.distance < CLOSE_RANGE_M && !frame.stroking ? this.current(id) : null;
    if (near !== this.shownClose) {
      terrain.showCloseUp(near && closeUpData(near.patch, near.field.levels, view));
      this.shownClose = near;
    }
    const seen = this.clearOfBed(orbit);
    const camera = cameraOf(seen);
    const fromEye = viewProjection(seen, frame.size.width / frame.size.height, true);
    const eyeWorld = [camera.eye[0] + view.leftM, camera.eye[1] + view.topM] as const;
    const above = camera.eye[2] / shown - this.groundAt(id, view, eyeWorld[0], eyeWorld[1]);
    const rings = clipmapLevels(camera.eye[0], camera.eye[1], finestSpacing(above));
    const pixelAngle = (2 * Math.tan(FIELD_OF_VIEW / 2)) / frame.size.height;
    terrain.prepare(
      {
        fromEye,
        eye: camera.eye,
        time,
        rings,
        far: camera.far,
        pixelAngle,
      },
      { exaggeration: shown, brush: frame.brush },
    );

    const drawn = this.targets(frame.size.width, frame.size.height);
    const encoder = this.gpu.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: drawn.multisampled.createView(),
          resolveTarget: drawn.colour.createView(),
          clearValue: [0, 0, 0, 1],
          loadOp: 'clear',
          storeOp: 'discard',
        },
      ],
      depthStencilAttachment: {
        view: drawn.multidepth.createView(),
        depthClearValue: 0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    });
    terrain.drawInto(pass);
    if (this.sailing && this.ship)
      this.ship.drawInto(pass, this.sailing.place(view, shown), { fromEye, eye: camera.eye });
    pass.end();
    const copy = encoder.beginRenderPass({
      colorAttachments: [
        { view: drawn.depth.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] },
      ],
    });
    copy.setPipeline(this.depthCopy);
    copy.setBindGroup(
      0,
      this.gpu.device.createBindGroup({
        layout: this.depthCopy.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: drawn.multidepth.createView() }],
      }),
    );
    copy.draw(3);
    copy.end();
    const eyeWater = this.waterAt(id, view, camera.eye[0], camera.eye[1], time);
    this.water.encode(encoder, {
      camera: { ...camera, fromEye, tanHalfView: Math.tan(FIELD_OF_VIEW / 2) },
      size: [frame.size.width, frame.size.height],
      time,
      seconds,
      exaggeration: shown,
      fogM: Math.max(25_000, orbit.distance * 40),
      world: [view.leftM, view.topM],
      swell: view.swell,
      coarse: terrain.cells,
      patch: near?.water ?? null,
      eyeWater,
      eyeAboveM: Math.abs(camera.eye[2] / shown - (eyeWater?.surface ?? this.groundAt(id, view, ...eyeWorld))),
      focus: [orbit.targetX, orbit.targetY],
      hull: this.sailing && this.ship ? this.sailing.hull(view, this.ship.waterline) : null,
      drawn,
      target: this.gpu.context.getCurrentTexture().createView(),
    });
    this.gpu.device.queue.submit([encoder.finish()]);
    const feet =
      near && !frame.walking && !this.sailing ? ([orbit.targetX, orbit.targetY, ground * shown] as const) : null;
    return { orbit, feet, sailing: frame.sailing && this.sailAsked !== 'refused' };
  }

  /** The Sloop: put to sea at the camera's target once asked, then stepped by the rules with the keys' helm; her mesh
   *  fetched the first time. Answers the camera's orbit, on her once she sails. */
  private sail(frame: SceneFrame, seconds: number, time: number): Orbit {
    const { source, id, view, orbit } = frame;
    if (!this.ship && !this.shipLoading) {
      this.shipLoading = true;
      loadShip('sloop')
        .then((mesh) => {
          this.ship = new ShipView(this.gpu, mesh);
        })
        .catch((error: unknown) => {
          this.shipLoading = false;
          this.fail(error);
        });
    }
    if (!this.sailing) {
      if (source && this.sailAsked === 'no') {
        this.sailAsked = 'asking';
        const [x, y] = [orbit.targetX + view.leftM, orbit.targetY + view.topM];
        Sailing.putToSea(source, id, x, y, orbit.yaw, time)
          .then((answer) => {
            if (this.sailAsked !== 'asking') return;
            if (typeof answer !== 'string') [this.sailing, this.sailAsked] = [answer, 'no'];
            else {
              this.sailAsked = 'refused';
              this.fail(new Error(answer));
            }
          })
          .catch((error: unknown) => {
            this.sailAsked = 'refused';
            this.fail(error);
          });
      }
      frame.pressed.length = 0;
      return orbit;
    }
    for (const key of frame.pressed.splice(0)) this.sailing.press(key);
    this.sailing.advance(seconds, frame.held, time, this.fail);
    const waterline = this.ship?.waterline;
    for (const stir of waterline ? this.sailing.wake(view, waterline) : []) {
      this.water.stir(stir.x, stir.y, stir.radiusM, stir.strength);
    }
    return this.sailing.orbit(orbit, view);
  }

  /** The camera a diver looks up from: behind them, but brought in so it never sinks into the bed. */
  private clearOfBed(orbit: Orbit): Orbit {
    if (!this.body || !this.footing || orbit.pitch >= 0) return orbit;
    const room = this.body.eye - (this.footing.bed + 0.4);
    return { ...orbit, distance: Math.min(orbit.distance, Math.max(0.3, room / Math.sin(-orbit.pitch))) };
  }

  /** The water at a window point now, for the eye: its surface and whether it is fresh; null where none stands. */
  private waterAt(id: string, view: LandView, x: number, y: number, time: number) {
    const world = { x: x + view.leftM, y: y + view.topM };
    const close = this.current(id);
    const water = close ? waterUnder(close.field, view.swell, world, time) : null;
    if (water) return water.kind === 'dry' ? null : { surface: water.surface, fresh: water.kind === 'fresh' };
    return (heightAt(view, world.x, world.y) ?? 0) < 0 ? { surface: 0, fresh: false } : null;
  }

  /** The bed and the water's surface at a window point, for the walker. */
  private footingAt(id: string, view: LandView, x: number, y: number, time: number): Footing {
    const world = { x: x + view.leftM, y: y + view.topM };
    const close = this.current(id);
    const water = close ? waterUnder(close.field, view.swell, world, time) : null;
    if (water) return { bed: water.bed, surface: water.kind === 'dry' ? null : water.surface };
    const bed = heightAt(view, world.x, world.y) ?? 0;
    return { bed, surface: bed < 0 ? 0 : null };
  }

  /** One step of the walker: W A S D (Shift to run on land), C to dive, Space to rise. Wading and swimming stir
   *  the water; stepping in, diving under and coming up splash it. */
  private walk(frame: SceneFrame, seconds: number, time: number): Orbit {
    const { orbit, held, id, view } = frame;
    const footing = (x: number, y: number) => this.footingAt(id, view, x, y, time);
    const before = this.body ?? {
      x: orbit.targetX,
      y: orbit.targetY,
      eye: footing(orbit.targetX, orbit.targetY).bed + EYE_M,
      stroke: 'walk' as const,
    };
    const keys = before.stroke === 'walk' ? held : new Set([...held].filter((key) => key !== 'shift'));
    const moved = walkStep(orbit, keys, seconds);
    const effort = {
      east: moved.targetX - orbit.targetX,
      south: moved.targetY - orbit.targetY,
      dive: held.has('c'),
      rise: held.has(' '),
    };
    const body = bodyStep(before, effort, footing, seconds);
    const crossed = (before.stroke === 'dive') !== (body.stroke === 'dive');
    this.travelled += Math.hypot(body.x - before.x, body.y - before.y);
    if ((before.stroke === 'walk' && body.stroke !== 'walk') || crossed) this.water.stir(body.x, body.y, 0.45, -0.02);
    else if (body.stroke !== 'walk' && body.stroke !== 'dive' && this.travelled > STROKE_M) {
      // Each stride or stroke pushes the water once, and a ring spreads from it.
      this.travelled = 0;
      this.water.stir(body.x, body.y, 0.25, -0.012);
    }
    [this.body, this.footing] = [body, footing(body.x, body.y)];
    return { ...moved, targetX: body.x, targetY: body.y, pitch: Math.max(orbit.pitch, this.lowestPitch) };
  }

  /** Samples the exact ground round the camera's target when it is close, again once it moves or the land changes. */
  private keepCloseUp(frame: SceneFrame, orbit: Orbit): void {
    const { source, id, view } = frame;
    if (!source || this.patchPending || frame.stroking || orbit.distance >= CLOSE_RANGE_M || !source.isOpen(id)) return;
    const [x, y] = [orbit.targetX + view.leftM, orbit.targetY + view.topM];
    const close = this.closeUp;
    const fresh =
      close?.id === id &&
      close.version === frame.editsVersion &&
      Math.hypot(x - close.centre[0], y - close.centre[1]) < REFRESH_M;
    if (fresh) return;
    this.patchPending = true;
    const half = ((PATCH_SAMPLES - 1) * PATCH_STEP_M) / 2;
    const version = frame.editsVersion;
    source
      .ground(id, Math.round(x - half), Math.round(y - half), PATCH_STEP_M, PATCH_SAMPLES)
      .then((ground) => {
        this.patchPending = false;
        if (!ground) return;
        dropPatchWater(this.closeUp?.water ?? null);
        const { patch, field } = ground;
        const water = this.water.patchWater(field, [view.leftM, view.topM]);
        this.closeUp = { id, patch, field, water, centre: [x, y], version };
        this.redraw();
      })
      .catch((error: unknown) => {
        this.patchPending = false;
        this.fail(error);
      });
  }

  /** The offscreen targets the land is drawn into, for the water to see through. */
  private targets(width: number, height: number): Drawn {
    if (this.drawn?.colour.width === width && this.drawn.colour.height === height) return this.drawn;
    for (const texture of Object.values(this.drawn ?? {})) texture.destroy();
    const usage = TEXTURE_USAGE.renderAttachment | TEXTURE_USAGE.textureBinding;
    const { device, format } = this.gpu;
    const size = [width, height];
    this.drawn = {
      colour: device.createTexture({ size, format, usage }),
      depth: device.createTexture({ size, format: 'r32float', usage }),
      multisampled: device.createTexture({ size, format, usage: TEXTURE_USAGE.renderAttachment, sampleCount: SAMPLES }),
      multidepth: device.createTexture({ size, format: 'depth32float', usage, sampleCount: SAMPLES }),
    };
    return this.drawn;
  }
}
