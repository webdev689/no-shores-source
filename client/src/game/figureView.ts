import type { GlowField } from '../elementGlow.ts';
import { BUFFER_USAGE, SHADER_STAGE, TEXTURE_USAGE, type Gpu } from '../gpu.ts';
import { PULL_WGSL } from '../city/cityShaders.ts';
import { REVERSED_DEPTH } from '../editor/orbit.ts';
import { boxSeen, type Planes, sphereSeen, viewPlanes } from '../frustum.ts';
import { PX_PER_M } from '../player/figures.ts';
import { CARD_LOOK_FLOATS, STATUS_WGSL, cardLookInto, statusClock } from '../player/cardLooks.ts';
import type { Card, CardAt, CardMaker } from '../player/cards.ts';
import { GlowCards } from '../player/glowCards.ts';
import { NEAR, SHADOW_CAST_WGSL, SHADOW_WGSL, ShadowMap, shadowLayouts, sunAxes } from '../shadow.ts';
import { SKY_WGSL, skyUniformFor } from '../sky/skyUniform.ts';
import { SAMPLES } from '../water/waterView.ts';
import { LATTICE_SHADE_WGSL } from './latticeShade.ts';
import {
  FIGURE_REACH_M,
  UNSEEN_EVERY,
  cadenceDue,
  cardReach,
  leadMargin,
  poseEvery,
  sphereBox,
  turnBetween,
} from './figureCull.ts';

const VIEW_BYTES = 80;
const CARD_BYTES = 64 + CARD_LOOK_FLOATS * 4;
/** The cards the slots hold before they first grow. */
const MOST_FIGURES_AT_FIRST = 64;
/** A card lit by the sun, not by a light the page found. */
const NO_LIGHT = [0, 0, 0] as const;

/** The light at a point, red, green and blue. */
type Light = (point: readonly [number, number, number]) => readonly [number, number, number];
/** How far over a figure's feet the light it is lit by is taken, metres: about its chest. */
const LIT_AT_M = 1.2;

/** A figure's card stands upright on its feet, measured from the eye as the land is; the forge's pixels are drawn
 *  texel for texel and anything clear is cut away. Shared by the figures' pass and their shadow's. */
const CARD = /* wgsl */ `
// 'right' holds the eye's world height in z and, in w, 1 where the figures stand on a city's ground, which is pulled.
struct View { from_eye: mat4x4f, right: vec4f }
@group(0) @binding(0) var<uniform> view: View;
struct Card { feet: vec4f, size: vec4f, root: vec4f, status: vec4f, look: vec4f, tint: vec4f, light: vec4f }
@group(2) @binding(0) var<uniform> card: Card;
@group(2) @binding(1) var picture: texture_2d<f32>;

${SKY_WGSL}
${PULL_WGSL}
const CORNERS = array(vec2f(0, 0), vec2f(1, 0), vec2f(0, 1), vec2f(0, 1), vec2f(1, 0), vec2f(1, 1));

// How far a corner (0 to 1 across, 0 to 1 down) stands across the card from its feet, metres.
fn across_of(corner: vec2f) -> f32 {
  return corner.x * card.size.x - card.root.x;
}

// A corner where it stands from the eye, the card's face turned along 'right' and its height along 'up'.
fn card_point(corner: vec2f, right: vec2f, up: vec3f) -> vec3f {
  return vec3f(card.feet.xy + right * across_of(corner), card.feet.z) + up * (card.root.y - corner.y * card.size.y);
}

// Which way a card stands up from its feet: straight up, or, for one that faces the eye (size.z), leaned square to
// the line from the eye, so a body seen from high above still shows whole.
fn card_up(right: vec2f) -> vec3f {
  if (card.size.z < 0.5) { return vec3f(0.0, 0.0, 1.0); }
  return normalize(cross(normalize(card.feet.xyz), vec3f(right, 0.0)));
}

fn texel_at(corner: vec2f) -> vec2i {
  let size = vec2f(textureDimensions(picture));
  var at = corner;
  if (card.feet.w > 0.5) { at.x = 1.0 - at.x; }
  return vec2i(min(at * size, size - 1.0));
}

// The picture's texel its feet stand on.
fn root_texel() -> vec2f {
  let size = vec2f(textureDimensions(picture));
  let across = card.root.x / card.size.x;
  return vec2f(select(across, 1.0 - across, card.feet.w > 0.5), card.root.y / card.size.y) * size;
}

fn picture_at(corner: vec2f) -> vec4f {
  return textureLoad(picture, texel_at(corner), 0);
}
`;

/** The cards turned to the eye about their upright, lit through the sun's shadows, and their contact shades. */
export const SHADER = /* wgsl */ `
${CARD}
${SHADOW_WGSL}
${STATUS_WGSL}

struct Out { @builtin(position) position: vec4f, @location(0) corner: vec2f, @location(1) from_eye: vec3f }

@vertex fn card_vertex(@builtin(vertex_index) index: u32) -> Out {
  let corner = CORNERS[index];
  let offset = card_point(corner, view.right.xy, card_up(view.right.xy));
  var out: Out;
  out.position = view.from_eye * vec4f(offset, 1.0);
  // A smear stands a hair behind its figure (depth is reversed), so the figure is drawn over it.
  if (card.tint.w > 0.5) { out.position.z = out.position.z * 0.999; }
  out.corner = corner;
  out.from_eye = offset;
  return out;
}

// A figure in a shadow keeps what the land's ambient light gives an upright face: at a clear noon about half its
// sunlit colour.
const SHADED = 0.55;
${LATTICE_SHADE_WGSL}

// How far up from its feet a figure on a city's ground is pulled nearer as that ground is, fading to none: its soles win
// over the slabs under them, and nothing at its body's height (a hit's star, a weapon's glow) moves in depth.
const FEET_BAND_M = 0.25;
struct Drawn { @location(0) colour: vec4f, @builtin(frag_depth) depth: f32 }

@fragment fn card_fragment(in: Out) -> Drawn {
  let root = root_texel();
  let at = card_texel(card.status, card.look, texel_at(in.corner), vec2i(textureDimensions(picture)), root);
  if (at.x < 0) { discard; }
  let texel = textureLoad(picture, at, 0);
  if (texel.a < 0.5) { discard; }
  // A figure's shadow is drawn from its card turned square to the sun about its feet. A point of the card the eye sees
  // that lies behind that one from the sun is asked of the map from past it, so a figure never shades itself.
  // The way the light runs over the ground, away from the key light, and how much of a step along it is across.
  let toward = key_toward();
  let light_across = -normalize(toward.xy + vec2f(1e-6, 0.0));
  let behind = max(across_of(in.corner) * dot(view.right.xy, light_across), 0.0);
  let lifted = in.from_eye + toward * (behind / max(length(toward.xy), 0.05) + 0.15);
  let sun = sunlit(lifted, toward) * sky_dapple(in.from_eye);
  let shaded_light = sky_ambient(vec3f(0.0)) * (SHADED / 0.35);
  // The card faces the eye: a lamp before it lights it, one behind it hardly.
  let facing = normalize(vec3f(-in.from_eye.xy, 0.0) + vec3f(1e-4, 0.0, 0.0));
  let lamps = sky_lamps(in.from_eye, facing);
  var light = mix(shaded_light, shaded_light + sky_state.key_light.rgb * (1.0 - SHADED), sun) + lamps;
  // A Lattice figure is shaded darker than a man, but for its crystal's bright points, which glow (latticeShade.ts).
  if (card.size.w > 0.5) { light = lattice_lit(texel.rgb, light); }
  // Where no sun shines (a dungeon), the light the page found where the figure stands.
  let lit = select(texel.rgb * light, texel.rgb * card.light.rgb, card.light.w > 0.5);
  // What befalls the figure shows in its own pixels, unshaded: a flash, its statuses, its death.
  let shown = card_shade(card.status, card.look, card.tint, picture, at, lit, root);
  if (shown.a < 0.5) { discard; }
  let near_feet = view.right.w * (1.0 - smoothstep(0.0, FEET_BAND_M, in.from_eye.z - card.feet.z));
  let clip = view.from_eye * vec4f(pulled(in.from_eye, in.from_eye.z + view.right.z), 1.0);
  // A smear keeps standing a hair behind its figure, as its vertices put it.
  let feet_depth = select(clip.z / clip.w, clip.z / clip.w * 0.999, card.tint.w > 0.5);
  // Underground (key_light.w, where all is dark), a figure fades into the dark as the stone round it does.
  let far = sky_state.key_light.w;
  let dark = select(0.0, smoothstep(far / 3.0, far, length(in.from_eye)), far > 0.0);
  return Drawn(vec4f(mix(shown.rgb, sky_state.fog.rgb, dark), 1.0), mix(in.position.z, feet_depth, near_feet));
}

// A figure's contact shade: a soft dark disc on the ground at its feet. Where the near shadow map holds the figure's
// own shadow it stays under the feet; past it, it leans a little the way the sun throws shadows and stands in for
// one, so a card still stands on the ground and not over it.
const SHADE_SEGMENTS = 12u;
struct Shade { @builtin(position) position: vec4f, @location(0) rim: f32, @location(1) darkness: f32 }

@vertex fn shade_vertex(@builtin(vertex_index) index: u32) -> Shade {
  let corner = index % 3u;
  let angle = f32(index / 3u + select(0u, 1u, corner == 2u)) / f32(SHADE_SEGMENTS) * 6.2831853;
  let rim = select(1.0, 0.0, corner == 0u);
  let light = shadow.near * vec4f(card.feet.xyz, 1.0);
  let own = shadow.map.w > 0.5 && max(abs(light.x), abs(light.y)) < 0.8;
  let lean = select(-key_toward().xy / key_toward().z * card.size.y * 0.25, vec2f(0.0), own);
  let radius = vec2f(0.45, 0.45) * rim * select(1.0, 0.75, own);
  let offset = vec3f(card.feet.xy + lean * 0.5 * rim + vec2f(cos(angle), sin(angle)) * radius, card.feet.z + 0.03);
  var out: Shade;
  // On a city's ground, pulled as that ground is, so the shade shows over the slab it lies on.
  out.position = view.from_eye * vec4f(select(offset, pulled(offset, offset.z + view.right.z), view.right.w > 0.5), 1.0);
  out.rim = rim;
  out.darkness = select(0.42, 0.3, own);
  return out;
}

@fragment fn shade_fragment(shade: Shade) -> @location(0) vec4f {
  let soft = 1.0 - shade.rim * shade.rim;
  return vec4f(0.0, 0.0, 0.0, shade.darkness * soft * soft);
}
`;

/** A card's depth along the sun, for the near shadow map: turned square to the sun about its feet, the picture kept
 *  the way round the eye sees it, and anything clear cut away. */
export const CAST_SHADER = /* wgsl */ `
${CARD}
${SHADOW_CAST_WGSL}

struct Shadowed { @builtin(position) position: vec4f, @location(0) corner: vec2f }

@vertex fn card_cast(@builtin(vertex_index) index: u32) -> Shadowed {
  let corner = CORNERS[index];
  let square = normalize(vec2f(-key_toward().y, key_toward().x) + vec2f(1e-6, 0.0));
  let right = select(-square, square, dot(square, view.right.xy) >= 0.0);
  var out: Shadowed;
  out.position = shadow.from_eye * vec4f(card_point(corner, right, vec3f(0.0, 0.0, 1.0)), 1.0);
  out.corner = corner;
  return out;
}

@fragment fn card_cast_fragment(in: Shadowed) {
  if (picture_at(in.corner).a < 0.5) { discard; }
}
`;

/** A figure that throws no shadow and has no contact shade: a Veiled one, all but unseen, one still arriving, or a
 *  thing hovering over the ground as a drop does. */
const unshaded = (figure: CardAt | undefined) => !!figure?.veiled || !!figure?.arrival || !!figure?.hovers;

/** Every card's terms in one buffer, a slot apart, and each composed picture's group, made once a picture and read at
 *  a card's slot: a figure's frame changing finds its picture's group made. The groups go with their pictures. */
interface CardSlots {
  readonly buffer: GPUBuffer;
  readonly values: Float32Array;
  readonly offsets: Uint32Array;
  readonly groups: WeakMap<GPUTexture, GPUBindGroup>;
}

/** The frame's cards: each figure's, then each smear's; each card's group, and whether the view sees it and whether
 *  it casts into the near map. Kept from frame to frame, its lists rewritten by count. */
interface Shown {
  fromEye: Float32Array | null;
  figures: readonly CardAt[] | null;
  count: number;
  readonly cards: CardAt[];
  readonly groups: (GPUBindGroup | null)[];
  seen: Uint8Array;
  casts: Uint8Array;
}

/** What the last frame saw, for the next frame's poses (`poseDue`): its view's planes, its eye, its yaw and how far it
 *  turned, and how many frames have been drawn. */
interface Sight {
  readonly fromEye: Float32Array;
  readonly planes: Planes;
  readonly eye: readonly [number, number, number];
  readonly yaw: number;
  readonly turn: number;
  readonly frame: number;
}

const low: [number, number, number] = [0, 0, 0];
const high: [number, number, number] = [0, 0, 0];

/** Four numbers into `values` from `start`, one at a time: every card's each frame, so no list is made for them. */
function putFour(values: Float32Array, start: number, first: number, second: number, third: number, fourth: number) {
  values[start] = first;
  values[start + 1] = second;
  values[start + 2] = third;
  values[start + 3] = fourth;
}

/** Draws the forge's figures into the scene's pass, after the land and before the water, and their shadows into the
 *  sun's near map before that: only those the view sees, and of those casting only those whose shadow may reach the
 *  map's square. */
export class FigureView implements CardMaker {
  private readonly gpu: Gpu;
  private readonly pipeline: GPURenderPipeline;
  private readonly shade: GPURenderPipeline;
  private readonly cast: GPURenderPipeline;
  private readonly cardLayout: GPUBindGroupLayout;
  private readonly viewBuffer: GPUBuffer;
  private readonly viewGroup: GPUBindGroup;
  private readonly viewValues = new Float32Array(VIEW_BYTES / 4);
  /** A card's slot in the cards' buffer, in bytes: a card's terms, rounded up to the device's step for an offset. */
  private readonly slotBytes: number;
  private slots: CardSlots | null = null;
  private readonly shown: Shown = {
    fromEye: null,
    figures: null,
    count: 0,
    cards: [],
    groups: [],
    seen: new Uint8Array(0),
    casts: new Uint8Array(0),
  };
  private sight: Sight | null = null;
  private readonly glows: GlowCards;

  constructor(gpu: Gpu) {
    this.gpu = gpu;
    const { device } = gpu;
    const step = device.limits.minUniformBufferOffsetAlignment;
    this.slotBytes = Math.ceil(CARD_BYTES / step) * step;
    const module = device.createShaderModule({ code: SHADER });
    const castModule = device.createShaderModule({ code: CAST_SHADER });
    const viewLayout = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: SHADER_STAGE.vertex | SHADER_STAGE.fragment, buffer: {} }],
    });
    this.cardLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: SHADER_STAGE.vertex | SHADER_STAGE.fragment, buffer: { hasDynamicOffset: true } },
        { binding: 1, visibility: SHADER_STAGE.fragment, texture: {} },
      ],
    });
    const shadows = shadowLayouts(device);
    const sky = skyUniformFor(device);
    const drawLayout = device.createPipelineLayout({
      bindGroupLayouts: [viewLayout, shadows.receiver, this.cardLayout, sky.layout],
    });
    this.pipeline = device.createRenderPipeline({
      layout: drawLayout,
      vertex: { module, entryPoint: 'card_vertex' },
      fragment: { module, entryPoint: 'card_fragment', targets: [{ format: gpu.format }] },
      depthStencil: { format: REVERSED_DEPTH.format, depthWriteEnabled: true, depthCompare: REVERSED_DEPTH.compare },
      multisample: { count: SAMPLES },
    });
    // The shade only darkens what is under it, as the plants' contact shades do.
    const darken: GPUBlendState = {
      color: { srcFactor: 'zero', dstFactor: 'one-minus-src-alpha', operation: 'add' },
      alpha: { srcFactor: 'zero', dstFactor: 'one', operation: 'add' },
    };
    this.shade = device.createRenderPipeline({
      layout: drawLayout,
      vertex: { module, entryPoint: 'shade_vertex' },
      fragment: { module, entryPoint: 'shade_fragment', targets: [{ format: gpu.format, blend: darken }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: REVERSED_DEPTH.format, depthWriteEnabled: false, depthCompare: REVERSED_DEPTH.compare },
      multisample: { count: SAMPLES },
    });
    this.cast = device.createRenderPipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [viewLayout, shadows.caster, this.cardLayout, sky.layout],
      }),
      vertex: { module: castModule, entryPoint: 'card_cast' },
      fragment: { module: castModule, entryPoint: 'card_cast_fragment', targets: [] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less' },
    });
    this.glows = new GlowCards(gpu, gpu.format, REVERSED_DEPTH.format, SAMPLES);
    this.viewBuffer = device.createBuffer({
      size: VIEW_BYTES,
      usage: BUFFER_USAGE.uniform | BUFFER_USAGE.copyDestination,
    });
    this.viewGroup = device.createBindGroup({
      layout: viewLayout,
      entries: [{ binding: 0, resource: { buffer: this.viewBuffer } }],
    });
  }

  /** A composed picture as a texture the figures can be drawn with. */
  card(pixels: Uint8Array, width: number, height: number, root: readonly [number, number]): Card {
    const texture = this.gpu.device.createTexture({
      size: [width, height],
      format: 'rgba8unorm',
      usage: TEXTURE_USAGE.textureBinding | TEXTURE_USAGE.copyDestination,
    });
    this.gpu.device.queue.writeTexture({ texture }, pixels, { bytesPerRow: width * 4 }, [width, height]);
    return { texture, width, height, root };
  }

  /** An outline's field as a texture its glow is drawn with. */
  glow(field: GlowField): GPUTexture {
    return this.card(field.data, field.width, field.height, [0, 0]).texture;
  }

  /** Whether the figure numbered `id`, its `feet` in world metres, is posed this frame: by its distance along the
   *  ground from the last frame's eye (`poseEvery`), or as one far off where that frame's view, led by its turn, did
   *  not see it; each on frames of its own. Every frame before the first is drawn. */
  poseDue(id: number, feet: readonly [number, number, number]): boolean {
    const sight = this.sight;
    if (!sight) return true;
    const [x, y, z] = [feet[0] - sight.eye[0], feet[1] - sight.eye[1], feet[2] - sight.eye[2]];
    const distance = Math.hypot(x, y);
    const seen = sphereSeen(sight.planes, x, y, z, FIGURE_REACH_M + leadMargin(distance, sight.turn));
    return cadenceDue(sight.frame, id, seen ? poseEvery(distance) : UNSEEN_EVERY);
  }

  /** The cards' slots for at least `count` cards: grown to a power of two when they hold fewer, which makes every
   *  picture's group again. */
  private slotsFor(count: number): CardSlots {
    if (this.slots && this.slots.offsets.length >= count) return this.slots;
    const room = Math.max(MOST_FIGURES_AT_FIRST, 2 ** Math.ceil(Math.log2(Math.max(1, count))));
    this.slots?.buffer.destroy();
    const buffer = this.gpu.device.createBuffer({
      size: room * this.slotBytes,
      usage: BUFFER_USAGE.uniform | BUFFER_USAGE.copyDestination,
    });
    const offsets = Uint32Array.from({ length: room }, (unused, slot) => slot * this.slotBytes);
    this.slots = { buffer, values: new Float32Array((room * this.slotBytes) / 4), offsets, groups: new WeakMap() };
    [this.shown.seen, this.shown.casts] = [new Uint8Array(room), new Uint8Array(room)];
    return this.slots;
  }

  /** A picture's group, made the first time it is drawn. */
  private groupOf(slots: CardSlots, texture: GPUTexture): GPUBindGroup {
    let group = slots.groups.get(texture);
    if (!group) {
      group = this.gpu.device.createBindGroup({
        layout: this.cardLayout,
        entries: [
          { binding: 0, resource: { buffer: slots.buffer, size: CARD_BYTES } },
          { binding: 1, resource: texture.createView() },
        ],
      });
      slots.groups.set(texture, group);
    }
    return group;
  }

  /** Finds once a frame which cards the view sees and which cast into the near map (`shadow` on), and writes the
   *  view's terms and each of those cards' for its shadow's pass and its own; `light` lights each figure in place of
   *  the sun. */
  private prepare(
    fromEye: Float32Array,
    eye: readonly [number, number, number],
    yaw: number,
    figures: readonly CardAt[],
    shadow?: ShadowMap,
    light?: Light,
    onCity = false,
  ): Shown {
    // The view is written each call, so the draw's word on the city's ground (its eye's height and whether the figures
    // stand on the city's ground, for the feet's pull) is the one its pass reads.
    const { queue } = this.gpu.device;
    this.viewValues.set(fromEye);
    this.viewValues.set([Math.cos(yaw), Math.sin(yaw), eye[2], onCity ? 1 : 0], 16);
    queue.writeBuffer(this.viewBuffer, 0, this.viewValues);
    const shown = this.shown;
    if (shown.fromEye === fromEye && shown.figures === figures) return shown;
    [shown.fromEye, shown.figures] = [fromEye, figures];
    // Each card, then again as its smear where its own swing leaves one: its shape above the hips, shifted back
    // along the stroke and standing behind it.
    let count = 0;
    for (const figure of figures) shown.cards[count++] = figure;
    for (const figure of figures) if (figure.smear) shown.cards[count++] = figure;
    if (shown.cards.length !== count) shown.cards.length = count;
    shown.count = count;
    const slots = this.slotsFor(count);
    const { sight } = this;
    const again = sight?.fromEye === fromEye;
    const turn = !sight ? 0 : again ? sight.turn : turnBetween(sight.yaw, yaw);
    const planes = viewPlanes(fromEye);
    const { along } = sunAxes();
    const lean = Math.hypot(along[0], along[1]) / Math.max(Math.abs(along[2]), 1e-3);
    const casting = shadow?.active === true;
    const time = statusClock();
    const floats = this.slotBytes / 4;
    for (let index = 0; index < count; index++) {
      const shownCard = shown.cards[index] as CardAt;
      const { card, x, y, z, flip, scale = 1 } = shownCard;
      const metres = scale / PX_PER_M;
      const smear = index >= figures.length ? shownCard.smear : null;
      const [across, up] = smear ? [smear.across * metres, smear.up * metres] : [0, 0];
      const feetX = x - eye[0] + Math.cos(yaw) * across;
      const feetY = y - eye[1] + Math.sin(yaw) * across;
      const feetZ = z - eye[2] + up;
      const rootX = (flip ? card.width - card.root[0] : card.root[0]) * metres;
      const [width, height, rootY] = [card.width * metres, card.height * metres, card.root[1] * metres];
      const reach = cardReach(width, height, rootX, rootY, lean) + leadMargin(Math.hypot(feetX, feetY), turn);
      sphereBox(low, high, feetX, feetY, feetZ, reach);
      const seen = boxSeen(planes, low, high);
      const casts = casting && !smear && !unshaded(shownCard) && shadow.reaches(low, high, NEAR);
      shown.seen[index] = seen ? 1 : 0;
      shown.casts[index] = casts ? 1 : 0;
      shown.groups[index] = seen || casts ? this.groupOf(slots, card.texture) : null;
      if (!seen && !casts) continue;
      const { values } = slots;
      const start = index * floats;
      putFour(values, start, feetX, feetY, feetZ, flip ? 1 : 0);
      putFour(values, start + 4, width, height, shownCard.facesEye ? 1 : 0, shownCard.crystal ? 1 : 0);
      putFour(values, start + 8, rootX, rootY, 0, 0);
      cardLookInto(values, start + 12, shownCard, time, !!smear);
      const [red, green, blue] = light ? light([x, y, z + LIT_AT_M]) : NO_LIGHT;
      putFour(values, start + 12 + CARD_LOOK_FLOATS, red, green, blue, light ? 1 : 0);
    }
    shown.groups.length = count;
    if (count > 0) queue.writeBuffer(slots.buffer, 0, slots.values, 0, count * floats);
    // A frame that draws a second list of figures from the same eye counts once.
    if (!again)
      this.sight = { fromEye, planes, eye: [eye[0], eye[1], eye[2]], yaw, turn, frame: (sight?.frame ?? 0) + 1 };
    return shown;
  }

  /** Draws the figures' shadows into the sun's near map (they are near the eye; far off their contact shades stand
   *  in), from an eye at `eye` (world metres) looking along `yaw`. */
  castInto(
    pass: GPURenderPassEncoder,
    fromEye: Float32Array,
    eye: readonly [number, number, number],
    yaw: number,
    figures: readonly CardAt[],
    shadow: ShadowMap,
  ): void {
    if (figures.length === 0 || shadow.cascade !== NEAR) return;
    const shown = this.prepare(fromEye, eye, yaw, figures, shadow);
    const { offsets } = this.slotsFor(shown.count);
    pass.setPipeline(this.cast);
    pass.setBindGroup(0, this.viewGroup);
    skyUniformFor(this.gpu.device).bindShared(pass);
    pass.setBindGroup(1, shadow.casterGroup(this.cast));
    for (let index = 0; index < figures.length; index++) {
      const group = shown.groups[index];
      if (!shown.casts[index] || !group) continue;
      pass.setBindGroup(2, group, offsets, index, 1);
      pass.draw(6);
    }
  }

  /** Draws the figures from an eye at `eye` (world metres), with the camera's view-projection measured from the eye
   *  and its yaw (radians clockwise from north), in the sun's shadows when a map is given, or lit by `light` where
   *  no sun shines; then the outlines of the weapons that glow. `onCity`: they stand where a city's ground is drawn,
   *  nearer in depth than it stands, and their feet are drawn so too. */
  drawInto(
    pass: GPURenderPassEncoder,
    fromEye: Float32Array,
    eye: readonly [number, number, number],
    yaw: number,
    figures: readonly CardAt[],
    shadow?: ShadowMap,
    light?: Light,
    onCity = false,
  ): void {
    if (figures.length === 0) return;
    const shown = this.prepare(fromEye, eye, yaw, figures, shadow, light, onCity);
    const { offsets } = this.slotsFor(shown.count);
    pass.setBindGroup(0, this.viewGroup);
    skyUniformFor(this.gpu.device).bindShared(pass);
    pass.setBindGroup(1, (shadow ?? ShadowMap.none(this.gpu)).receiverGroup(this.pipeline));
    pass.setPipeline(this.shade);
    for (let index = 0; index < figures.length; index++) {
      const group = shown.groups[index];
      if (!shown.seen[index] || !group || unshaded(figures[index])) continue;
      pass.setBindGroup(2, group, offsets, index, 1);
      pass.draw(36);
    }
    pass.setPipeline(this.pipeline);
    for (let index = 0; index < shown.count; index++) {
      const group = shown.groups[index];
      if (!shown.seen[index] || !group) continue;
      pass.setBindGroup(2, group, offsets, index, 1);
      pass.draw(6);
    }
    // A Veiled figure's weapon shows no outline, as it is all but unseen; nor does one still arriving.
    const glowing = figures.filter(
      ({ card, veiled, arrival }, index) => card.glow && !veiled && !arrival && shown.seen[index] === 1,
    );
    this.glows.draw(
      pass,
      fromEye,
      [Math.cos(yaw), Math.sin(yaw)],
      performance.now() / 1000,
      glowing.map(({ card, x, y, z, flip, scale = 1, surge }) => {
        const [fromX, fromY, fromZ] = [x - eye[0], y - eye[1], z - eye[2]];
        return { card, x: fromX, y: fromY, z: fromZ, flip, metres: scale / PX_PER_M, surge };
      }),
    );
  }
}
