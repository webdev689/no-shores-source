// Ships side on, at any size from a far speck to one filling the picture: a sprung hull with its wale and gunports,
// a stern castle, a bowsprit with its jibs, masts with square sails that belly in the wind, the rigging between them,
// a pennant, the wake and the hull's dark double on the water. Below a few dozen cells the small parts drop away, as
// they would to the eye.
import { lantern } from './light.ts';
import { box, dot, halo, inkAt, line, patternOn, shape, type Ink, type Sheet } from './sheet.ts';

export interface ShipLook {
  readonly hull: Ink;
  /** The painted band along the hull. */
  readonly wale?: Ink;
  readonly sail: Ink;
  /** The side of each sail away from the light. */
  readonly shade: Ink;
  /** Masts, yards and lines. */
  readonly rig?: Ink;
  /** Masts, one to three. */
  readonly masts?: 1 | 2 | 3;
  /** 1 sails right, -1 left. */
  readonly facing?: 1 | -1;
  /** A lantern at the stern and the stern windows lit. */
  readonly lantern?: boolean;
  /** Sails furled on their yards, as at anchor. */
  readonly furled?: boolean;
  /** The gunports' ink: dark, or lit from within. */
  readonly ports?: Ink;
  /** A pennant at the main top, in this ink. */
  readonly pennant?: Ink;
  /** Foam at the bow and in the wake, for a ship under way. */
  readonly wake?: Ink;
  /** The hull's double on the water. */
  readonly reflection?: Ink;
}

interface Frame {
  readonly along: (share: number) => number;
  readonly deck: number;
  readonly facing: 1 | -1;
}

function hull(sheet: Sheet, waterline: number, length: number, look: ShipLook, frame: Frame): void {
  const { along, deck } = frame;
  const sheer = Math.max(1, Math.round(length * 0.05));
  shape(
    sheet,
    [
      [along(-1.02), deck - sheer * 1.6],
      [along(-0.7), deck - sheer * 0.3],
      [along(0.3), deck],
      [along(0.8), deck - sheer * 0.5],
      [along(1.04), deck - sheer * 1.3],
      [along(0.9), waterline - 1],
      [along(0.72), waterline + 1],
      [along(-0.8), waterline + 1],
      [along(-0.95), waterline - 2],
    ],
    look.hull,
  );
  if (length < 18) return;
  const wale = look.wale ?? look.hull;
  const band = deck + Math.max(1, Math.round((waterline - deck) * 0.35));
  for (let share = -0.92; share <= 0.9; share += 1 / length) {
    const curve = share < -0.7 ? (share + 0.7) * -0.6 : share > 0.8 ? (share - 0.8) * 0.8 : 0;
    dot(sheet, along(share), band - sheer * curve * 2, wale);
  }
  if (look.ports && length >= 36) {
    const row = band + 2;
    for (let share = -0.62; share <= 0.62; share += 9 / length)
      box(sheet, along(share), row, length >= 80 ? 2 : 1, 1, look.ports);
  }
  const castle = Math.max(2, Math.round(length * 0.07));
  const back = along(-1.02);
  const front = along(-0.72);
  box(sheet, Math.min(back, front), deck - sheer * 1.6 - castle, Math.abs(front - back), castle + 1, look.hull);
  if (look.lantern && length >= 30)
    for (let window = 0; window < 3; window++)
      dot(sheet, along(-0.95 + window * 0.08), deck - sheer * 1.6 - castle + 2, '#d99a36');
}

function sail(
  sheet: Sheet,
  foot: number,
  top: number,
  bottom: number,
  span: number,
  look: ShipLook,
  facing: 1 | -1,
): void {
  const tall = bottom - top;
  const belly = Math.max(1, span * 0.18);
  for (let row = Math.round(top); row <= bottom; row++) {
    const down = (row - top) / Math.max(1, tall);
    const swell = Math.sin(Math.PI * Math.min(1, down * 1.05));
    const half = span * (1 + 0.1 * swell);
    const middle = foot + facing * belly * swell;
    for (let column = Math.round(middle - half); column <= middle + half; column++) {
      const across = (column - (middle - half)) / (2 * half);
      const away = facing === 1 ? 1 - across : across;
      const shaded = patternOn(column, row, away * 0.9 - 0.25 + down * 0.35);
      dot(sheet, column, row, shaded ? look.shade : look.sail);
    }
  }
  const rig = look.rig ?? look.hull;
  box(sheet, Math.round(foot - span - 1), Math.round(top) - 1, Math.round(span * 2 + 3), 1, rig);
}

/**
 * A ship side on, `length` cells from stern to bow, its keel on `waterline` and its middle at `x`.
 */
export function ship(sheet: Sheet, x: number, waterline: number, length: number, look: ShipLook): void {
  const facing = look.facing ?? 1;
  const half = length / 2;
  const along = (share: number): number => Math.round(x + share * half * facing);
  const deck = waterline - Math.max(2, Math.round(length * 0.15));
  const frame: Frame = { along, deck, facing };
  const rig = look.rig ?? look.hull;
  const masts = look.masts ?? 2;
  const places = masts === 3 ? [-0.5, 0.06, 0.58] : masts === 2 ? [-0.32, 0.42] : [0.1];
  const heights = masts === 3 ? [0.78, 1, 0.88] : masts === 2 ? [0.9, 1] : [1];
  const tall = length * 0.86;
  const tops = places.map((share, mast) => ({
    foot: along(share),
    top: Math.round(deck - tall * (heights[mast] ?? 1)),
  }));
  const bowsprit: [number, number] = [along(1.42), Math.round(deck - length * 0.16)];
  if (look.reflection)
    for (let row = waterline + 1; row < waterline + Math.max(2, length * 0.14); row++)
      for (let column = along(-0.85); column !== along(0.75); column += facing)
        if (patternOn(column, row, 0.55 - (row - waterline) / (length * 0.2))) dot(sheet, column, row, look.reflection);
  if (look.wake) {
    for (let trail = 0; trail < length * 0.9; trail++) {
      const column = along(-0.9) - trail * facing;
      const spread = 1 + trail * 0.08;
      for (let row = 0; row <= spread; row++)
        if (patternOn(column, waterline + row, 0.7 - trail / (length * 0.9)))
          dot(sheet, column, waterline + row, look.wake);
    }
    for (let foam = 0; foam < length * 0.25; foam++)
      dot(sheet, along(0.85) + ((foam * 7) % 5) * facing, waterline + (foam % 3) - 1, look.wake);
  }
  line(sheet, along(0.98), deck - Math.round(length * 0.06), bowsprit[0], bowsprit[1], rig);
  for (const { foot, top } of tops) line(sheet, foot, deck, foot, top, rig);
  if (length >= 24 && !look.furled) {
    const first = tops[tops.length - 1];
    if (first) line(sheet, first.foot, first.top, bowsprit[0], bowsprit[1], rig);
    tops.forEach((mast, place) => {
      const next = tops[place + 1];
      if (next) line(sheet, mast.foot, mast.top, next.foot, next.top + Math.round(length * 0.2), rig);
      if (length >= 40)
        for (const side of [-1, 1])
          line(sheet, mast.foot, mast.top + length * 0.18, mast.foot + side * length * 0.07, deck, rig);
    });
    const back = tops[0];
    if (back) line(sheet, back.foot, back.top, along(-1.02), deck - Math.round(length * 0.1), rig);
  }
  hull(sheet, waterline, length, look, frame);
  tops.forEach(({ foot, top }, mast) => {
    const height = deck - top;
    const yard = length * (mast === 0 && masts === 3 ? 0.12 : 0.145);
    const tiers =
      length >= 50
        ? [
            [0.14, 0.48, 1],
            [0.52, 0.77, 0.8],
            [0.81, 0.95, 0.58],
          ]
        : [
            [0.14, 0.56, 1],
            [0.6, 0.92, 0.75],
          ];
    for (const [from = 0, to = 0, wide = 1] of tiers) {
      const tierTop = deck - height * to;
      const tierBottom = deck - height * from;
      if (look.furled) {
        box(sheet, Math.round(foot - yard * wide), Math.round(tierTop), Math.round(yard * wide * 2), 1, rig);
        box(
          sheet,
          Math.round(foot - yard * wide * 0.8),
          Math.round(tierTop) + 1,
          Math.round(yard * wide * 1.6),
          1,
          look.shade,
        );
      } else sail(sheet, foot, tierTop, tierBottom, yard * wide, look, facing);
    }
  });
  if (!look.furled && length >= 24) {
    const fore = tops[tops.length - 1];
    if (fore) {
      const jibTop = fore.top + Math.round((deck - fore.top) * 0.42);
      shape(
        sheet,
        [
          [fore.foot + facing * 2, jibTop],
          [bowsprit[0] - facing, bowsprit[1] + 1],
          [along(0.98), deck - Math.round(length * 0.05)],
        ],
        look.sail,
      );
      line(sheet, fore.foot + facing * 2, jibTop, along(0.98), deck - Math.round(length * 0.05), look.shade);
    }
    const back = tops[0];
    if (back && masts > 1) {
      const height = deck - back.top;
      const gaff = back.top + Math.round(height * 0.5);
      const boom = deck - Math.round(height * 0.12);
      const end = along(-1.0);
      shape(
        sheet,
        [
          [back.foot - facing, gaff],
          [end, gaff + Math.round(height * 0.12)],
          [end, boom],
          [back.foot - facing, boom],
        ],
        look.shade,
      );
      line(sheet, back.foot, gaff, end - facing, gaff + Math.round(height * 0.12), rig);
      line(sheet, back.foot, boom, end - facing * 2, boom, rig);
    }
  }
  const main = tops[Math.min(1, tops.length - 1)];
  if (main && look.pennant) {
    const long = Math.max(3, Math.round(length * 0.09));
    for (let cell = 0; cell < long; cell++)
      dot(sheet, main.foot - facing * cell, main.top + (cell > long / 2 ? 1 : 0), look.pennant);
  }
  if (look.lantern)
    lantern(sheet, along(-1.05), deck - Math.round(length * 0.13), Math.max(3, Math.round(length * 0.07)));
}

/** A ship broken and burning: two halves riding up from the break, their decks lit by the fire, planks, a mast down
 *  with its sail torn, and flames standing on what is left. */
export function burning(
  sheet: Sheet,
  random: () => number,
  x: number,
  waterline: number,
  size: number,
  hullInk: Ink,
): void {
  halo(sheet, x - size * 0.2, waterline - size * 0.25, size * 1.25, ['#1e0c0c', '#3a1610', '#6a2414']);
  const plank = '#22140c';
  const lit = '#c0602a';
  const stern: [number, number][] = [
    [x - size, waterline - size * 0.46],
    [x - size * 0.72, waterline - size * 0.36],
    [x - size * 0.16, waterline - size * 0.04],
    [x - size * 0.22, waterline + 2],
    [x - size * 0.92, waterline + 2],
  ];
  const bow: [number, number][] = [
    [x + size * 0.06, waterline - size * 0.06],
    [x + size * 0.58, waterline - size * 0.5],
    [x + size * 0.62, waterline - size * 0.44],
    [x + size * 0.5, waterline + 2],
    [x + size * 0.1, waterline + 2],
  ];
  shape(sheet, stern, hullInk);
  shape(sheet, bow, hullInk);
  box(sheet, x - size * 1.0, waterline - size * 0.62, size * 0.22, size * 0.2, hullInk);
  for (const [half, from, to] of [
    [stern, x - size * 0.98, x - size * 0.18],
    [bow, x + size * 0.08, x + size * 0.58],
  ] as const) {
    for (let row = waterline - size * 0.5; row < waterline + 2; row += 3)
      for (let column = from; column < to; column++)
        if (inkAt(sheet, Math.round(column), Math.round(row)) === hullInk) dot(sheet, column, row, plank);
    line(sheet, half[0]?.[0] ?? x, half[0]?.[1] ?? waterline, half[1]?.[0] ?? x, half[1]?.[1] ?? waterline, lit);
  }
  line(sheet, x - size * 0.72, waterline - size * 0.36, x - size * 0.16, waterline - size * 0.04, lit);
  line(sheet, x + size * 0.06, waterline - size * 0.06, x + size * 0.58, waterline - size * 0.5, lit);
  line(sheet, x - size * 0.5, waterline - size * 0.26, x - size * 0.96, waterline - size * 1.08, hullInk);
  line(sheet, x - size * 0.49, waterline - size * 0.26, x - size * 0.95, waterline - size * 1.08, hullInk);
  shape(
    sheet,
    [
      [x - size * 0.9, waterline - size * 0.96],
      [x - size * 0.62, waterline - size * 0.9],
      [x - size * 0.7, waterline - size * 0.56],
      [x - size * 0.84, waterline - size * 0.66],
      [x - size * 0.95, waterline - size * 0.6],
    ],
    '#7a6a64',
  );
  line(sheet, x - size * 0.62, waterline - size * 0.9, x - size * 0.7, waterline - size * 0.56, '#4a3c3a');
  line(sheet, x + size * 0.3, waterline - size * 0.3, x + size * 0.42, waterline - size * 0.66, hullInk);
  for (let tongue = 0; tongue < 16; tongue++) {
    const onStern = tongue % 2 === 0;
    const along = random();
    const base = onStern ? x - size * (0.9 - along * 0.7) : x + size * (0.1 + along * 0.45);
    const deck = onStern ? waterline - size * (0.42 - along * 0.36) : waterline - size * (0.08 + along * 0.4);
    const high = size * (0.1 + random() * random() * 0.5);
    const lean = (random() - 0.3) * 0.5;
    for (let row = 0; row < high; row++) {
      const wide = Math.max(0, 2.2 * (1 - row / high));
      for (let column = -wide; column <= wide; column++) {
        const ink = row < high * 0.25 ? '#fff1c4' : row < high * 0.55 ? '#ffc04a' : '#ff7a2a';
        dot(sheet, base + column + row * lean, deck - row, ink);
      }
    }
  }
  for (let row = waterline + 2; row < waterline + 8; row++)
    for (let column = x - size * 0.2; column < x + size * 0.1; column++)
      if (patternOn(Math.round(column), row, 0.5)) dot(sheet, column, row, '#e07a2a');
}
