// An entry's crest on the Playlist screen (`playlistParts.ts` lays it), after the owner's reference, Destiny's Vanguard
// screen: a shield of worked metal, bevelled and studded, a gem at its head and its device raised over a lit field;
// the glow behind it, the dial behind that on the chart, the light that sweeps it as it is lit, and the dot of a
// reward waiting with the ring that spreads from it. Each is drawn once (the sweep once a step) and moved by the
// screen, never drawn again a frame. Chevrons for the Elite Playlist, an eye of the deep for the Abyss Playlist, crossed swords for the Elite
// Dungeon of the week, a crown over the deep for the Abyss's, and a gate under a crystal spire for a Breach.
import type { PlaylistKind } from './playlistWords.ts';

type Context = OffscreenCanvasRenderingContext2D;
type Ink = string | CanvasGradient;

/** A crest's inks: its metal lit, mid and in shade; its field lit and at its edge; its device at its head and its
 *  foot; its gem; and its glow at its strongest, as chosen. */
interface CrestInks {
  readonly metal: readonly [string, string, string];
  readonly field: readonly [string, string];
  readonly device: readonly [string, string];
  readonly gem: string;
  readonly glow: string;
}

const BRASS: CrestInks = {
  metal: ['#f6dc9c', '#c08a3e', '#5e3f17'],
  field: ['#283040', '#0c0e13'],
  device: ['#fffaf0', '#d8c7a0'],
  gem: '#f0c94a',
  glow: 'rgba(243,207,134,0.84)',
};
const DEEP: CrestInks = {
  metal: ['#e6dafb', '#8f6fc4', '#3a2760'],
  field: ['#2b2244', '#0a0811'],
  device: ['#f6f0ff', '#b9a2e6'],
  gem: '#c9a8ff',
  glow: 'rgba(155,120,220,0.96)',
};
const SHUT: CrestInks = {
  metal: ['#7c776d', '#4a4640', '#24221e'],
  field: ['#1a1b1e', '#0b0c0e'],
  device: ['#7a756b', '#58544c'],
  gem: '#4a4640',
  glow: 'rgba(0,0,0,0)',
};
/** What a device's shadow is drawn in, beneath and a little right of it. */
const SHADOW = 'rgba(0,0,0,0.55)';

/** A white tint at `alpha`, fading a picture drawn once; rounded, so a moving one names few colours. */
export const faded = (alpha: number) => `rgba(255,255,255,${Math.round(alpha * 100) / 100})`;

/** How much larger the chosen crest's shield is drawn than the rest. */
export const CHOSEN_SCALE = 1.08;

const inksOf = (kind: PlaylistKind, shut: boolean): CrestInks =>
  shut ? SHUT : kind === 'abyss' || kind === 'week-abyss' || kind === 'breach-hard' ? DEEP : BRASS;

/** The shield every crest is cut as, `side` pixels square: a flat top, its sides curving to a point; `inset` below 1
 *  draws it that much smaller about the square's middle. */
export function shield(context: Context, side: number, inset = 1): void {
  const scaled = (share: number) => side * (0.5 + (share - 0.5) * inset);
  context.beginPath();
  context.moveTo(scaled(0.16), scaled(0.1));
  context.lineTo(scaled(0.84), scaled(0.1));
  context.lineTo(scaled(0.84), scaled(0.5));
  context.quadraticCurveTo(scaled(0.84), scaled(0.78), scaled(0.5), scaled(0.92));
  context.quadraticCurveTo(scaled(0.16), scaled(0.78), scaled(0.16), scaled(0.5));
  context.closePath();
}

/** The field's edge, inside the rim, as a share of the shield. */
const FIELD = 0.86;

/** A rhombus `wide` by `tall` about (x, y), filled. */
function rhombus(context: Context, x: number, y: number, wide: number, tall: number): void {
  context.beginPath();
  context.moveTo(x, y - tall / 2);
  context.lineTo(x + wide / 2, y);
  context.lineTo(x, y + tall / 2);
  context.lineTo(x - wide / 2, y);
  context.closePath();
  context.fill();
}

/** A round stud of `radius` about (x, y): its body in shade, a lit point up and to its left. */
function stud(context: Context, x: number, y: number, radius: number, inks: CrestInks): void {
  context.fillStyle = inks.metal[2];
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = inks.metal[0];
  context.beginPath();
  context.arc(x - radius * 0.3, y - radius * 0.3, radius * 0.5, 0, Math.PI * 2);
  context.fill();
}

/** The shield's metal, `side` pixels square: a shadow under it, the rim lit from the top left, a dark outer edge and a
 *  bright line inside it, the field recessed and lit toward its head, an engraved line round it, five studs on the
 *  rim and a gem at its head. */
function drawShield(context: Context, side: number, inks: CrestInks): void {
  context.save();
  context.shadowColor = 'rgba(0,0,0,0.6)';
  context.shadowBlur = side * 0.06;
  context.shadowOffsetY = side * 0.03;
  shield(context, side);
  context.fillStyle = inks.metal[1];
  context.fill();
  context.restore();
  const metal = context.createLinearGradient(side * 0.16, side * 0.1, side * 0.84, side * 0.92);
  metal.addColorStop(0, inks.metal[0]);
  metal.addColorStop(0.45, inks.metal[1]);
  metal.addColorStop(1, inks.metal[2]);
  context.fillStyle = metal;
  context.fill();
  const hair = Math.max(1, side * 0.01);
  context.lineWidth = Math.max(1, side * 0.012);
  context.strokeStyle = 'rgba(5,6,8,0.9)';
  context.stroke();
  shield(context, side, 0.955);
  context.lineWidth = hair;
  context.strokeStyle = withAlpha(inks.metal[0], 0.55);
  context.stroke();
  const field = context.createRadialGradient(side / 2, side * 0.36, 0, side / 2, side * 0.36, side * 0.5);
  field.addColorStop(0, inks.field[0]);
  field.addColorStop(1, inks.field[1]);
  shield(context, side, FIELD);
  context.fillStyle = field;
  context.fill();
  context.lineWidth = Math.max(1, side * 0.018);
  context.strokeStyle = 'rgba(0,0,0,0.75)';
  context.stroke();
  shield(context, side, FIELD + 0.014);
  context.lineWidth = hair;
  context.strokeStyle = withAlpha(inks.metal[0], 0.35);
  context.stroke();
  shield(context, side, 0.78);
  context.strokeStyle = withAlpha(inks.metal[1], 0.35);
  context.stroke();
  for (const [x, y, radius] of [
    [0.184, 0.128, 0.018],
    [0.816, 0.128, 0.018],
    [0.184, 0.5, 0.015],
    [0.816, 0.5, 0.015],
    [0.5, 0.89, 0.015],
  ] as const)
    stud(context, side * x, side * y, side * radius, inks);
  const gem = context.createLinearGradient(side * 0.465, side * 0.055, side * 0.535, side * 0.145);
  gem.addColorStop(0, '#ffffff');
  gem.addColorStop(0.35, inks.gem);
  gem.addColorStop(1, inks.metal[2]);
  context.fillStyle = gem;
  rhombus(context, side / 2, side * 0.1, side * 0.075, side * 0.095);
  context.lineWidth = Math.max(1, side * 0.008);
  context.strokeStyle = 'rgba(5,6,8,0.9)';
  context.stroke();
}

/** `colour` (#rrggbb) at `alpha`. */
function withAlpha(colour: string, alpha: number): string {
  const channel = (from: number) => Number.parseInt(colour.slice(from, from + 2), 16);
  return `rgba(${channel(1)},${channel(3)},${channel(5)},${alpha})`;
}

/** Draws a device in `ink` over the shield's field, `side` pixels square, its engraved lines in `detail`. */
type Device = (context: Context, side: number, ink: Ink, detail: string) => void;

/** Three chevrons, one over another, under a rank's pip, as a strike playlist's mark. */
const chevrons: Device = (context, side, ink) => {
  context.strokeStyle = ink;
  context.fillStyle = ink;
  context.lineWidth = side * 0.075;
  for (const down of [0.34, 0.48, 0.62]) {
    context.beginPath();
    context.moveTo(side * 0.31, side * down);
    context.lineTo(side / 2, side * (down + 0.11));
    context.lineTo(side * 0.69, side * down);
    context.stroke();
  }
  rhombus(context, side / 2, side * 0.235, side * 0.08, side * 0.1);
};

/** An eye of the deep: rays over a lidded eye, its iris ringed round a slit, and the deep's ripples under it. */
const deepEye: Device = (context, side, ink) => {
  context.strokeStyle = ink;
  context.fillStyle = ink;
  const [x, y] = [side / 2, side * 0.44];
  context.lineWidth = side * 0.03;
  for (const turn of [-0.6, -0.3, 0, 0.3, 0.6]) {
    const [across, up] = [Math.sin(turn), -Math.cos(turn)];
    context.beginPath();
    context.moveTo(x + across * side * 0.165, y + up * side * 0.165);
    context.lineTo(x + across * side * 0.22, y + up * side * 0.22);
    context.stroke();
  }
  context.lineWidth = side * 0.05;
  context.beginPath();
  context.ellipse(x, y, side * 0.2, side * 0.12, 0, 0, Math.PI * 2);
  context.stroke();
  context.lineWidth = side * 0.025;
  context.beginPath();
  context.arc(x, y, side * 0.07, 0, Math.PI * 2);
  context.stroke();
  context.fillRect(side * 0.485, side * 0.375, side * 0.03, side * 0.13);
  context.lineWidth = side * 0.04;
  for (const [down, wide] of [
    [0.64, 0.17],
    [0.72, 0.11],
    [0.79, 0.05],
  ] as const) {
    context.beginPath();
    context.moveTo(side * (0.5 - wide), side * down);
    context.quadraticCurveTo(side / 2, side * (down + 0.06), side * (0.5 + wide), side * down);
    context.stroke();
  }
};

/** Where a sword's guard stands, a share of its length from its tip. */
const GUARD = 0.68;

/** A sword laid from its tip to its pommel (shares of the side): a point a share of its length along it and a share of
 *  the side out from it. */
function sword(side: number, tip: readonly [number, number], pommel: readonly [number, number]) {
  const [fromX, fromY] = [tip[0] * side, tip[1] * side];
  const [toX, toY] = [pommel[0] * side, pommel[1] * side];
  const length = Math.hypot(toX - fromX, toY - fromY);
  const [alongX, alongY] = [(toX - fromX) / length, (toY - fromY) / length];
  const [acrossX, acrossY] = [-alongY, alongX];
  const point = (share: number, out: number): [number, number] => [
    fromX + alongX * length * share + acrossX * side * out,
    fromY + alongY * length * share + acrossY * side * out,
  ];
  return point;
}

/** Two swords crossed under a star, each a blade with a fuller down it, a guard, a grip and a pommel, the blade edged
 *  in `detail` so one crossing the other reads as two. */
const crossedSwords: Device = (context, side, ink, detail) => {
  for (const [tip, pommel] of [
    [
      [0.69, 0.33],
      [0.34, 0.75],
    ],
    [
      [0.31, 0.33],
      [0.66, 0.75],
    ],
  ] as const) {
    const point = sword(side, tip, pommel);
    const blade = [point(0, 0), point(0.1, 0.028), point(GUARD, 0.028), point(GUARD, -0.028), point(0.1, -0.028)];
    context.beginPath();
    for (const [x, y] of blade) context.lineTo(x, y);
    context.closePath();
    context.fillStyle = ink;
    context.fill();
    context.lineWidth = Math.max(1, side * 0.012);
    context.strokeStyle = detail;
    context.stroke();
    context.beginPath();
    context.moveTo(...point(0.14, 0));
    context.lineTo(...point(GUARD - 0.04, 0));
    context.stroke();
    context.strokeStyle = ink;
    context.lineWidth = side * 0.03;
    context.beginPath();
    context.moveTo(...point(GUARD, 0));
    context.lineTo(...point(0.95, 0));
    context.stroke();
    context.lineWidth = side * 0.04;
    context.beginPath();
    context.moveTo(...point(GUARD, 0.075));
    context.lineTo(...point(GUARD, -0.075));
    context.stroke();
    context.beginPath();
    context.arc(...point(1, 0), side * 0.03, 0, Math.PI * 2);
    context.fill();
  }
  star(context, side / 2, side * 0.215, side * 0.065);
};

/** A crown with three jewels set in its band, a ball on each point, over the deep's rings. */
const deepCrown: Device = (context, side, ink, detail) => {
  context.fillStyle = ink;
  context.strokeStyle = ink;
  context.beginPath();
  context.moveTo(side * 0.3, side * 0.44);
  for (const [x, y] of [
    [0.3, 0.27],
    [0.4, 0.38],
    [0.5, 0.23],
    [0.6, 0.38],
    [0.7, 0.27],
    [0.7, 0.44],
  ] as const)
    context.lineTo(side * x, side * y);
  context.closePath();
  context.fill();
  context.fillRect(side * 0.3, side * 0.455, side * 0.4, side * 0.05);
  for (const [x, y] of [
    [0.3, 0.255],
    [0.5, 0.215],
    [0.7, 0.255],
  ] as const) {
    context.beginPath();
    context.arc(side * x, side * y, side * 0.025, 0, Math.PI * 2);
    context.fill();
  }
  context.fillStyle = detail;
  for (const x of [0.38, 0.5, 0.62]) {
    context.beginPath();
    context.arc(side * x, side * 0.48, side * 0.014, 0, Math.PI * 2);
    context.fill();
  }
  context.lineWidth = side * 0.045;
  for (const radius of [0.12, 0.2]) {
    context.beginPath();
    context.arc(side / 2, side * 0.6, side * radius, 0.15 * Math.PI, 0.85 * Math.PI);
    context.stroke();
  }
};

/** A gate's arch of laid stones under a crystal spire, its far facet in shade, as the Sunken Gate stands; ringed at
 *  Hard as the deep's eye is. */
function breachDevice(context: Context, side: number, ink: Ink, detail: string, ringed: boolean): void {
  context.strokeStyle = ink;
  context.fillStyle = ink;
  context.lineWidth = side * 0.06;
  context.beginPath();
  context.moveTo(side * 0.34, side * 0.76);
  context.lineTo(side * 0.34, side * 0.54);
  context.quadraticCurveTo(side / 2, side * 0.34, side * 0.66, side * 0.54);
  context.lineTo(side * 0.66, side * 0.76);
  context.stroke();
  context.beginPath();
  for (const [x, y] of [
    [0.465, 0.4],
    [0.535, 0.4],
    [0.525, 0.475],
    [0.475, 0.475],
  ] as const)
    context.lineTo(side * x, side * y);
  context.closePath();
  context.fill();
  context.strokeStyle = detail;
  context.lineWidth = Math.max(1, side * 0.012);
  context.stroke();
  for (const x of [0.34, 0.66])
    for (const y of [0.6, 0.69]) {
      context.beginPath();
      context.moveTo(side * (x - 0.03), side * y);
      context.lineTo(side * (x + 0.03), side * y);
      context.stroke();
    }
  context.fillStyle = ink;
  context.beginPath();
  for (const [x, y] of [
    [0.5, 0.15],
    [0.565, 0.26],
    [0.5, 0.37],
    [0.435, 0.26],
  ] as const)
    context.lineTo(side * x, side * y);
  context.closePath();
  context.fill();
  context.save();
  context.globalAlpha = 0.4;
  context.fillStyle = detail;
  context.beginPath();
  for (const [x, y] of [
    [0.5, 0.15],
    [0.565, 0.26],
    [0.5, 0.37],
  ] as const)
    context.lineTo(side * x, side * y);
  context.closePath();
  context.fill();
  context.restore();
  if (!ringed) return;
  context.strokeStyle = ink;
  context.lineWidth = side * 0.035;
  context.beginPath();
  context.arc(side / 2, side * 0.26, side * 0.105, 0, Math.PI * 2);
  context.stroke();
}

const DEVICES: Readonly<Record<PlaylistKind, Device>> = {
  elite: chevrons,
  abyss: deepEye,
  'week-elite': crossedSwords,
  'week-abyss': deepCrown,
  'breach-normal': (context, side, ink, detail) => breachDevice(context, side, ink, detail, false),
  'breach-hard': (context, side, ink, detail) => breachDevice(context, side, ink, detail, true),
};

/** A five-pointed star of `radius` about (x, y), filled. */
function star(context: Context, x: number, y: number, radius: number): void {
  context.beginPath();
  for (let point = 0; point < 10; point += 1) {
    const reach = point % 2 === 0 ? radius : radius * 0.45;
    const turn = (point * Math.PI) / 5 - Math.PI / 2;
    context.lineTo(x + Math.cos(turn) * reach, y + Math.sin(turn) * reach);
  }
  context.closePath();
  context.fill();
}

/** Where the shield stands in its square: a step inside at rest, so the chosen one is drawn larger in the same room. */
const shrinkOf = (chosen: boolean) => (chosen ? 1 : 1 / CHOSEN_SCALE);

/** Draws an entry's crest in a square: its shield of worked metal and its device raised over the field, in its
 *  shadow; grey where it is shut. Chosen, its shield fills the square. */
export function drawCrest(kind: PlaylistKind, shut: boolean, chosen: boolean) {
  const inks = inksOf(kind, shut);
  return (context: Context, drawn: number): void => {
    const side = drawn * shrinkOf(chosen);
    context.translate((drawn - side) / 2, (drawn - side) / 2);
    drawShield(context, side, inks);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.save();
    context.translate(side * 0.012, side * 0.018);
    DEVICES[kind](context, side, SHADOW, SHADOW);
    context.restore();
    const device = context.createLinearGradient(0, side * 0.15, 0, side * 0.8);
    device.addColorStop(0, inks.device[0]);
    device.addColorStop(1, inks.device[1]);
    DEVICES[kind](context, side, device, inks.field[1]);
  };
}

/** Draws the glow behind an entry's crest at its strongest, a square of it; the screen fades it by how the crest is
 *  lit. */
export function drawGlow(kind: PlaylistKind) {
  const { glow } = inksOf(kind, false);
  return (context: Context, drawn: number): void => {
    const light = context.createRadialGradient(drawn / 2, drawn / 2, 0, drawn / 2, drawn / 2, drawn / 2);
    light.addColorStop(0, glow);
    light.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = light;
    context.fillRect(0, 0, drawn, drawn);
  };
}

/** Draws the dial behind a crest on the chart, `drawn` pixels across: an inner ring, and an outer ring ticked every
 *  5 degrees, longer every 30, with a diamond at each quarter so its turning is seen. */
export function drawDial(kind: PlaylistKind, shut: boolean) {
  const inks = inksOf(kind, shut);
  return (context: Context, drawn: number): void => {
    const middle = drawn / 2;
    const hair = Math.max(1, drawn * 0.004);
    context.lineWidth = hair;
    context.strokeStyle = withAlpha(inks.metal[1], 0.3);
    context.beginPath();
    context.arc(middle, middle, drawn * 0.37, 0, Math.PI * 2);
    context.stroke();
    const outer = drawn * 0.47;
    context.strokeStyle = withAlpha(inks.metal[1], 0.5);
    context.beginPath();
    context.arc(middle, middle, outer, 0, Math.PI * 2);
    context.stroke();
    for (let tick = 0; tick < 72; tick += 1) {
      const turn = (tick * Math.PI) / 36;
      const inward = tick % 6 === 0 ? drawn * 0.03 : drawn * 0.012;
      const [across, down] = [Math.cos(turn), Math.sin(turn)];
      context.beginPath();
      context.moveTo(middle + across * outer, middle + down * outer);
      context.lineTo(middle + across * (outer - inward), middle + down * (outer - inward));
      context.stroke();
    }
    context.fillStyle = withAlpha(inks.metal[0], 0.7);
    for (const [across, down] of [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ] as const)
      rhombus(context, middle + across * outer, middle + down * outer, drawn * 0.018, drawn * 0.018);
  };
}

/** Draws the chosen crest's three arcs, `drawn` pixels across, each a sixth of a turn with a dot at each end, a third
 *  of a turn apart; the screen turns them against the dial. */
export function drawArcs(kind: PlaylistKind) {
  const inks = inksOf(kind, false);
  return (context: Context, drawn: number): void => {
    const [middle, radius] = [drawn / 2, drawn * 0.42];
    context.strokeStyle = withAlpha(inks.metal[0], 0.7);
    context.fillStyle = withAlpha(inks.metal[0], 0.7);
    context.lineWidth = Math.max(1, drawn * 0.006);
    for (let arc = 0; arc < 3; arc += 1) {
      const from = (arc * 2 * Math.PI) / 3;
      const to = from + Math.PI / 3;
      context.beginPath();
      context.arc(middle, middle, radius, from, to);
      context.stroke();
      for (const end of [from, to]) {
        context.beginPath();
        context.arc(middle + Math.cos(end) * radius, middle + Math.sin(end) * radius, drawn * 0.007, 0, Math.PI * 2);
        context.fill();
      }
    }
  };
}

/** How many steps the light that sweeps a crest is drawn in, and how long it takes, seconds. */
export const SHEEN_STEPS = 9;
export const SHEEN_S = 0.55;

/** Draws the light that sweeps a crest's shield at `step` of its steps, from its top left to its bottom right, kept
 *  inside the shield; where the shield stands as `drawCrest` stands it, chosen or not. */
export function drawSheen(chosen: boolean, step: number) {
  return (context: Context, drawn: number): void => {
    const side = drawn * shrinkOf(chosen);
    context.translate((drawn - side) / 2, (drawn - side) / 2);
    shield(context, side);
    context.clip();
    // Its middle from the shield's top left corner (east plus south 0.27 of the side) to its foot's curve (1.49).
    const across = side * (0.135 + (0.61 * step) / (SHEEN_STEPS - 1));
    const wide = side * 0.14;
    const light = context.createLinearGradient(across - wide, across - wide, across + wide, across + wide);
    light.addColorStop(0, 'rgba(255,248,230,0)');
    light.addColorStop(0.5, 'rgba(255,248,230,0.42)');
    light.addColorStop(1, 'rgba(255,248,230,0)');
    context.fillStyle = light;
    context.fillRect(0, 0, side, side);
  };
}

/** Draws the dot that marks a reward waiting, round and gold with a dark rim, `side` pixels square. */
export function drawWaiting(context: Context, side: number): void {
  context.beginPath();
  context.arc(side / 2, side / 2, side / 2 - 1, 0, Math.PI * 2);
  context.fillStyle = '#f0c94a';
  context.fill();
  context.lineWidth = Math.max(1, side / 8);
  context.strokeStyle = '#050608';
  context.stroke();
}

/** Draws the ring that spreads from a waiting reward's dot, gold, `side` pixels square; the screen grows and fades it. */
export function drawRipple(context: Context, side: number): void {
  const width = side * 0.06;
  context.beginPath();
  context.arc(side / 2, side / 2, side / 2 - width, 0, Math.PI * 2);
  context.lineWidth = width;
  context.strokeStyle = '#f0c94a';
  context.stroke();
}
