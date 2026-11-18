import { type Gpu, TEXTURE_USAGE } from '../gpu.ts';
import type { GroundPatch, LandView } from '../rules/landRules.ts';
import type { HullMask } from '../water/hullMask.ts';
import { loadShip, shipSails } from '../ships/shipMesh.ts';
import { MarkView } from '../ships/markView.ts';
import { SailRig, windOff } from '../ships/sails.ts';
import { ShipView } from '../ships/shipView.ts';
import { type ShoreField, waterUnder } from '../water/shore.ts';
import { type Body, bodyStep, EYE_M, type Footing } from '../water/swimming.ts';
import { dropPatchWater, type PatchWater, SAMPLES, WaterView } from '../water/waterView.ts';
import { clipmapLevels, finestSpacing } from '../terrain/clipmap.ts';
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
import type { CloseGround } from '../terrain/landClient.ts';
import type { CellRect } from './landMask.ts';
import { cameraOf, FIELD_OF_VIEW, type Orbit, PITCH_LIMITS, viewProjection } from './orbit.ts';
import { heightAt } from './reliefView.ts';
import { type TerrainData, type TerrainOptions, TerrainView } from '../terrain/terrainView.ts';
import { helmOf, isRungKey } from '../ships/helmKeys.ts';
import type { Afloat } from './afloat.ts';
import type { FightSource } from './fighting.ts';
import type { FleetCall } from './fleetLink.ts';
import type { FleetSloop } from './fleetPlay.ts';
import { FleetScene } from './fleetScene.ts';
import { Harbour } from './harbour.ts';
import { Naval } from './naval.ts';
import type { SailSource } from './sailing.ts';

/** Where the close-up's exact ground comes from, and where a ship is sailed and fought. */
export interface GroundSource extends SailSource, FightSource {
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
  /** The right mouse is held: the look lays her guns. */
  readonly aiming: boolean;
  /** Releases of the guns, and steps of the load (the wheel while aiming), since the last frame. */
  readonly fires: number;
  readonly loadSteps: number;
  readonly source: GroundSource | null;
  /** Online: the Sloop's session in a fleet room, which sails her; the water then rolls by the room's clock. */
  readonly fleet: FleetSloop | null;
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
/** The most a frame steps the sails, seconds: a stall or a hidden tab does not swing them at once. */
const MOST_SAIL_STEP_S = 0.1;

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
  /** The Sloop and her model; and whether she may still sail (the rules have not refused her). */
  private readonly harbour: Harbour<ShipView>;
  /** Her sails' rig and a captain's, once her model has come; and when they were last stepped. */
  private rigs: [SailRig, SailRig] | null = null;
  private sailedAt = 0;
  private mayStillSail = true;
  /** A captain's fight round the Sloop; or, online, the fleet she sails in. */
  private readonly marks: MarkView;
  private readonly naval: Naval;
  private fleet: FleetScene | null = null;

  constructor(gpu: Gpu, redraw: () => void, fail: (error: unknown) => void) {
    this.gpu = gpu;
    this.redraw = redraw;
    this.fail = fail;
    this.water = new WaterView(gpu);
    this.harbour = new Harbour(
      () => loadShip('sloop').then((mesh) => new ShipView(gpu, mesh, shipSails('sloop'))),
      fail,
    );
    this.marks = new MarkView(gpu);
    this.naval = new Naval(this.marks);
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
    this.harbour.leave();
    this.naval.end();
    this.fleet = null;
  }

  /** The Sloop afloat: her fleet session's, online, or the editor's own. */
  private get sailing(): Afloat | null {
    return this.fleet?.play ?? this.harbour.sailing;
  }

  private get ship() {
    return this.harbour.view;
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
    return Math.max(0, this.exactGround(id, x, y) ?? heightAt(view, x, y) ?? 0);
  }

  /** The exact ground's height at a world point, where the current close-up reaches; null elsewhere. */
  exactGround(id: string, x: number, y: number): number | null {
    const close = this.current(id);
    return close ? groundUnder(close.patch, x, y) : null;
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
    const online = frame.sailing ? frame.fleet : null;
    if (online !== (this.fleet?.play ?? null)) this.fleet = online ? new FleetScene(online, this.marks) : null;
    const fleet = this.fleet;
    // Online, the ships ride the room's swell, so the water rolls by its clock.
    const time = fleet ? fleet.play.roomTime(now / 1000) : now / 1000;
    this.version = frame.editsVersion;
    const { view, id } = frame;
    let orbit = frame.walking ? this.walk(frame, seconds, time) : frame.orbit;
    if (!frame.walking) [this.body, this.footing] = [null, null];
    if (frame.sailing)
      orbit = fleet ? this.sailOnline(fleet, frame, seconds, now / 1000) : this.sail(frame, seconds, time);
    else {
      this.mayStillSail = true;
      this.harbour.leave();
      this.naval.end();
    }
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
    const own = this.harbour.sailing;
    const seen =
      frame.aiming && fleet
        ? fleet.aimCamera(orbit, view, shown)
        : frame.aiming && own && this.naval.fighting
          ? this.naval.aimCamera(orbit, own, view, shown)
          : this.clearOfBed(orbit);
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
    const ship = this.ship;
    // Her rig and a captain's, once her model has come.
    if (ship && !this.rigs) this.rigs = [new SailRig(ship.sails), new SailRig(ship.sails)];
    const sails = this.rigs && {
      rig: this.rigs[1],
      bearing: view.swell?.bearing ?? 0,
      seconds: Math.min(MOST_SAIL_STEP_S, Math.max(0, time - this.sailedAt)),
    };
    this.sailedAt = time;
    if (this.sailing && ship && sails && this.rigs) {
      const place = this.sailing.place(view, shown);
      const wind = { offDeg: windOff(place.heading, sails.bearing), set: this.sailing.sailsSet };
      this.rigs[0].step(sails.seconds, wind, time);
      ship.drawInto(pass, place, { fromEye, eye: camera.eye }, 0, 1, this.rigs[0]);
    }
    if (fleet) fleet.draw(pass, view, shown, { fromEye, eye: camera.eye }, ship, now / 1000);
    else this.naval.draw(pass, view, shown, { fromEye, eye: camera.eye }, ship, time, sails);
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
      hulls: this.hulls(view),
      drawn,
      target: this.gpu.context.getCurrentTexture().createView(),
    });
    this.gpu.device.queue.submit([encoder.finish()]);
    const feet =
      near && !frame.walking && !this.sailing ? ([orbit.targetX, orbit.targetY, ground * shown] as const) : null;
    return { orbit, feet, sailing: frame.sailing && this.mayStillSail };
  }

  /** The Sloop: put to sea at the camera's target, then stepped by the rules with the keys' helm, her wake stirring
   *  the water. Answers the camera's orbit, on her once she sails. */
  private sail(frame: SceneFrame, seconds: number, time: number): Orbit {
    const { source, id, view, orbit } = frame;
    const [x, y] = [orbit.targetX + view.leftM, orbit.targetY + view.topM];
    this.mayStillSail = this.harbour.board(source, id, x, y, orbit.yaw, time);
    const sailing = this.harbour.sailing;
    if (!sailing) {
      frame.pressed.length = 0;
      return orbit;
    }
    for (const key of frame.pressed.splice(0)) {
      if (key === 'f') this.naval.toggle(source, id, sailing, time, this.fail);
      else sailing.press(key);
    }
    if (this.naval.busy) {
      const look = frame.aiming ? this.naval.look(orbit, sailing, view) : null;
      const input = {
        held: frame.held,
        // A rung press waits with her helm until the fight that takes it is on.
        press: this.naval.fighting ? sailing.takePress() : undefined,
        look,
        fire: frame.fires > 0,
        loadSteps: frame.loadSteps,
      };
      for (const splash of this.naval.step(seconds, input, time, sailing, view, this.fail))
        this.water.stir(splash.x, splash.y, splash.radiusM, splash.strength);
    } else sailing.advance(seconds, frame.held, time, this.fail);
    const waterline = this.ship?.waterline;
    for (const stir of waterline ? sailing.wake(view, waterline) : []) {
      this.water.stir(stir.x, stir.y, stir.radiusM, stir.strength);
    }
    // Aiming may look over the horizon; the camera round her stays above it.
    const round = sailing.orbit(orbit, view);
    return frame.aiming ? round : { ...round, pitch: Math.max(round.pitch, PITCH_LIMITS.lowest) };
  }

  /** The Sloop in a fleet room: her orders from the keys (F calls a captain, X sends them all off), her look while
   *  aiming, the fleet's effects on the water, and her wake. Answers the camera's orbit, on her. */
  private sailOnline(fleet: FleetScene, frame: SceneFrame, seconds: number, now: number): Orbit {
    const { view, orbit } = frame;
    this.harbour.fetchModel();
    const climbs: number[] = [];
    let call: FleetCall = 'none';
    for (const key of frame.pressed.splice(0)) {
      if (key === 'f') call = 'captain';
      else if (key === 'x') call = 'send off';
      else if (isRungKey(key)) climbs.push(helmOf(new Set(), key).climb);
    }
    const look = frame.aiming ? fleet.look(orbit, view) : null;
    const { steer, crab } = helmOf(frame.held, undefined);
    const brace = frame.held.has('c');
    const input = { steer, crab, climbs, look, fire: frame.fires > 0, brace, loadSteps: frame.loadSteps, call };
    for (const splash of fleet.step(seconds, input, now, view))
      this.water.stir(splash.x, splash.y, splash.radiusM, splash.strength);
    const waterline = this.ship?.waterline;
    for (const stir of waterline ? fleet.play.wake(view, waterline) : []) {
      this.water.stir(stir.x, stir.y, stir.radiusM, stir.strength);
    }
    const round = fleet.play.orbit(orbit, view);
    return frame.aiming ? round : { ...round, pitch: Math.max(round.pitch, PITCH_LIMITS.lowest) };
  }

  /** The ships' footprints on the water: hers, and a captain's while she floats, or every ship of her fleet. */
  private hulls(view: LandView): HullMask[] {
    const waterline = this.ship?.waterline;
    if (!waterline || !this.sailing) return [];
    const others = this.fleet ? this.fleet.hulls(view, waterline) : [this.naval.hull(view, waterline)];
    return [this.sailing.hull(view, waterline), ...others.filter((hull) => hull !== null)];
  }

  /** The fight's lines for the panel, if one is on, or the fleet's. */
  fightLines(): string[] {
    const now = performance.now() / 1000;
    return this.fleet ? this.fleet.lines(now) : this.naval.lines(now);
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
