// The World Editor's Islands mode: one island at a time, from a seed and a climate, built by the room module
// (`room.wasm`, crates/room-wasm/src/isle_door.rs) exactly as its room builds it, drawn by the islands layer with the
// sea round it, under the editor's orbit camera, close up or from 3 km off.
import { startRoomDoor } from '../../../server/roomDoor.ts';
import { type Gpu, startGpu, TEXTURE_USAGE } from '../gpu.ts';
import { ISLE_CLIMATES } from '../islands/isleModules.ts';
import { islePacksPrefix, ISLE_MANIFEST } from '../islands/isleManifest.ts';
import { type IsleShown, readIslePlan } from '../islands/islePlan.ts';
import { IslesView } from '../islands/isleView.ts';
import { ShadowMap } from '../shadow.ts';
import { SAMPLES, WaterView } from '../water/waterView.ts';
import { button, make } from './dom.ts';
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

export interface IsleEditor {
  activate(): void;
  deactivate(): void;
}

/** The two views the buttons go to: close, about 40 m up over the middle; and afar, 3 km off. */
const CLOSE: Omit<Orbit, 'targetZ'> = { targetX: 0, targetY: 0, yaw: 0.6, pitch: 0.45, distance: 90 };
const AFAR: Omit<Orbit, 'targetZ'> = { targetX: 0, targetY: 0, yaw: 0.6, pitch: 0.08, distance: 3000 };
/** How many seeds on the "next isle" button tries before it gives up: one in eight is an isle. */
const MOST_TRIES = 400;

/** Copies the multisampled depth into one float a pixel for the water, as the Land mode's view does. */
const DEPTH_COPY = /* wgsl */ `
@group(0) @binding(0) var depths: texture_depth_multisampled_2d;
@vertex fn copy_vertex(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
  let corner = vec2f(f32((index << 1u) & 2u), f32(index & 2u));
  return vec4f(corner * 2.0 - 1.0, 0.0, 1.0);
}
@fragment fn copy_fragment(@builtin(position) position: vec4f) -> @location(0) vec4f {
  var sum = 0.0;
  for (var sample = 0; sample < ${SAMPLES}; sample++) { sum += textureLoad(depths, vec2i(position.xy), sample); }
  return vec4f(sum / ${SAMPLES}.0, 0.0, 0.0, 1.0);
}
`;

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

export async function startIsleEditor(canvas: HTMLCanvasElement, panel: HTMLElement): Promise<IsleEditor> {
  const gpu = await startGpu(canvas);
  // A shader or pipeline the device refuses shows nothing: say why, once.
  let told = false;
  gpu.device.addEventListener('uncapturederror', (event) => {
    if (!told) console.error('the Islands mode drew nothing:', (event as GPUUncapturedErrorEvent).error.message);
    told = true;
  });
  const base = import.meta.env.BASE_URL;
  const answer = await fetch(`${base}room.wasm`);
  if (!answer.ok) throw new Error(`room.wasm: ${answer.status}`);
  const door = startRoomDoor(await WebAssembly.compile(await answer.arrayBuffer()));
  let queued = false;
  let active = false;
  const redraw = () => {
    if (queued || !active) return;
    queued = true;
    requestAnimationFrame(frame);
  };
  const isles = new IslesView(gpu, ISLE_MANIFEST, islePacksPrefix(location.search), redraw);
  const shadow = new ShadowMap(gpu);
  const water = new WaterView(gpu);
  const sea = openSea(gpu);
  const module = gpu.device.createShaderModule({ code: DEPTH_COPY });
  const depthCopy = gpu.device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'copy_vertex' },
    fragment: { module, entryPoint: 'copy_fragment', targets: [{ format: 'r32float' }] },
  });
  let targets: Targets | null = null;
  let shown: IsleShown | null = null;
  let orbit: Orbit = { ...CLOSE, targetZ: 0 };
  let status = '';

  const seedInput = make('input');
  [seedInput.type, seedInput.value, seedInput.size] = ['text', '1', 22];
  const climateInput = make('select');
  for (const climate of ISLE_CLIMATES) {
    const option = make('option', climate);
    option.value = climate;
    climateInput.append(option);
  }
  const about = make('p', '', 'status');
  const counts = make('p', '', 'hint');
  const labelled = (text: string, input: HTMLElement) => {
    const label = make('label', text);
    label.append(input);
    return label;
  };
  const row = (className: string, ...children: HTMLElement[]) => {
    const node = make('div', '', className);
    node.append(...children);
    return node;
  };

  const isSeed = (seed: string) => /^\d{1,20}$/.test(seed) && BigInt(seed) < 1n << 64n;
  const build = (): boolean => {
    const seed = seedInput.value.trim();
    if (!isSeed(seed)) {
      status = 'A seed is a whole number under 2^64.';
      return false;
    }
    const text = door.islePlan(seed, climateInput.value);
    if (!text) {
      status = `The contract does not dress ${climateInput.value}.`;
      return false;
    }
    try {
      const plan = readIslePlan(text);
      shown = {
        id: 1,
        at: [0, 0],
        climate: climateInput.value,
        plan,
        heights: door.isleHeights(seed, climateInput.value, [0, 0]),
      };
      isles.show([shown]);
    } catch (error) {
      status = `That island does not read: ${String(error)}`;
      return false;
    }
    const { plan } = shown;
    status = `A ${plan.kind} of ${plan.placements.length} modules, ${Math.round(plan.radius * 2)} m across, its dungeon ${plan.dungeon}.`;
    return true;
  };
  const show = () => {
    build();
    redraw();
  };
  /** Steps the seed on by one, or on to the next isle's: only the island stepped to is built. */
  const step = (isle: boolean) => {
    for (let tries = 0; tries < MOST_TRIES; tries++) {
      const seed = seedInput.value.trim() || '0';
      if (!isSeed(seed)) break;
      seedInput.value = String(BigInt.asUintN(64, BigInt(seed) + 1n));
      if (
        !isle ||
        (JSON.parse(door.islePlan(seedInput.value, climateInput.value) || '{}') as { kind?: string }).kind !== 'cove'
      )
        break;
    }
    build();
    redraw();
  };
  const lookFrom = (to: Omit<Orbit, 'targetZ'>) => {
    orbit = { ...to, targetZ: 0 };
    redraw();
  };
  seedInput.addEventListener('change', show);
  climateInput.addEventListener('change', show);
  panel.append(
    make('h2', 'Island'),
    row('column', labelled('Seed ', seedInput), labelled('Climate ', climateInput)),
    row(
      'row',
      button('Next seed', () => step(false)),
      button('Next isle', () => step(true)),
    ),
    row(
      'row',
      button('Close up', () => lookFrom(CLOSE)),
      button('From 3 km', () => lookFrom(AFAR)),
    ),
    about,
    counts,
    make('p', 'Drag to turn, right-drag to pan, wheel to zoom.', 'hint'),
  );

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

  function frame() {
    queued = false;
    if (!active) return;
    const ratio = window.devicePixelRatio || 1;
    const [width, height] = [
      Math.max(1, Math.round(canvas.clientWidth * ratio)),
      Math.max(1, Math.round(canvas.clientHeight * ratio)),
    ];
    if (canvas.width !== width || canvas.height !== height) [canvas.width, canvas.height] = [width, height];
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
      target: gpu.context.getCurrentTexture().createView(),
    });
    gpu.device.queue.submit([encoder.finish()]);
    about.textContent = status;
    const { triangles, draws } = isles.frame;
    counts.textContent = `${Math.round(triangles).toLocaleString('en-US')} triangles in ${draws} draws; ${Math.round(orbit.distance)} m from the target, the eye ${Math.round(above)} m over the ground.`;
    // The water moves: keep drawing while the mode is open.
    redraw();
  }

  let dragging: { x: number; y: number; button: number } | null = null;
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  canvas.addEventListener('pointerdown', (event) => {
    canvas.setPointerCapture(event.pointerId);
    dragging = { x: event.offsetX, y: event.offsetY, button: event.button };
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const [moveX, moveY] = [event.offsetX - dragging.x, event.offsetY - dragging.y];
    orbit =
      dragging.button === 0
        ? rotateOrbit(orbit, moveX * 0.005, -moveY * 0.005, PITCH_LIMITS.lowest)
        : panOrbit(orbit, moveX, moveY, canvas.clientHeight);
    dragging = { ...dragging, x: event.offsetX, y: event.offsetY };
    redraw();
  });
  canvas.addEventListener('pointerup', () => (dragging = null));
  canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      orbit = zoomOrbit(orbit, Math.exp(event.deltaY * 0.0015));
      redraw();
    },
    { passive: false },
  );

  // The page's own `?isleSeed=` and `?isleClimate=` open on that island, for pictures.
  const asked = new URLSearchParams(location.search);
  seedInput.value = asked.get('isleSeed') ?? seedInput.value;
  const climate = asked.get('isleClimate');
  if (climate && ISLE_CLIMATES.includes(climate)) climateInput.value = climate;
  if (asked.get('isleView') === 'afar') orbit = { ...AFAR, targetZ: 0 };
  build();

  return {
    activate: () => {
      active = true;
      redraw();
    },
    deactivate: () => {
      active = false;
    },
  };
}
