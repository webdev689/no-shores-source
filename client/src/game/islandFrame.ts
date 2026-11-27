// An island tile's carved frame, drawn over its scene: a dark outer line, a bevel lit from the top left, a hairline
// inset in the tile's tone, brass brackets at each corner with a rivet, and a jewel at the head of its top edge. A
// tile met at a tier wears that tier's tone (steel for Normal, brass for Elite, violet for Abyss); any other, the
// brass. Lit, its brass and its jewel burn brighter and its hairline glows.

/** Each tier's tone, by the gear crate's numbers, and the frame's own where a tile has no tier. */
const TONES = ['#9aa8bc', '#e0a84e', '#b48ae8'] as const;
const BRASS = { rest: '#a8783a', lit: '#f3cf86', dark: '#3a2610', shade: '#1a1108', line: '#05070b' } as const;
/** A corner bracket's arms and thickness, and a rivet's inset from the corner (px). */
const BRACKET = { arm: 14, thick: 2, rivet: 6 } as const;

/** The key a frame of this size, light and tier is drawn once under. */
export function frameKey(size: { readonly width: number; readonly height: number }, lit: boolean, tier: number | null) {
  return `island frame ${size.width}x${size.height} ${lit} ${tier ?? '-'}`;
}

/** Draws the frame over a tile `width` by `height`, lit or at rest, in its tier's tone. */
export function drawFrame(
  lit: boolean,
  tier: number | null,
): (context: OffscreenCanvasRenderingContext2D, width: number, height: number) => void {
  const tone = tier === null ? BRASS.lit : (TONES[tier] ?? BRASS.lit);
  const brass = lit ? BRASS.lit : BRASS.rest;
  return (context, width, height) => {
    context.clearRect(0, 0, width, height);
    const rect = (x: number, y: number, wide: number, tall: number, colour: string) => {
      context.fillStyle = colour;
      context.fillRect(x, y, wide, tall);
    };
    // The outer line, then the bevel: lit along the top and the left, shaded along the foot and the right.
    context.strokeStyle = BRASS.line;
    context.lineWidth = 1;
    context.strokeRect(0.5, 0.5, width - 1, height - 1);
    rect(1, 1, width - 2, 1, lit ? '#8a6a3a' : '#5a4022');
    rect(1, 1, 1, height - 2, lit ? '#8a6a3a' : '#5a4022');
    rect(1, height - 2, width - 2, 1, BRASS.shade);
    rect(width - 2, 1, 1, height - 2, BRASS.shade);
    // The hairline in the tile's tone, inset, brighter lit.
    context.globalAlpha = lit ? 0.9 : 0.45;
    context.strokeStyle = tone;
    context.strokeRect(4.5, 4.5, width - 9, height - 9);
    context.globalAlpha = 1;
    // A bracket at each corner, its arms along the edges, with a rivet inside it.
    for (const [x, y, east, south] of [
      [2, 2, 1, 1],
      [width - 2, 2, -1, 1],
      [2, height - 2, 1, -1],
      [width - 2, height - 2, -1, -1],
    ] as const) {
      const left = east > 0 ? x : x - BRACKET.arm;
      const top = south > 0 ? y : y - BRACKET.thick;
      rect(left, top, BRACKET.arm, BRACKET.thick, brass);
      rect(east > 0 ? x : x - BRACKET.thick, south > 0 ? y : y - BRACKET.arm, BRACKET.thick, BRACKET.arm, brass);
      rect(x + east * BRACKET.rivet - 1, y + south * BRACKET.rivet - 1, 2, 2, lit ? '#fff2c8' : BRASS.dark);
    }
    // The jewel at the head of the top edge, a diamond in the tone set in brass.
    const middle = Math.round(width / 2);
    for (let row = 0; row < 7; row++) {
      const half = 3 - Math.abs(row - 3);
      rect(middle - half - 1, row, half * 2 + 2, 1, brass);
      if (half > 0) rect(middle - half, row, half * 2, 1, lit ? tone : BRASS.dark);
    }
    if (lit) rect(middle - 1, 2, 1, 1, '#ffffff');
  };
}
