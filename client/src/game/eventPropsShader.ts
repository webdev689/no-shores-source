// The public events' props' shaders (eventPropsDraw.ts draws with them): each material's colour worked by code over
// the module's own frame, lit by the sky, the sun's shadows and the lamps; the Lattice's crystal as crystal.ts draws
// it; a fire and stained glass their own light; still water rippling and catching the lights; a way opened drawn dark;
// and underground (a Breach's run) all fading into the dark with distance.
import { LIGHT_WGSL } from '../combat/lightLayer.ts';
import { SHADOW_CAST_WGSL, SHADOW_WGSL } from '../shadow.ts';
import { SHARED_WGSL } from '../water/waterCommon.ts';
import { CRYSTAL_HOT, CRYSTAL_WGSL } from '../city/crystal.ts';
import { CLOTH_COLOURS } from '../city/pictures.ts';
import { LIGHT_MOTION_WGSL } from '../sky/flicker.ts';
import { LAMPS_MOST } from '../sky/skyUniform.ts';
import { MATERIALS, type Material } from './eventPropsPack.ts';

/** A material's number in the shader, as WGSL. */
const id = (material: Material): string => `${MATERIALS.indexOf(material)}u`;
/** A colour as WGSL. */
const rgb = ([red, green, blue]: readonly [number, number, number]): string =>
  `vec3f(${red.toFixed(3)}, ${green.toFixed(3)}, ${blue.toFixed(3)})`;
/** Each cloth as the city dyes it, its weave a little uneven. */
const CLOTH_CASES = Object.entries(CLOTH_COLOURS)
  .map(([cloth, dye]) => `case ${id(cloth as Material)}: { return mix(${rgb(dye)} * 0.82, ${rgb(dye)}, fine); }`)
  .join('\n    ');
/** How far toward the eye a point of a chasm is drawn, as a share of its distance: enough to stand clear of the land
 *  round the mouth, too little to come in front of a rise or a house nearer the eye. */
const CHASM_LEAD = 0.04;
/** A prop's look (its table row's last four): x 1 for the Tithe's grey canvas, 2 for a way opened, drawn dark. */
export const LOOK = { grey: 1, dark: 2 } as const;

const PLACE_WGSL = /* wgsl */ `
// x: the scene's seconds, which the lamps flicker by.
struct View { from_eye: mat4x4f, time: vec4f }
@group(0) @binding(0) var<uniform> view: View;
struct Prop { place: vec4f, shape: vec4f, about: vec4f, look: vec4f }
@group(2) @binding(0) var<storage, read> props: array<Prop>;

struct Vertex {
  @location(0) position: vec3f,
  @location(1) normal: vec4f,
  @location(2) material: vec4u,
  @builtin(instance_index) prop: u32,
}

struct Placed { from_eye: vec3f, normal: vec3f, below: f32 }

// A vertex of the module where its prop stands, measured from the eye: opened (widened from a line and deepened) or
// risen out of the ground and rolled about its own y (an airship leaning; a module that opens has no roll, its about.w
// its lips' count), swung up about its own x at its origin (a lid's hinge, an airship's nose), scaled, and turned
// clockwise from north. 'below' is how far under its foot it stands once risen: what is under the ground is not drawn.
fn placed(vertex: Vertex) -> Placed {
  let prop = props[vertex.prop];
  var local = vertex.position;
  var normal = vertex.normal.xyz;
  var below = 1.0;
  // A way opened is the flat dark of its doorway, not the module's shape: each vertex snapped to the corner of the
  // doorway's opening (look.y either side, look.z high) on its side and half, on the doorway's face (look.w in front
  // of the foot). Every triangle is then half the opening or none, and together they fill it, with no ragged edge
  // standing proud of the jambs and no gap between the module's pieces.
  if prop.look.x > ${LOOK.dark - 0.5} {
    let way = prop.look.yzw;
    let side = select(-way.x, way.x, local.x >= 0.0);
    local = vec3f(side, way.z + sign(way.z) * 0.03, select(0.0, way.y, local.z >= way.y * 0.5));
    normal = vec3f(0.0, 1.0, 0.0);
  }
  if prop.about.x > 0.5 {
    let across = mix(0.04, 1.0, prop.shape.y);
    let deep = mix(0.08, 1.0, prop.shape.y);
    local = vec3f(local.x, local.y * across, local.z * deep);
    normal = vec3f(normal.x * across * deep, normal.y * deep, normal.z * across);
  } else {
    local.z -= (1.0 - prop.shape.y) * prop.about.y;
    // Cut at the ground only while rising: standing, a lid's hasp hangs under its hinge and stays drawn.
    below = select(1.0, local.z, prop.shape.y < 1.0);
    let roll = vec2f(cos(prop.about.w), sin(prop.about.w));
    local = vec3f(local.x * roll.x + local.z * roll.y, local.y, local.z * roll.x - local.x * roll.y);
    normal = vec3f(normal.x * roll.x + normal.z * roll.y, normal.y, normal.z * roll.x - normal.x * roll.y);
  }
  let lid = vec2f(cos(prop.shape.z), sin(prop.shape.z));
  local = vec3f(local.x, local.y * lid.x - local.z * lid.y, local.y * lid.y + local.z * lid.x);
  normal = vec3f(normal.x, normal.y * lid.x - normal.z * lid.y, normal.y * lid.y + normal.z * lid.x);
  local *= prop.shape.x;
  let turn = vec2f(cos(prop.place.w), sin(prop.place.w));
  let world = vec3f(local.x * turn.x - local.y * turn.y, local.x * turn.y + local.y * turn.x, local.z);
  normal = vec3f(normal.x * turn.x - normal.y * turn.y, normal.x * turn.y + normal.y * turn.x, normal.z);
  return Placed(world + prop.place.xyz, normal, below);
}
`;

export const PROPS_SHADER = /* wgsl */ `
${SHARED_WGSL}
${SHADOW_WGSL}
${CRYSTAL_WGSL}
${LIGHT_WGSL}
${PLACE_WGSL}
${LIGHT_MOTION_WGSL}

// How a prop's glow moves: with its own lamp where one is lit near it (a fire pit's flame with its light, a crystal's
// core with its), a 'stone' (crystal) only with a stone's; else by the prop it is, all of it together.
fn glow_motion(from_eye: vec3f, prop: u32, stone: bool) -> f32 {
  let own = select(1.0, 3.0, stone) + min(light_phase(f32(prop) * 0.618), 0.999);
  let near = sky_lamp_motion(from_eye);
  let keeps = near > 0.0 && (floor(near) == 3.0) == stone;
  return light_motion(select(own, near, keeps), view.time.x);
}

const AMBIENT = 0.35;
const BOUNCE = 0.15;
const CRYSTAL = ${id('crystal')};
const WATER = ${id('water')};
const CHASM_LEAD = ${CHASM_LEAD};
// Each opening module's lips, station by station along its x: (x, the low lip's y, the high lip's y, 0).
@group(2) @binding(1) var<storage, read> lips: array<vec4f>;

struct Out {
  @builtin(position) clip: vec4f,
  @location(0) normal: vec3f,
  @location(1) from_eye: vec3f,
  @location(2) @interpolate(flat) material: u32,
  @location(3) glow: f32,
  @location(4) below: f32,
  @location(5) local: vec3f,
  @location(6) @interpolate(flat) prop: u32,
}

@vertex fn prop_vertex(vertex: Vertex) -> Out {
  let at = placed(vertex);
  var out: Out;
  out.clip = view.from_eye * vec4f(at.from_eye, 1.0);
  out.normal = at.normal;
  out.from_eye = at.from_eye;
  out.material = vertex.material.x;
  out.glow = max(vertex.normal.w, 0.0) * props[vertex.prop].shape.w;
  out.below = at.below;
  out.local = vertex.position;
  out.prop = vertex.prop;
  return out;
}

// Whether a point of an opening module's own frame (at its foot, its width undone) lies between its lips.
fn within_lips(first: u32, count: u32, at: vec2f) -> bool {
  for (var k = first; k + 1u < first + count; k++) {
    let here = lips[k];
    let next = lips[k + 1u];
    if at.x >= here.x && at.x <= next.x {
      let share = (at.x - here.x) / max(next.x - here.x, 1e-4);
      return at.y >= mix(here.y, next.y, share) && at.y <= mix(here.z, next.z, share);
    }
  }
  return false;
}

// The depth a fragment is drawn at: its own, but for a point of a chasm under the ground, where the eye's line to it
// crosses the land at the foot, a little toward the eye (the deeper along the line, the less, so the chasm keeps its
// own order); -1 where that crossing lies outside the lips, or the eye is under the foot, for the land hides it there.
fn chasm_depth(in: Out) -> f32 {
  let prop = props[in.prop];
  if prop.about.x < 0.5 || in.local.z > -0.001 { return in.clip.z; }
  let foot = prop.place.z;
  let at = in.from_eye;
  if foot >= 0.0 || at.z >= foot { return -1.0; }
  let reach = foot / at.z;
  let off = at.xy * reach - prop.place.xy;
  let turn = vec2f(cos(prop.place.w), sin(prop.place.w));
  let own = vec2f(off.x * turn.x + off.y * turn.y, off.y * turn.x - off.x * turn.y) / prop.shape.x;
  let across = mix(0.04, 1.0, prop.shape.y);
  if !within_lips(u32(prop.about.z), u32(prop.about.w), vec2f(own.x, own.y / across)) { return -1.0; }
  let clip = view.from_eye * vec4f(at * (reach * (1.0 - CHASM_LEAD * 0.5 * (1.0 + reach))), 1.0);
  return clip.z / clip.w;
}

// How far a point is lost in the dark, 0 to 1: underground (key_light.w, where all is dark), fading from a third of
// that way; none under the open sky.
fn dark_share(from_eye: vec3f) -> f32 {
  let far = sky_state.key_light.w;
  if far <= 0.0 { return 0.0; }
  return smoothstep(far / 3.0, far, length(from_eye));
}

fn in_dark(colour: vec4f, from_eye: vec3f) -> vec4f {
  return vec4f(mix(colour.rgb, sky_state.fog.rgb, dark_share(from_eye)), colour.a);
}

fn pane_hash(cell: vec2f) -> f32 {
  return fract(sin(dot(cell, vec2f(12.9898, 78.233))) * 43758.5453);
}

// Stained glass lit from behind, as its own light: small panes of ruby, cobalt, amber, green and pale, each a little
// streaked, held in dark lead strips, laid across the face the glass looks out of (its normal in the module's frame).
fn glass_colour(local: vec3f, normal: vec3f) -> vec3f {
  let n = abs(normal);
  var plane = local.xy;
  if n.y >= n.x && n.y >= n.z { plane = local.xz; } else if n.x >= n.z { plane = local.yz; }
  let at = plane * 2.6;
  let cell = floor(at);
  let inside = fract(at);
  let edge = min(min(inside.x, 1.0 - inside.x), min(inside.y, 1.0 - inside.y));
  let lead = 1.0 - smoothstep(0.035, 0.08, edge);
  let pick = pane_hash(cell);
  var pane = vec3f(1.25, 1.1, 0.8);
  if pick < 0.3 { pane = vec3f(1.5, 0.16, 0.14); }
  else if pick < 0.55 { pane = vec3f(0.22, 0.38, 1.6); }
  else if pick < 0.75 { pane = vec3f(1.6, 0.9, 0.22); }
  else if pick < 0.87 { pane = vec3f(0.3, 1.0, 0.38); }
  let streak = 0.7 + 0.45 * value_noise(vec2f(plane.x * 9.0 + plane.y * 3.0, plane.y * 1.5));
  return mix(pane * streak, vec3f(0.025, 0.025, 0.03), lead);
}

// Still water's face stirred by a slow ripple, two crossing swells over the module's frame, as the tilt they give it.
fn water_ripple(local: vec3f) -> vec2f {
  let seconds = sky_state.puddle_place.w;
  return vec2f(
    sin(local.x * 2.1 + seconds * 0.8 + sin(local.y * 1.3 + seconds * 0.3)),
    sin(local.y * 2.7 - seconds * 0.6 + sin(local.x * 1.7)),
  ) * 0.05;
}

// The lamps' light on a prop's face, as sky_lamps lays it but for the way a face turns to each: none to a face turned
// away from it, and measured toward a point LAMP_LIFT_M over it: a crystal or a flame burns from its whole height, so
// the floor round its foot is lit, not grazed.
const LAMP_LIFT_M = 1.5;
fn prop_lamps(from_eye: vec3f, normal: vec3f) -> vec3f {
  var light = vec3f(0.0);
  let count = min(u32(sky_state.lamp_count.x), ${LAMPS_MOST}u);
  for (var lamp = 0u; lamp < count; lamp++) {
    let place = sky_state.lamps[lamp * 2u];
    let toward = place.xyz - from_eye;
    let near = clamp(1.0 - dot(toward, toward) / (place.w * place.w), 0.0, 1.0);
    // Only a face under the lamp turns to the lifted point: a ceiling over it keeps its own turn.
    let lifted = normalize(toward + vec3f(0.0, 0.0, select(0.0, LAMP_LIFT_M, toward.z >= 0.0)));
    // A face turned away from the lamp takes none of it: no lamp lights a wall's far side through it.
    let facing = select(0.0, 0.15 + 0.85 * max(dot(normal, lifted), 0.0), dot(normal, toward) > 0.0);
    // Falling off a power steeper than the land's lamps: the run's lamps pool round what burns, not wash its floors.
    light += sky_state.lamps[lamp * 2u + 1u].rgb * (near * near * near * near * facing);
  }
  return light;
}

// The lamps on a prop: underground (key_light.w, a Breach's run) its own pooled lamps, else the land's as the land.
fn lamps_on(from_eye: vec3f, normal: vec3f) -> vec3f {
  // A branch, not a select, which would work out both lists of lamps for every pixel.
  if (sky_state.key_light.w > 0.0) {
    return prop_lamps(from_eye, normal);
  }
  return sky_lamps(from_eye, normal);
}

// The lights a wet face mirrors toward the eye: the key light's glint, and each lamp's.
fn water_glint(from_eye: vec3f, facing: vec3f, sun: f32) -> vec3f {
  let mirrored = reflect(normalize(from_eye), facing);
  var glint = sky_state.key_light.rgb * pow(max(dot(mirrored, sky_state.key.xyz), 0.0), 90.0) * sun;
  let count = min(u32(sky_state.lamp_count.x), ${LAMPS_MOST}u);
  for (var lamp = 0u; lamp < count; lamp++) {
    let place = sky_state.lamps[lamp * 2u];
    let toward = place.xyz - from_eye;
    let near = clamp(1.0 - dot(toward, toward) / (4.0 * place.w * place.w), 0.0, 1.0);
    let lined = pow(max(dot(mirrored, normalize(toward)), 0.0), 60.0);
    glint += sky_state.lamps[lamp * 2u + 1u].rgb * (lined * near * 2.0);
  }
  return glint;
}

fn noise3(at: vec3f) -> f32 {
  return value_noise(at.xy + vec2f(at.z * 1.7, at.z * 0.6));
}

// Each material's colour at a point of the module's own frame, worked so a surface reads as what it is: chalk white
// with grey flint in it, turf mottled green and dry, soil dark, timber weathered grey-brown along its grain, canvas
// oiled tan with darker stains and dirtier toward the ground, iron dark with rust, gold, a heap of grain straw-pale;
// plaster lime-pale, shingles dark in courses, bone yellowed, paving in setts, still water deep, a fire's glow.
fn material_colour(material: u32, local: vec3f, grey: bool) -> vec3f {
  let fine = noise3(local * 9.0);
  let broad = noise3(local * 1.3);
  switch material {
    case ${id('stone')}: { return mix(vec3f(0.5, 0.48, 0.45), vec3f(0.62, 0.6, 0.56), fine); }
    case ${id('trim')}: { return mix(vec3f(0.62, 0.52, 0.3), vec3f(0.8, 0.7, 0.44), fine); }
    case ${id('rubble')}: { return mix(vec3f(0.16, 0.13, 0.1), vec3f(0.26, 0.21, 0.16), fine); }
    case ${id('chalk')}: {
      let flint = step(0.86, noise3(local * 14.0));
      return mix(mix(vec3f(0.78, 0.77, 0.72), vec3f(0.9, 0.89, 0.85), broad), vec3f(0.26, 0.26, 0.29), flint);
    }
    case ${id('turf')}: {
      let dry = smoothstep(0.55, 0.85, broad);
      return mix(mix(vec3f(0.17, 0.28, 0.08), vec3f(0.27, 0.38, 0.13), fine), vec3f(0.42, 0.4, 0.2), dry * 0.6);
    }
    case ${id('timber')}: {
      let grain = value_noise(vec2f(local.x * 2.0 + local.y * 2.0, local.z * 30.0 + local.x * 7.0));
      return mix(vec3f(0.3, 0.25, 0.2), vec3f(0.46, 0.4, 0.33), grain * 0.7 + broad * 0.3);
    }
    case ${id('canvas')}: {
      // Oiled canvas, tan (or the Tithe's grey), weathered darker in broad stains, and dirtier toward the ground.
      // The Tithe's banner is its unmarked grey, as its sails are.
      let cloth = select(
        mix(vec3f(0.5, 0.4, 0.26), vec3f(0.62, 0.52, 0.35), fine),
        mix(vec3f(0.42, 0.42, 0.41), vec3f(0.54, 0.54, 0.52), fine),
        grey,
      );
      let stained = smoothstep(0.55, 0.75, noise3(local * 1.7 + vec3f(3.1, 0.0, 1.3))) * 0.45;
      let dirt = 1.0 - smoothstep(0.0, 0.5, local.z);
      return mix(mix(cloth, cloth * vec3f(0.6, 0.56, 0.5), stained), vec3f(0.27, 0.22, 0.16), dirt * 0.5);
    }
    case ${id('iron')}: { return mix(vec3f(0.17, 0.18, 0.2), vec3f(0.34, 0.2, 0.12), smoothstep(0.6, 0.9, fine) * 0.7); }
    case ${id('gold')}: { return mix(vec3f(0.78, 0.58, 0.2), vec3f(0.92, 0.74, 0.34), fine); }
    case ${id('plaster')}: { return mix(vec3f(0.7, 0.66, 0.58), vec3f(0.8, 0.77, 0.7), broad * 0.6 + fine * 0.4); }
    case ${id('roof')}: {
      let course = smoothstep(0.0, 0.25, fract(local.z * 5.0));
      return mix(vec3f(0.17, 0.14, 0.13), mix(vec3f(0.27, 0.22, 0.19), vec3f(0.36, 0.3, 0.25), fine), course);
    }
    case ${id('bone')}: { return mix(vec3f(0.74, 0.69, 0.56), vec3f(0.86, 0.82, 0.71), fine); }
    case ${id('glow')}: { return mix(vec3f(1.9, 1.2, 0.5), vec3f(2.2, 1.6, 0.8), fine); }
    // shade() draws glass itself, across its own face; this stands for a caller with no face to lay it across.
    case ${id('glass')}: { return glass_colour(local, vec3f(0.0, 1.0, 0.0)); }
    ${CLOTH_CASES}
    case ${id('paving')}: {
      let joint = 1.0 - smoothstep(0.0, 0.08, min(fract(local.x * 3.0), fract(local.y * 3.0)));
      return mix(mix(vec3f(0.44, 0.42, 0.38), vec3f(0.56, 0.53, 0.48), fine), vec3f(0.22, 0.21, 0.19), joint);
    }
    case ${id('lawn')}: { return mix(vec3f(0.19, 0.31, 0.1), vec3f(0.29, 0.41, 0.15), fine); }
    case ${id('water')}: { return mix(vec3f(0.05, 0.15, 0.17), vec3f(0.09, 0.22, 0.24), broad); }
    default: { return vec3f(0.5, 0.48, 0.44); }
  }
}

fn shade(in: Out) -> vec4f {
  if in.below < -0.01 { discard; }
  var facing = normalize(in.normal);
  // Cloth is one sheet: its back is lit as its front.
  if dot(facing, in.from_eye) > 0.0 { facing = -facing; }
  let look = props[in.prop].look;
  // A way opened (a gate's doorway to the company it opened to) is the dark beyond, a faint violet low in it.
  if look.x > ${LOOK.dark - 0.5} {
    // By height over its foot in the world, not by the module's own vertices, which no longer stand where drawn.
    let deep = 1.0 - smoothstep(0.0, 3.0, in.from_eye.z - props[in.prop].place.z);
    return vec4f(vec3f(0.006, 0.003, 0.012) + vec3f(0.04, 0.014, 0.08) * deep, 1.0);
  }
  // Only a face lying flat ripples: a fountain's jet is no pool.
  if in.material == WATER && facing.z > 0.7 { facing = normalize(facing + vec3f(water_ripple(in.local), 0.0)); }
  let direct = max(dot(facing, sky_state.key.xyz), 0.0);
  // A face turned from the sun takes no shadow: its map is not read.
  var sun = sky_dapple(in.from_eye);
  if (direct > 0.0) {
    sun *= sunlit(in.from_eye, facing);
  }
  if in.material == CRYSTAL {
    return vec4f(crystal_colour(facing, in.from_eye, in.glow * glow_motion(in.from_eye, in.prop, true), sun), 1.0);
  }
  // A ghost (a piece of decoration being placed) is washed in its tint, its fire too.
  let tint = look.yzw;
  let ghost = any(tint > vec3f(0.0));
  // A fire is its own light, not lit by the sky's.
  if in.material == ${id('glow')} {
    let flame = material_colour(in.material, in.local, false) * glow_motion(in.from_eye, in.prop, false);
    return vec4f(select(flame, mix(flame, tint * 1.4, 0.6), ghost), 1.0);
  }
  // Stained glass is lit from behind, its panes laid across the face it looks out of in the module's own frame.
  if in.material == ${id('glass')} {
    let turn = vec2f(cos(props[in.prop].place.w), sin(props[in.prop].place.w));
    let own = vec3f(facing.x * turn.x + facing.y * turn.y, facing.y * turn.x - facing.x * turn.y, facing.z);
    let panes = glass_colour(in.local, own);
    return vec4f(select(panes, mix(panes, tint * 1.4, 0.6), ghost), 1.0);
  }
  let ambient = AMBIENT + BOUNCE * (1.0 - abs(facing.z));
  let light = sky_ambient(facing) * (ambient / AMBIENT) + sky_direct(facing, sun) * ((1.0 - ambient) / 0.65);
  let grey = abs(look.x - ${LOOK.grey}.0) < 0.5;
  var colour = material_colour(in.material, in.local, grey) * (light + lamps_on(in.from_eye, facing));
  // Metal catches the sun.
  if in.material == ${id('iron')} || in.material == ${id('gold')} {
    let glint = pow(max(dot(reflect(normalize(in.from_eye), facing), sky_state.key.xyz), 0.0), 24.0) * sun;
    colour += sky_state.key_light.rgb * glint * select(0.35, 0.9, in.material == ${id('gold')});
  }
  // Water mirrors the sky toward a grazing eye, and glints with the lights over it.
  if in.material == WATER {
    let glare = 0.02 + 0.5 * pow(1.0 - clamp(dot(facing, -normalize(in.from_eye)), 0.0, 1.0), 5.0);
    colour += sky_state.horizon.rgb * glare + water_glint(in.from_eye, facing, sun);
  }
  if ghost { colour = mix(colour, tint * (light + 0.4), 0.6); }
  return vec4f(colour, 1.0);
}

@fragment fn prop_fragment(in: Out) -> @location(0) vec4f {
  return in_dark(shade(in), in.from_eye);
}

// A module that opens: its chasm seen through its mouth (chasm_depth).
struct Deep { @location(0) colour: vec4f, @builtin(frag_depth) depth: f32 }
@fragment fn chasm_fragment(in: Out) -> Deep {
  let depth = chasm_depth(in);
  if depth < 0.0 { discard; }
  return Deep(in_dark(shade(in), in.from_eye), depth);
}

// The crystal's light, where its core glows brightest (the crystal alone is drawn into it).
@fragment fn light_fragment(in: Out) -> Deep {
  let depth = chasm_depth(in);
  if in.material != CRYSTAL || in.below < -0.01 || depth < 0.0 { discard; }
  let near = 1.0 - dark_share(in.from_eye);
  return Deep(light_of(vec3f(${CRYSTAL_HOT.join(', ')}) * (in.glow * near), 1.0), depth);
}
`;

export const PROPS_CAST_SHADER = /* wgsl */ `
${SHADOW_CAST_WGSL}
${PLACE_WGSL}
@vertex fn cast_vertex(vertex: Vertex) -> @builtin(position) vec4f {
  return shadow.from_eye * vec4f(placed(vertex).from_eye, 1.0);
}
`;
