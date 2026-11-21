// The World Editor's Islands mode: one island at a time, from a seed and a climate, built by the room module
// (`room.wasm`, crates/room-wasm/src/isle_door.rs) exactly as its room builds it, drawn by the islands layer with the
// sea round it into the view right of the panel, under the editor's orbit camera, close up or from 3 km off.
import { startRoomDoor } from '../../../server/roomDoor.ts';
import { type Gpu, TEXTURE_USAGE } from '../gpu.ts';
import { ISLE_CLIMATES } from '../islands/isleModules.ts';
import { islePacksPrefix, ISLE_MANIFEST } from '../islands/isleManifest.ts';
import { type IsleShown, readIslePlan } from '../islands/islePlan.ts';
import { IslesView } from '../islands/isleView.ts';
import { ShadowMap } from '../shadow.ts';
import { SAMPLES, WaterView } from '../water/waterView.ts';
import type { EditorDrawn, EditorFrame, EditorFrameView } from './editorFrame.ts';
import { DEPTH_COPY } from './depthCopy.ts';
import {
  cameraOf,
  FIELD_OF_VIEW,
  type Orbit,
  panOrbit,
  PITCH_LIMITS,
  rotateOrbit,
  viewProjection,
  zoomOrbit,
} from './orbit.ts';
import { islePanel } from './islePanel.ts';

export interface IsleEditor {
  activate(): void;
  deactivate(): void;
  /** Draws the island into the view right of the panel; answers the Islands panel. */
  draw(frame: EditorFrameView): EditorDrawn;
}

/** The two views the presses go to: close, about 40 m up over the middle; and afar, 3 km off. */
const CLOSE: Omit<Orbit, 'targetZ'> = { targetX: 0, targetY: 0, yaw: 0.6, pitch: 0.45, distance: 90 };
const AFAR: Omit<Orbit, 'targetZ'> = { targetX: 0, targetY: 0, yaw: 0.6, pitch: 0.08, distance: 3000 };
/** How many seeds the "next isle" press tries before it gives up: one in eight is an isle. */
const MOST_TRIES = 400;

interface Targets {
  readonly colour: GPUTexture;
  readonly depth: GPUTexture;
  readonly multisampled: GPUTexture;
  readonly multidepth: GPUTexture;
}

/** The open sea for the water's coarse grid: deep everywhere, far from any painted coast; no lakes. */
function openSea(gpu: Gpu): { wide: GPUTexture; lakes: GPUTexture; cellM: number } {
  const usage = TEXTURE_USAGE.textureBinding | TEXTURE_USAGE.copyDestination;
  const wide = gpu.device.createTexture({ size: [2, 2], format: 'rgba32float', usage });
  gpu.device.queue.writeTexture(
    { texture: wide },
    // Each texel: its height, far out from any coast, and the height carried over one.
    new Float32Array([-60, -50_000, -60, 0, -60, -50_000, -60, 0, -60, -50_000, -60, 0, -60, -50_000, -60, 0]),
    { bytesPerRow: 32 },
    [2, 2],
  );
  const lakes = gpu.device.createTexture({ size: [2, 2], format: 'rg32float', usage });
  gpu.device.queue.writeTexture({ texture: lakes }, new Float32Array(8), { bytesPerRow: 16 }, [2, 2]);
  return { wide, lakes, cellM: 1_000_000 };
}

export async function startIsleEditor(editor: EditorFrame): Promise<IsleEditor> {
  const { gpu, canvas } = editor;
  // A shader or pipeline the device refuses shows nothing: say why, once. The device is the whole editor's, so only
  // what the Islands mode makes and draws is watched.
  let told = false;
  const watched = <Made>(run: () => Made): Made => {
    gpu.device.pushErrorScope('validation');
    const made = run();
    void gpu.device.popErrorScope().then((error) => {
      if (error && !told) console.error('the Islands mode drew nothing:', error.message);
      told ||= error !== null;
    });
    return made;
  };
  const base = import.meta.env.BASE_URL;
  const answer = await fetch(`${base}room.wasm`);
  if (!answer.ok) throw new Error(`room.wasm: ${answer.status}`);
  const door = startRoomDoor(await WebAssembly.compile(await answer.arrayBuffer()));
  let active = false;
  const redraw = () => {
    if (active) editor.request();
  };
  const { isles, shadow, water, sea, depthCopy } = watched(() => {
    const module = gpu.device.createShaderModule({ code: DEPTH_COPY });
    return {
      isles: new IslesView(gpu, ISLE_MANIFEST, islePacksPrefix(location.search), redraw),
      shadow: new ShadowMap(gpu),
      water: new WaterView(gpu),
      sea: openSea(gpu),
      depthCopy: gpu.device.createRenderPipeline({
        layout: 'auto',
        vertex: { module, entryPoint: 'copy_vertex' },
        fragment: { module, entryPoint: 'copy_fragment', targets: [{ format: 'r32float' }] },
      }),
    };
  });
  let targets: Targets | null = null;
  let shown: IsleShown | null = null;
  let orbit: Orbit = { ...CLOSE, targetZ: 0 };
  let status = '';
  let seed = '1';
  let climate = ISLE_CLIMATES[0] ?? '';
  let counts = '';

  const isSeed = (text: string) => /^\d{1,20}$/.test(text) && BigInt(text) < 1n << 64n;
  const build = (): boolean => {
    const asked = seed.trim();
    if (!isSeed(asked)) {
      status = 'A seed is a whole number under 2^64.';
      return false;
    }
    const text = door.islePlan(asked, climate);
    if (!text) {
      status = `The contract does not dress ${climate}.`;
      return false;
    }
    try {
      const plan = readIslePlan(text);
      shown = { id: 1, at: [0, 0], climate, plan, heights: door.isleHeights(asked, climate, [0, 0]) };
      isles.show([shown]);
    } catch (error) {
      status = `That island does not read: ${String(error)}`;
      return false;
    }
    const { plan } = shown;
    status = `A ${plan.kind} of ${plan.placements.length} modules, ${Math.round(plan.radius * 2)} m across, its dungeon ${plan.dungeon}.`;
    return true;
  };
  /** Steps the seed on by one, or on to the next isle's: only the island stepped to is built. */
  const step = (isle: boolean) => {
    for (let tries = 0; tries < MOST_TRIES; tries++) {
      const from = seed.trim() || '0';
      if (!isSeed(from)) break;
      seed = String(BigInt.asUintN(64, BigInt(from) + 1n));
      if (!isle || (JSON.parse(door.islePlan(seed, climate) || '{}') as { kind?: string }).kind !== 'cove') break;
    }
    build();
  };
  const handlers = {
    seed: (text: string) => {
      seed = text;
      build();
    },
    climate: (next: string) => {
      climate = next;
      build();
    },
    step,
    look: (afar: boolean) => {
      orbit = { ...(afar ? AFAR : CLOSE), targetZ: 0 };
    },
  };

  const targetsFor = (width: number, height: number): Targets => {
    if (targets?.colour.width === width && targets.colour.height === height) return targets;
    for (const texture of Object.values(targets ?? {})) texture.destroy();
    const usage = TEXTURE_USAGE.renderAttachment | TEXTURE_USAGE.textureBinding;
    const { device, format } = gpu;
    const size = [width, height];
    targets = {
      colour: device.createTexture({ size, format, usage }),
      depth: device.createTexture({ size, format: 'r32float', usage }),
      multisampled: device.createTexture({ size, format, usage: TEXTURE_USAGE.renderAttachment, sampleCount: SAMPLES }),
      multidepth: device.createTexture({ size, format: 'depth32float', usage, sampleCount: SAMPLES }),
    };
    return targets;
  };

  /** The island and the sea round it, drawn into `target`, `width` by `height` device pixels. */
  const paint = (target: GPUTextureView, { width, height }: { width: number; height: number }) => {
    const ground = Math.max(0, isles.groundAt(orbit.targetX, orbit.targetY) ?? 0);
    orbit = { ...orbit, targetZ: ground };
    const camera = cameraOf(orbit);
    const fromEye = viewProjection(orbit, width / height, true);
    const shot = { eye: camera.eye };
    const time = performance.now() / 1000;
    const above = camera.eye[2] - Math.max(0, isles.groundAt(camera.eye[0], camera.eye[1]) ?? 0);
    shadow.update(camera.eye, orbit.yaw, above);
    const drawn = targetsFor(width, height);
    const encoder = gpu.device.createCommandEncoder();
    shadow.cast(encoder, (pass) => isles.castInto(pass, fromEye, shot, time, shadow));
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
    isles.drawInto(pass, fromEye, shot, time, shadow);
    pass.end();
    const copy = encoder.beginRenderPass({
      colorAttachments: [
        { view: drawn.depth.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] },
      ],
    });
    copy.setPipeline(depthCopy);
    copy.setBindGroup(
      0,
      gpu.device.createBindGroup({
        layout: depthCopy.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: drawn.multidepth.createView() }],
      }),
    );
    copy.draw(3);
    copy.end();
    water.encode(encoder, {
      camera: { ...camera, fromEye, tanHalfView: Math.tan(FIELD_OF_VIEW / 2) },
      size: [width, height],
      time,
      seconds: 1 / 60,
      exaggeration: 1,
      fogM: Math.max(25_000, orbit.distance * 40),
      world: [0, 0],
      swell: undefined,
      coarse: sea,
      patch: null,
      eyeWater: { surface: 0, fresh: false },
      eyeAboveM: Math.abs(camera.eye[2]),
      focus: [orbit.targetX, orbit.targetY],
      hulls: [],
      drawn,
      target,
    });
    gpu.device.queue.submit([encoder.finish()]);
    const { triangles, draws } = isles.frame;
    counts = `${Math.round(triangles).toLocaleString('en-US')} triangles in ${draws} draws; ${Math.round(orbit.distance)} m from the target, the eye ${Math.round(above)} m over the ground.`;
  };

  let dragging: { x: number; y: number; button: number } | null = null;
  canvas.addEventListener('pointerdown', (event) => {
    if (!active || editor.takes(event.offsetX, event.offsetY)) return;
    // A field being typed in reports its value now, as a page's field does when the focus leaves it.
    editor.settle();
    canvas.setPointerCapture(event.pointerId);
    dragging = { x: event.offsetX, y: event.offsetY, button: event.button };
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!active || !dragging) return;
    const [moveX, moveY] = [event.offsetX - dragging.x, event.offsetY - dragging.y];
    orbit =
      dragging.button === 0
        ? rotateOrbit(orbit, moveX * 0.005, -moveY * 0.005, PITCH_LIMITS.lowest)
        : panOrbit(orbit, moveX, moveY, canvas.clientHeight);
    dragging = { ...dragging, x: event.offsetX, y: event.offsetY };
  });
  canvas.addEventListener('pointerup', () => (dragging = null));
  canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      if (!active || editor.takes(event.offsetX, event.offsetY)) return;
      orbit = zoomOrbit(orbit, Math.exp(event.deltaY * 0.0015));
    },
    { passive: false },
  );

  // The page's own `?isleSeed=` and `?isleClimate=` open on that island, for pictures.
  const asked = new URLSearchParams(location.search);
  seed = asked.get('isleSeed') ?? seed;
  const climateAsked = asked.get('isleClimate');
  if (climateAsked && ISLE_CLIMATES.includes(climateAsked)) climate = climateAsked;
  if (asked.get('isleView') === 'afar') orbit = { ...AFAR, targetZ: 0 };
  build();

  return {
    activate: () => {
      active = true;
      redraw();
    },
    deactivate: () => {
      active = false;
      dragging = null;
    },
    draw: (frame) => {
      watched(() => editor.aside(frame, paint));
      // The water moves: keep drawing while the mode is open.
      const view = { seed, climate, climates: ISLE_CLIMATES, status, counts };
      return { inks: [], over: [], panel: islePanel(frame.ui, view, handlers), again: true };
    },
  };
}
