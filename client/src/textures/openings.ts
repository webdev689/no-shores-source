// Windows and doors: a window's frame, its leading and panes, shutters and a sill; a door's boards, battens, braces,
// ironwork and handle, or its riveted plates.
import { fbm, speckle, wrap } from './noise.ts';
import { hypot, sin } from './portableMath.ts';
import { planks, plates } from './boards.ts';
import { beam } from './frames.ts';
import { box, ellipse, polygon, stroke, type Surface } from './surface.ts';

/**
 * A window: `kind` 'lattice' (leaded diamonds), 'grid' (square panes), 'bars' (iron bars over the dark), or 'arch'
 * (a round-headed opening). `head` 'round' or 'pointed' gives any kind an arched head. `frame`, `glass`, `lead` and
 * `sill` are materials, `shutters` a material for a pair of open louvred shutters beside it; `pitch` the leading's
 * spacing, `leadW` its width, `mullion` a bar down the middle, `lit` panes that take no light from relief.
 */
export interface WindowOptions {
  kind: 'lattice' | 'grid' | 'bars' | 'arch';
  head?: 'round' | 'pointed';
  frame: number;
  glass: number;
  seed: number;
  frameW: number;
  frameTone?: number;
  glassTone: number;
  lead?: number;
  leadTone?: number;
  leadW?: number;
  pitch?: number;
  mullion?: boolean;
  shutters?: number;
  shutterW?: number;
  sill?: number;
  lit?: boolean;
}

/** A window in the box from (left, top) to (right, bottom); the frame stands proud and the opening sits deep. */
export function windowAt(
  surf: Surface,
  left: number,
  top: number,
  right: number,
  bottom: number,
  options: WindowOptions,
): void {
  const seed = options.seed;
  const frameW = options.frameW;
  const midX = (left + right) / 2;
  const openW = right - left;
  const head = options.head ?? (options.kind === 'arch' ? 'round' : 'flat');
  const radius = openW / 2;
  /** whether (x, y) is inside the opening's outline grown by `grow` */
  const inside = (x: number, y: number, grow: number): boolean => {
    if (x < left - grow || x >= right + grow || y >= bottom + grow) return false;
    if (head === 'flat') return y >= top - grow;
    const springing = top + radius;
    if (y >= springing) return true;
    const offsetX = x + 0.5 - midX;
    const offsetY = y + 0.5 - springing;
    if (head === 'round') return offsetX * offsetX + offsetY * offsetY <= (radius + grow) * (radius + grow);
    // pointed: two arcs whose centres sit at the far jambs
    const nearest = hypot(x + 0.5 - (left + openW * 0.15), offsetY);
    const second = hypot(x + 0.5 - (right - openW * 0.15), offsetY);
    return nearest <= openW * 0.85 + grow && second <= openW * 0.85 + grow && y + 0.5 >= top - grow;
  };
  if (options.shutters !== undefined) {
    const shutterW = options.shutterW ?? Math.round(openW * 0.42);
    for (const [from, to] of [
      [left - frameW - shutterW, left - frameW],
      [right + frameW, right + frameW + shutterW],
    ])
      shutter(surf, from, top - frameW, to, bottom + frameW, options.shutters, seed + from);
  }
  const headRise = head === 'flat' ? 0 : radius;
  surf.each(
    (x, y) => {
      if (inside(x, y, 0) || !inside(x, y, frameW)) return;
      const n = fbm(seed, x, y, surf.width, surf.height, { cells: 8, octaves: 2 });
      surf.put(x, y, {
        material: options.frame,
        tone: (options.frameTone ?? 0.5) + (n - 0.5) * 0.25 + speckle(seed, x, y) * 0.04,
        relief: 2.6,
      });
    },
    left - frameW - 1,
    top - frameW - 1 - headRise,
    right + frameW + 1,
    bottom + frameW + 1,
  );
  const leadW = options.leadW ?? 1.3;
  surf.each(
    (x, y, i) => {
      if (!inside(x, y, 0)) return;
      const relU = (x + 0.5 - left) / openW;
      const relV = (y + 0.5 - top) / (bottom - top);
      let lead = false;
      if (options.kind === 'lattice') {
        const pitch = options.pitch ?? 5;
        lead =
          wrap(x + 0.5 - left + (y + 0.5 - top), pitch) < leadW ||
          wrap(x + 0.5 - left - (y + 0.5 - top), pitch) < leadW;
      } else if (options.kind === 'grid') {
        const pitch = options.pitch ?? 6;
        lead = wrap(x + 0.5 - left + 1, pitch) < leadW || wrap(y + 0.5 - top + 1, pitch) < leadW;
      } else if (options.kind === 'bars') lead = wrap(x + 0.5 - left + 1, options.pitch ?? 4) < 1.4;
      if (options.mullion && Math.abs(x + 0.5 - midX) < 1.2) lead = true;
      if (lead) {
        surf.put(x, y, { material: options.lead ?? options.frame, tone: options.leadTone ?? 0.55, relief: 1.6 });
        return;
      }
      // the pane: dark, a little lighter toward the top, with a glint across it
      const glint = Math.abs(relU - relV * 0.6 - 0.2) < 0.06 ? 0.18 : 0;
      surf.put(x, y, {
        material: options.glass,
        tone: options.glassTone + (1 - relV) * 0.12 + glint + speckle(seed + 2, x, y) * 0.04,
        relief: -1,
      });
      surf.flat[i] = options.lit ? 1 : 0;
    },
    left,
    top - headRise,
    right,
    bottom,
  );
  const sill = options.sill;
  if (sill !== undefined)
    box(left - frameW - 2, bottom + frameW, right + frameW + 2, bottom + frameW + 3, (x, y, _along, down) =>
      surf.put(x, y, { material: sill, tone: 0.62 - down * 0.3 + speckle(seed, x, y) * 0.04, relief: 3.2 - down }),
    );
}

/** One louvred shutter: a frame round slats that slope down and out, each lit along its top. */
function shutter(
  surf: Surface,
  left: number,
  top: number,
  right: number,
  bottom: number,
  material: number,
  seed: number,
): void {
  box(left, top, right, bottom, (x, y, along, down) => {
    const inset = Math.min(
      along * (right - left),
      (1 - along) * (right - left),
      down * (bottom - top),
      (1 - down) * (bottom - top),
    );
    if (inset < 1.6) {
      surf.put(x, y, { material, tone: 0.5 + (along < 0.5 ? 0.06 : -0.06), relief: 3 });
      return;
    }
    const slat = (y - top) / 3 - Math.floor((y - top) / 3);
    surf.put(x, y, { material, tone: 0.62 - slat * 0.4 + speckle(seed, x, y) * 0.04, relief: 2 - slat });
  });
}

/** An iron strap hinge three texels deep: a band from `fromX` to `toX` at `y`, ending in a spear point, studded. */
export function strap(surf: Surface, fromX: number, toX: number, y: number, material: number): void {
  const tall = 3;
  const dir = toX > fromX ? 1 : -1;
  stroke(fromX, y, toX, y, tall, tall, (x, placeY, _along, across) =>
    surf.put(x, placeY, { material, tone: 0.42 + (1 - Math.abs(across)) * 0.15, relief: 3.2 + (1 - across * across) }),
  );
  polygon(
    [
      [toX, y - tall * 0.9],
      [toX + dir * tall * 1.6, y],
      [toX, y + tall * 0.9],
    ],
    (x, placeY) => surf.put(x, placeY, { material, tone: 0.45, relief: 3.4 }),
  );
  for (let x = fromX + dir * 3; dir > 0 ? x < toX : x > toX; x += dir * 5)
    ellipse(x, y, 0.9, 0.9, (placeX, placeY) => surf.put(placeX, placeY, { material, tone: 0.75, bump: 0.8 }));
}

/** A ring handle with its plate, centred at (midX, midY). */
function ringHandle(surf: Surface, midX: number, midY: number, material: number): void {
  ellipse(midX, midY - 2, 2, 2, (x, y) => surf.put(x, y, { material, tone: 0.35, relief: 3.5 }));
  ellipse(midX, midY + 1.5, 3.6, 3.8, (x, y, relU, relV) => {
    if (hypot(relU, relV) < 0.62) return;
    surf.put(x, y, { material, tone: 0.45 - (relU + relV) * 0.18, relief: 4.5 });
  });
}

/** A door: `kind` 'plank' (boards and battens), 'zbrace', 'xbrace', 'strapped', 'grille' (a barred window up
 *  top), 'clad' (riveted plates and diagonal straps) or 'iron' (dark ribbed metal); `wood` the boards, `metal` the
 *  ironwork, `frameMetal` a clad door's border, `dark` the grille's dark. */
export interface DoorOptions {
  kind: 'plank' | 'zbrace' | 'xbrace' | 'strapped' | 'grille' | 'clad' | 'iron';
  wood: number;
  metal: number;
  seed: number;
  boards: number;
  frameMetal?: number;
  dark?: number;
}

/** A door filling the box. */
export function door(
  surf: Surface,
  left: number,
  top: number,
  right: number,
  bottom: number,
  options: DoorOptions,
): void {
  const seed = options.seed;
  const metal = options.metal;
  const w = right - left;
  const tall = bottom - top;
  const area = { x0: left, y0: top, x1: right, y1: bottom };
  if (options.kind === 'clad') {
    cladDoor(surf, left, top, right, bottom, options);
    return;
  }
  if (options.kind === 'iron') {
    plates(surf, { material: metal, across: 1, down: 1, seed, base: 0.3 }, area);
    for (let x = left + 4; x < right - 2; x += 5)
      box(x, top + 3, x + 2, bottom - 3, (placeX, placeY) =>
        surf.put(placeX, placeY, { material: metal, tone: 0.42, bump: 1.4 }),
      );
    return;
  }
  const wood = options.wood;
  planks(
    surf,
    {
      material: wood,
      dir: 'v',
      count: options.boards,
      seed,
      joints: false,
      base: 0.48,
      knots: 2,
      gapTone: 0.06,
      toneVar: 0.16,
      amp: 0.45,
      grain: 0.2,
    },
    area,
  );
  const battenH = Math.max(4, Math.round(tall * 0.06));
  const battens = [top + tall * 0.12, bottom - tall * 0.12 - battenH];
  for (const row of battens)
    box(left + 1, row, right - 1, row + battenH, (x, y, _along, down) =>
      surf.put(x, y, {
        material: wood,
        tone: 0.42 + fbm(seed + 9, x * 3, y, surf.width, surf.height, { cells: 4, octaves: 2 }) * 0.2,
        relief: 2.4 + sin(down * Math.PI) * 0.8,
      }),
    );
  if (options.kind === 'zbrace' || options.kind === 'xbrace')
    beam(surf, left + 4, battens[1] + 1, right - 4, battens[0] + battenH - 1, 5, {
      material: wood,
      seed: seed + 3,
      base: 0.44,
      lift: 2.2,
    });
  if (options.kind === 'xbrace')
    beam(surf, left + 4, battens[0] + battenH - 1, right - 4, battens[1] + 1, 5, {
      material: wood,
      seed: seed + 4,
      base: 0.44,
      lift: 2.4,
    });
  if (options.kind === 'strapped')
    for (const row of [top + tall * 0.15, bottom - tall * 0.15]) strap(surf, left + 1, left + 1 + w * 0.55, row, metal);
  if (options.kind === 'grille') {
    const grilleTop = top + tall * 0.2;
    windowAt(surf, left + w * 0.28, grilleTop, right - w * 0.28, grilleTop + tall * 0.16, {
      kind: 'bars',
      frame: wood,
      glass: options.dark ?? metal,
      glassTone: 0.05,
      lead: metal,
      pitch: 3,
      frameW: 2,
      seed,
    });
  }
  ringHandle(surf, right - w * 0.2, top + tall * 0.55, metal);
}

/** A clad door: riveted plates in a dark iron border, two raised bars meeting in a chevron at the latch side. */
function cladDoor(surf: Surface, left: number, top: number, right: number, bottom: number, options: DoorOptions): void {
  const seed = options.seed;
  const metal = options.metal;
  const w = right - left;
  const tall = bottom - top;
  plates(surf, { material: metal, across: 1, down: 2, seed, base: 0.5 }, { x0: left, y0: top, x1: right, y1: bottom });
  box(left, top, right, bottom, (x, y, along, down) => {
    const inset = Math.min(along * w, (1 - along) * w, down * tall, (1 - down) * tall);
    if (inset < 5)
      surf.put(x, y, {
        material: options.frameMetal ?? metal,
        tone: 0.22 + speckle(seed, x, y) * 0.05 + (inset < 1 ? -0.1 : 0),
        relief: 4 + Math.min(inset, 2) * 0.4,
      });
  });
  const tipX = right - 7;
  const tipY = top + tall / 2;
  for (const [fromX, fromY] of [
    [left + 9, top + 10],
    [left + 9, bottom - 10],
  ])
    stroke(fromX, fromY, tipX, tipY, 9, 9, (x, y, _along, across) =>
      surf.put(x, y, {
        material: metal,
        tone: 0.55 + (1 - Math.abs(across)) * 0.12 - Math.abs(across) * 0.1 + speckle(seed + 4, x, y) * 0.05,
        relief: 6 + (1 - across * across) * 1.5,
      }),
    );
  box(left + 5, top + 5, left + 12, bottom - 5, (x, y, along) =>
    surf.put(x, y, { material: metal, tone: 0.5 + sin(along * Math.PI) * 0.1, relief: 5.5 }),
  );
  const rivet = (midX: number, midY: number): void =>
    ellipse(midX, midY, 1.3, 1.3, (x, y, relU, relV) =>
      surf.put(x, y, { material: metal, tone: 0.7 - (relU + relV) * 0.15, relief: 7 }),
    );
  for (let k = 0; k < 7; k++)
    for (const side of [left + 2, right - 3]) rivet(side + 0.5, top + 5 + (k * (tall - 10)) / 6);
  for (const row of [top + 2, bottom - 3]) for (let k = 0; k < 4; k++) rivet(left + 10 + (k * (w - 20)) / 3, row + 0.5);
}
