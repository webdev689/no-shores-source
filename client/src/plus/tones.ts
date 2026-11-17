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
  groove: 'rgba(163,152,128,0.26)',
  word: '#fbf8f0',
  wordDim: '#e2dccd',
} as const;

export type Tones = typeof TONES;

/** The four edges of a bevel, as `border-color` takes them: top, right, bottom, left. */
export const BEVELS = {
  raised: `${TONES.stoneLit} ${TONES.stoneDim} ${TONES.stoneDark} ${TONES.stoneMid}`,
  raisedSoft: `${TONES.stoneMid} #2e2a21 ${TONES.stoneDark} ${TONES.stoneLo}`,
  sunk: `${TONES.stoneDark} ${TONES.stoneMid} ${TONES.stoneLit} ${TONES.stoneDim}`,
  brass: `${TONES.brassHi} ${TONES.brassLo} #5c3f1a ${TONES.brass}`,
  blood: '#e0584a #5a130f #3d0d0a #b83a2e',
  bloodHi: '#ff8a76 #7a1d16 #5a130f #e0584a',
  bloodSunk: '#3d0d0a #b83a2e #e0584a #5a130f',
} as const;
