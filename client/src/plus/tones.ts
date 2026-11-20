// The Enhanced Plus kit's palette: carved stone and brass, each tone named for what it is. Light falls from the top
// left, so a raised edge is lit on its top and left and shaded on its bottom and right.

export const TONES = {
  outline: '#050608',
  stoneHi: '#c2b79a',
  stoneLit: '#9a9079',
  stoneMid: '#7a7260',
  stoneLo: '#5a5446',
  stoneDim: '#3a352a',
  stoneDark: '#25221b',
  brassHi: '#f3cf86',
  brass: '#c08a3e',
  brassLo: '#7a5424',
  brassDark: '#3d2a12',
  ground: 'rgba(12,14,18,0.93)',
  groundPanel: 'rgba(15,17,22,0.92)',
  groundButton: '#1c1f26',
  groundButtonHi: '#262a33',
  groundChip: 'rgba(12,14,18,0.84)',
  groundTrack: 'rgba(6,7,9,0.8)',
  groove: 'rgba(163,152,128,0.26)',
  word: '#fbf8f0',
  wordDim: '#e2dccd',
  /** DFO's hourglass glass. */
  glass: '#d8cfae',
  /** Stone gone to blood, as `BEVELS.blood` lights and shades it. */
  blood: '#b83a2e',
  bloodDark: '#5a130f',
} as const;

/** Words over the world or a bar's fill: a hard 1 px outline all round, as a ship's plate strokes its words, and a soft
 *  shade past it, so they read over bright sky and every fill. */
export const HALO = [
  ...[
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [-1, -1],
    [1, -1],
    [-1, 1],
  ].map(([across, down]) => `${across}px ${down}px 0 ${TONES.outline}`),
  '0 0 4px rgba(0,0,0,0.6)',
].join(', ');

/** The four edges of a bevel, as `border-color` takes them: top, right, bottom, left. */
export const BEVELS = {
  raised: `${TONES.stoneLit} ${TONES.stoneDim} ${TONES.stoneDark} ${TONES.stoneMid}`,
  raisedSoft: `${TONES.stoneMid} #2e2a21 ${TONES.stoneDark} ${TONES.stoneLo}`,
  sunk: `${TONES.stoneDark} ${TONES.stoneMid} ${TONES.stoneLit} ${TONES.stoneDim}`,
  brass: `${TONES.brassHi} ${TONES.brassLo} #5c3f1a ${TONES.brass}`,
  /** Stone gone to blood: a warning's edge, lit as the stone is. */
  blood: '#e0584a #5a130f #3d0d0a #b83a2e',
  bloodHi: '#ff8a76 #7a1d16 #5a130f #e0584a',
  bloodSunk: '#3d0d0a #b83a2e #e0584a #5a130f',
} as const;

/** A bar's fill by what it measures: a foe's or a ship's health in the band its rank is drawn in, an ally's in green,
 *  and the player's three vitals. */
export const FILLS = {
  red: '#c8382f',
  orange: '#e07a2a',
  yellow: '#e8c23a',
  green: '#4fae4a',
  health: '#b53a2e',
  stamina: '#2f9152',
  poise: '#c08a3e',
} as const;
