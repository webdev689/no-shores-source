// Each terrain archive's ground, written as words: its four classes (water, dirt, grass, stone), each a painter `kind`
// and its `shades` as a shade rule, and a `meet` rule per pair of classes, weightier first. A meet rule lists each
// class reaching in as `letter share centre/width shift` - its share of the texels, peaking at that lead (0 at the
// edge, 1 deep inside), drawn `shift` shades darker - and `t amount/width`, the class darkening toward the edge.
// W D G S are the classes, K shore stones, V weed, X the class darker than its plain ground ever is.

/** The painters the ground's classes are drawn with. */
export type GroundKind = 'water' | 'earth' | 'mud' | 'sand' | 'gravel' | 'moss' | 'sward' | 'marsh' | 'snow';

/** A painter's settings: the mottle's level (`base`), swing (`amp`) and size (`cells`), its grain in clumps
 *  (`fine`) and texel by texel (`texel`), its relief (`bump`), and the pebbles, stones, specks or blades over it. */
export interface KindSettings {
  readonly base: number;
  readonly amp: number;
  readonly cells: number;
  readonly fine: number;
  readonly texel: number;
  readonly bump: number;
  readonly octaves?: number;
  readonly pebbles?: number;
  readonly stones?: number;
  readonly specks?: number;
  readonly blades?: number;
  readonly lean?: readonly [number, number];
  readonly dark?: number;
  readonly light?: number;
  readonly clumps?: number;
  readonly spread?: number;
  readonly length?: number;
}

/** One ground class of a climate: its painter, shade rule, how much darker it lies (`dark`) and its own settings. */
export interface GroundClass {
  readonly kind: GroundKind;
  readonly shades: string;
  readonly dark?: number;
  readonly tune?: Partial<KindSettings>;
}

/** A climate's ground: its classes, the shade rules of its shore's stones, weed, paving and field, and its meet
 *  rules. */
export interface GroundClimate {
  readonly classes: readonly GroundClass[];
  readonly shore?: string;
  readonly weed?: string;
  readonly paving?: string;
  readonly field?: string;
  readonly meet: Readonly<Record<string, string>>;
}

/** Desert 2-4, mountain 102-104, temperate 302-304, swamp 402-404: the plain set, then winter, then rain. A rain
 *  set left out (404) takes its plain set's ground. */
// prettier-ignore
export const CLIMATES: Readonly<Record<number, GroundClimate>> = {
  2: {
    classes: [
      { kind: 'water', shades: 'blu 8.5 1.2/1.4, ~tea 10 1/1 *.031' },
      { kind: 'sand', shades: 'snd 3.9 .9/1.1, ~pch 2 .6/.6 *.08' },
      { kind: 'sand', shades: 'snd 3.5 1/3.1, ~pch 2 .6/.6 *.071, ~mau 5.5 .8/.8 *.02, ~org 3 1.4/1.4 *.009', dark: 0.06 },
      { kind: 'gravel', shades: 'snd 7.6 1.3/1.6 *.81, pch 6.3 .2/.8 *.19, ~org 2 1/1 *.018' },
    ],
    shore: 'lav 9.8 1.1/1.5, ~rbr 8.5 .8/.8 *.008',
    weed: 'sag 7.7 1.4/.6 *.98, grs 1.4 .5/2.1 *.02',
    paving: 'snd 8.8 2.9/1.3, ~pch 2 .6/.6 *.011',
    field: 'snd 6.2 1.6/1.9, ~pch 5 1.4/1.4 *.08, ~org 2 1/1 *.035, ~mau 6.5 .8/.8 *.004',
    meet: {
      DS: 'S .15 .05/.14',
      DW: 'W .06 0/.08 1.6, S .68 .15/.16, V .39 -.05/.08, X .35 -.1/.08 8.2, t 1.2/.15',
      GW: 'X .96 -.25/.24 7.1',
      SD: 'D .92 -.2/.2',
      SW: 'W .62 -.15/.16 3.4, K .18 -.3/.28, X .15 .1/.12 6.1, t 3.3/.35',
      WD: 'D .37 .15/.12 5.7, S .29 0/.08 1.7, K .07 .1/.24, V .29 .2/.18',
      WG: 'G .93 -.1/.26 6.1, K .18 .25/.18, V .06 .25/.16, t 3/.45',
      WS: 'S .32 .05/.16 3.1, K .07 0/.24 .8, V .09 .25/.14, t 2.1/.45',
    },
  },
  3: {
    classes: [
      { kind: 'water', shades: 'blu 8.5 1.2/1.4, ~tea 10 1/1 *.031' },
      { kind: 'sand', shades: 'snd 3.9 .9/1.1, ~pch 2 .6/.6 *.08' },
      { kind: 'sand', shades: 'snd 8.8 5/1.7 *.85, pch 1 .5/.5 *.1, fir 4 .5/.5 *.05, ~lav 7.5 1.2/1.2 *.015, ~mau 6.5 1.2/1.2 *.01, ~ylw 12.5 .4/.4 *.009', dark: 0.1 },
      { kind: 'gravel', shades: 'pch 7.8 .9/5 *.63, snd 9.3 1.2/2.4 *.37' },
    ],
    shore: 'org 10.8 5/.5',
    weed: 'sag 7.7 1.4/.6 *.98, grs 1.6 1.9/2.4 *.02',
    paving: 'snd 10.4 1.2/.9, ~gry 10.5 .8/.8 *.064, ~pch 1.5 .4/.4 *.016',
    field: 'snd 7.5 2.5/1.5, ~pch 7 2.2/2.2 *.114',
    meet: {
      DS: 'S .11 .05/.1',
      DW: 'V .39 -.05/.08, X .6 -.25/.14 9.1, t 1.2/.15',
      GS: 'S .44 -.3/.36, t 1.9/.75',
      GW: 'S .42 .1/.26 1.3, t 2.7/.63',
      SD: 'D .95 -.3/.46',
      SG: 'G .56 .1/.32 1.8',
      SW: 'W .74 -.3/.26 3.7, D .07 .4/.14 8.4, G .42 .05/.14 4.4',
      WD: 'D .61 0/.2 2.9, V .29 .2/.18',
      WG: 'G .66 .1/.22 4.1, S .25 .05/.08 1.7, V .06 .25/.16, t 3/.45',
      WS: 'G .3 .1/.16 5.4, S .09 0/.1 1.5, V .09 .25/.14, t 2.1/.45',
    },
  },
  4: {
    classes: [
      { kind: 'water', shades: 'blu 9.5 1.2/1.4, ~tea 11 1/1 *.031' },
      { kind: 'sand', shades: 'snd 4.4 .7/2, ~pch 3 .2/.2 *.067, ~org 0 .2/.2 *.006' },
      { kind: 'sand', shades: 'snd 7.1 2.8/1.3, ~pch 5 1/1 *.062, ~mau 6.5 .8/.8 *.02, ~org 0 .2/.2 *.009', dark: 0.06 },
      { kind: 'gravel', shades: 'snd 8.5 1.2/1.7 *.8, pch 8 .9/.4 *.2, ~org 2 1/1 *.008' },
    ],
    shore: 'lav 10.8 1.1/1.5, ~rbr 9.5 .8/.8 *.048',
    weed: 'sag 8.7 1.4/.6 *.99',
    paving: 'snd 7 .3/3.2, ~pch 13 .2/.2 *.011, ~org 5 2.2/2.2 *.01',
    field: 'snd 6.5 .2/2, ~pch 6.5 1.6/1.6 *.09, ~org 2 1/1 *.025, ~mau 7.5 .8/.8 *.004',
    meet: {
      DS: 'S .35 -.2/.2',
      DW: 'W .06 0/.08 1.6, S .71 .15/.14, V .39 -.05/.08',
      GW: 'X .72 -.2/.22 6.9',
      SD: 'D .7 -.05/.08',
      SW: 'W .62 -.15/.16 3.4, K .2 -.25/.26, X .09 .05/.18 5.7, t 3.6/.38',
      WD: 'D .37 .15/.12, S .96 -.15/.12 1.8, K .07 .1/.24, V .29 .2/.18',
      WG: 'G .94 -.1/.26 5.9, K .18 .25/.18, V .06 .25/.16, t 3/.45',
      WS: 'S .32 .05/.16 3.1, K .07 0/.24 .8, V .09 .25/.14, t 2.1/.45',
    },
  },
  102: {
    classes: [
      { kind: 'water', shades: 'blu 8.5 1.2/1.4, ~tea 10 1/1 *.031' },
      { kind: 'earth', shades: 'snd 12.8 1.3/.7 *.85, grs 13.5 1.1/.2 *.15, ~pch 14 .6/.6 *.056, ~sag 11 1.8/1.8 *.054, ~gry 11.5 1.2/1.2 *.031, ~ylw 14.5 .4/.4 *.025' },
      { kind: 'sward', shades: 'sag 10.3 1/.9 *.35, snd 13.6 1.2/.2 *.32, gry 12.5 .7/1 *.18, grs 12.1 .5/.7 *.15, ~tea 14.5 .4/.4 *.042, ~pch 14 .6/.6 *.023, ~lav 13 .6/.6 *.013, ~ylw 14.5 .4/.4 *.007' },
      { kind: 'gravel', shades: 'gry 11.6 .6/1 *.96, ~lav 12.5 .8/.8 *.098, ~sag 9.5 .8/.8 *.08, ~snd 12 1/1 *.069, pch 14.4 .2/1.4 *.03, ~mau 11 .6/.6 *.014, ~tea 14 .2/.2 *.01, ~grs 12.5 .4/.4 *.01' },
    ],
    shore: 'lav 10 1.2/1.2, ~ylw 14 .4/.4 *.08',
    paving: 'gry 13.9 2.4/1.3 *.76, lav 13 .2/.2 *.18, org 8.5 .3/.2 *.07',
    field: 'snd 8.9 2/1.6, ~pch 8 2.2/2.2 *.02, ~gry 12.5 .8/.8 *.007',
    meet: {
      DG: 'G .45 0/.18 -1, S .05 .55/.28',
      DS: 'S .18 -.3/.42',
      DW: 'W .14 .05/.08 2.1, S .64 -.1/.3 -.9',
      GD: 'D .45 0/.18, S .09 1/.48',
      GS: 'S .08 .45/.24',
      GW: 'W .87 -.3/.36 2.8, S .1 1/.28',
      SD: 'D .81 -.3/.48',
      SG: 'G .96 -.05/.18 -.8',
      SW: 'W .32 .05/.28 2.9, G .05 .7/.18 -1.4',
      WD: 'D .29 .35/.24 -2.2, S .8 -.15/.32 -1, t 2.2/.3',
      WG: 'G .6 -.3/.26, S .06 .2/.12, t 2.2/.22',
      WS: 'G .06 .3/.22 -1.6, S .96 -.3/.3, t 2.6/.38',
    },
  },
  103: {
    classes: [
      { kind: 'water', shades: 'blu 8.5 1.2/1.4, ~tea 10 1/1 *.031' },
      { kind: 'snow', shades: 'lav .7 2/.2 *.57, gry .4 .7/.3 *.43, ~tea .5 .4/.4 *.022' },
      { kind: 'snow', shades: 'lav .2 .4/.5 *.56, gry .3 .3/.3 *.44, ~tea .5 .4/.4 *.022' },
      { kind: 'snow', shades: 'lav .2 .4/.5 *.56, gry .1 .2/.4 *.44, ~tea 0 .2/.2 *.022' },
    ],
    shore: 'gry 9 1.5/1.5 *.5, lav 8 1.5/1.5 *.3, org 9 .6/.6 *.2',
    weed: 'sag 6 1.5/1.5',
    paving: 'gry 11.4 3/.6 *.89, lav 11.7 .4/.8 *.09',
    field: 'lav .2 .4/.5 *.56, gry .1 .2/.4 *.44, ~tea 0 .2/.2 *.022',
    meet: {
      DW: 'W .71 -.05/.14 1.4, X .23 .15/.12 6.3',
      GD: 'D .45 0/.18 1',
      GW: 'W .74 -.25/.2 2.1',
      SD: 'D .45 0/.18 1',
      SW: 'W .81 -.1/.22, X .16 .15/.16 4.5',
      WD: 'D .23 0/.16 4.2, X .05 .2/.18 5.6, t 1.2/.27',
      WG: 'G .55 0/.24, X .17 .2/.22 5.6, t 3.3/.38',
      WS: 'S .28 -.1/.22 4.8',
    },
  },
  104: {
    classes: [
      { kind: 'water', shades: 'blu 10.5 1.2/1.5, ~tea 11.5 .8/.8 *.028' },
      { kind: 'earth', shades: 'pch 14.8 1.2/1.4 *.64, sag 14 .5/.5 *.19, snd 15 .6/.2 *.17, ~gry 12.5 .8/.8 *.029, ~ylw 15 .2/.2 *.026' },
      { kind: 'sward', shades: 'sag 14.5 1.9/.2 *.55, pch 15 .8/.2 *.32, ~gry 13.5 .8/.8 *.111, mau 14.6 .2/.6 *.09, ~snd 13.5 .8/.8 *.051, org 8.1 5/.2 *.04, ~lav 14 .2/.2 *.012, ~ylw 15 .2/.2 *.007' },
      { kind: 'gravel', shades: 'gry 13.8 .8/.4 *.77, mau 14.7 .3/5 *.21, ~lav 14 .6/.6 *.092, ~sag 12 1/1 *.09, ~snd 13.5 .8/.8 *.047, ~pch 14 .6/.6 *.046, org 8.3 .8/.4 *.02' },
    ],
    shore: 'lav 9.5 1.2/1',
    weed: 'sag 9 1/1',
    paving: 'gry 15 1.5/.2 *.41, org 8.1 5/2.1 *.38, lav 12.9 .4/.5 *.21',
    field: 'snd 11.5 2.4/.5 *.86, pch 12.7 .2/.8 *.14',
    meet: {
      DG: 'G .45 0/.18 -1, S .08 .5/.24',
      DS: 'S .16 -.3/.44',
      DW: 'W .14 .05/.08 2, S .63 -.1/.3 -.8',
      GD: 'D .45 0/.18, S .09 .9/.44',
      GS: 'S .08 .4/.22',
      GW: 'W .94 -.3/.36 2.8, S .08 1/.48',
      SD: 'D .86 -.3/.46',
      SG: 'G .95 -.05/.18',
      SW: 'W .33 0/.3 2.9, G .05 .7/.2 -1.6',
      WD: 'D .26 .35/.22 -2.1, S .82 -.15/.32 -.9, t 2.2/.3',
      WG: 'G .66 -.3/.24, S .07 .2/.12, t 2.2/.22',
      WS: 'G .06 .15/.26 -1.4, S .94 -.3/.3, t 2.6/.38',
    },
  },
  302: {
    classes: [
      { kind: 'water', shades: 'blu 8.5 1.2/1.4, ~tea 10 1/1 *.031', tune: { base: 0.37, amp: 0.72, fine: 0.16, texel: 0.14 } },
      { kind: 'earth', shades: 'snd 9.5 2.1/.3, ~pch 8 2.6/2.6 *.013, ~gry 11.5 .4/.4 *.009', tune: { amp: 0.14, fine: 0.11, bump: 0.16, stones: 13, specks: 9 } },
      { kind: 'sward', shades: 'grs 12.4 1.5/.2 *.56, sag 9.4 .8/.7 *.44', tune: { amp: 0.27, cells: 5, texel: 0.35, bump: 0.47, blades: 1.9, dark: 0.19, light: 0.09 } },
      { kind: 'gravel', shades: 'gry 8.4 .2/1.8 *.67, lav 11.3 .4/.9 *.32, ~snd 12 1/1 *.039, ~pch 14 .6/.6 *.019', tune: { base: 0.66, amp: 0.36, cells: 12, fine: 0.13, texel: 0.15, bump: 4.6, pebbles: 0.26 } },
    ],
    weed: 'sag 6.5 1/.8',
    shore: 'gry 10.5 1/1 *.6, lav 10 1.2/1 *.4, ~mau 6 .8/.8 *.04',
    paving: 'gry 8.9 3/1.2',
    field: 'snd 8.9 2/1.6, ~pch 8 2.2/2.2 *.02, ~gry 12.5 .8/.8 *.007',
    meet: {
      DG: 'G .47 -.3/.66, S .07 .2/.4 .8, t 1.1/.88',
      DS: 'S .28 -.3/.32',
      DW: 'W .17 0/.1 2, S .53 .05/.26, t 2.6/.43',
      GD: 'D .47 -.3/.4 1.5, S .06 .15/.2 1.1',
      GS: 'D .11 -.05/.18 2.2, S .17 -.25/.24, t -1.2/.15',
      GW: 'W .84 -.25/.36 2.9, S .2 -.3/.24, t -.9/.73',
      SD: 'D .9 -.3/.42 1.4, t -1/.25',
      SG: 'D .12 .15/.16 2.9, G .77 -.05/.2',
      SW: 'W .34 0/.3 2.9, t -1.8/.4',
      WD: 'D .18 -.15/.38 2.8, G .21 .35/.24 -3.6, S .61 -.15/.34, t 2.2/.3',
      WG: 'G .33 -.3/.28 -1.3, S .06 .1/.16, t 2.2/.22',
      WS: 'S .93 -.3/.3 -1.2, X .04 .15/.18 5.6, t 2.6/.38',
    },
  },
  303: {
    classes: [
      { kind: 'water', shades: 'blu 8.5 1.2/1.4, ~tea 10 1/1 *.031' },
      { kind: 'snow', shades: 'gry .1 5/.6 *.66, lav .6 1/.2 *.34, ~blu 0 .2/.2 *.015, ~sag 0 .2/.2 *.014' },
      { kind: 'snow', shades: 'gry .1 5/.6 *.59, lav .6 .8/.2 *.41, ~sag .5 .4/.4 *.021, ~blu 0 .2/.2 *.015, ~tea 0 .2/.2 *.005' },
      { kind: 'snow', shades: 'gry 0 .2/.7 *.58, lav .3 .7/.4 *.42, ~blu .5 .4/.4 *.015, ~sag .5 .4/.4 *.014, ~tea .5 .4/.4 *.005' },
    ],
    shore: 'snd 10.9 2/1.1 *.97, ~pch 13.5 .8/.8 *.103, org 8.6 .9/.2 *.03',
    weed: 'sag 6 1.2/1',
    paving: 'gry 8.9 3/1.2',
    field: 'gry 0 .2/.5 *.61, lav .6 .7/.2 *.39, ~sag 0 .2/.2 *.016, ~blu 0 .2/.2 *.015, ~tea 0 .2/.2 *.005',
    meet: {
      DS: 'S .45 0/.18 .9',
      DW: 'W .48 -.25/.18 1.6, K .08 .05/.1 1.5, X .57 -.05/.16 8.3',
      GW: 'W .53 0/.12 2.3, X .17 .05/.14 8.3',
      SD: 'D .45 0/.18, X .11 .15/.1 6.6',
      SW: 'W .4 -.3/.3 2.5, X .55 .1/.24 8.1',
      WD: 'D .72 0/.36 9.6, K .06 .05/.32 1.2, t 2.2/.3',
      WG: 'G .64 -.3/.28 5.4, t 1.8/.22',
      WS: 'S 1 -.25/.28 8, t 2.3/.4',
    },
  },
  304: {
    classes: [
      { kind: 'water', shades: 'blu 9.5 1.2/1.4, ~tea 11 1/1 *.031' },
      { kind: 'earth', shades: 'snd 10.5 2.1/.3, ~gry 12.5 .4/.4 *.009, ~pch 7 1.8/1.8 *.008' },
      { kind: 'sward', shades: 'sag 11.7 1.5/.5, ~grs 10.5 .4/.4 *.112' },
      { kind: 'gravel', shades: 'gry 9.4 .2/1.8 *.66, lav 12.3 .4/.9 *.32, ~pch 14 .6/.6 *.033, ~snd 13 1/1 *.025, org 8.1 .3/.5 *.02' },
    ],
    weed: 'sag 7 1/.8',
    shore: 'lav 8 1/1.5 *.6, gry 11.5 1/1 *.4, ~mau 7 .8/.8 *.04',
    paving: 'gry 9.8 2.9/1.3, ~lav 8.5 2.8/2.8 *.008',
    field: 'snd 9.8 1.9/1.5 *.99, ~pch 10 2.2/2.2 *.045',
    meet: {
      DG: 'G .47 -.3/.66, S .07 .2/.4 .9, t 1.1/.88',
      DS: 'S .26 -.3/.32',
      DW: 'W .43 -.3/.24 1.8, S .53 0/.36, t 2.5/.5',
      GD: 'D .47 -.3/.4 1.5, S .06 .15/.2 1.2',
      GS: 'D .11 -.05/.18 2.2, S .15 -.25/.26',
      GW: 'W .9 -.3/.38 2.9, S .2 -.3/.24 .8',
      SD: 'D .9 -.3/.42 1.4, t -1/.25',
      SG: 'D .12 .15/.16 2.9, G .77 -.05/.2',
      SW: 'W .34 0/.3 2.9, t -1.8/.4',
      WD: 'D .17 -.05/.32 2.8, G .21 .35/.24 -3.1, S .56 -.1/.32, t 2.2/.3',
      WG: 'G .33 -.3/.28 -1, S .06 .1/.16, t 2.2/.22',
      WS: 'S .94 -.3/.3 -1.1, t 2.6/.38',
    },
  },
  402: {
    classes: [
      { kind: 'water', shades: 'blu 8.5 1.2/1.4, ~tea 10 1/1 *.031' },
      { kind: 'mud', shades: 'grs 14.5 .9/.2 *.37, sag 10 1/.8 *.27, blu 13.8 .2/.5 *.18, tea 13 .7/.7 *.15, ~gry 11.5 .8/.8 *.043, ~snd 13 .6/.6 *.028, org 9.8 .3/.3 *.02, ~pch 15 .2/.2 *.01' },
      { kind: 'marsh', shades: 'pch 13.3 1.2/1.5 *.47, grs 11.4 .3/2.3 *.34, sag 14 3.7/.4 *.14, ~snd 12.5 1.2/1.2 *.113, org 8.4 3.8/.3 *.03, ~gry 13.5 .4/.4 *.011' },
      { kind: 'moss', shades: 'grs 11.6 .4/1.8 *.48, sag 11.5 1/.3 *.48, org 11.3 1.5/.4 *.04, ~tea 14 .6/.6 *.009' },
    ],
    weed: 'sag 5.5 .8/.8',
    shore: 'lav 10 1.5/1.5 *.6, snd 13.5 .5/.5 *.4',
    paving: 'gry 8.9 3/1.2',
    field: 'pch 9.4 .2/2.3 *.64, snd 9.6 .4/1 *.36',
    meet: {
      DG: 'G .55 -.25/.42 .9',
      DW: 'W .55 -.3/.62 3.2',
      GD: 'D .3 .1/.3, t 1.1/.88',
      GW: 'W .49 -.3/.36 3.5, D .44 .2/.32',
      SG: 'G .45 0/.18 1',
      SW: 'W .95 -.3/.38 3.1, t -1.2/.15',
      WD: 'D .28 -.3/.56, t 2.2/.45',
      WG: 'D .46 -.3/.36 -1, G .29 -.3/.26 -1.3, t 2.9/.25',
      WS: 'S .27 -.3/.4 -2.4, t 1.5/.45',
    },
  },
  403: {
    classes: [
      { kind: 'water', shades: 'blu 8.5 1.2/1.4, ~tea 10 1/1 *.031' },
      { kind: 'snow', shades: 'gry 9.8 3.4/.3 *.76, lav 8.7 5/.2 *.24, ~sag 4.5 1.2/1.2 *.067', tune: { amp: 0.6, cells: 6, octaves: 3, fine: 0.04, texel: 0.03, bump: 1.6 } },
      { kind: 'snow', shades: 'gry 0 .2/.6 *.56, lav .2 1.4/.5 *.44, ~blu 0 .2/.2 *.014, ~sag 0 .2/.2 *.006' },
      { kind: 'snow', shades: 'gry 0 .2/1.8 *.57, lav 0 .2/.9 *.41, ~sag 7 3/3 *.102, grs 10.1 .3/3.2 *.02, ~blu 0 .2/.2 *.009, ~tea 1 .6/.6 *.004', tune: { blades: 2.4, clumps: 1, spread: 4, lean: [0.2, 1], dark: 0.6, light: 0, length: 3 } },
    ],
    shore: 'pch 12.3 .2/2.8 *.49, snd 12.5 .3/1.3 *.42, org 8.1 5/1.1 *.09',
    paving: 'gry 8.9 3/1.2',
    field: 'gry .5 .3/.2 *.56, lav .3 5/.4 *.44, ~blu 0 .2/.2 *.014, ~sag 0 .2/.2 *.007, ~tea 0 .2/.2 *.004',
    meet: {
      DG: 'G .5 -.3/.4',
      DS: 'S .23 -.05/.44',
      DW: 'W .78 -.3/.32 3.2, S .11 0/.92 2.5',
      GD: 'D .31 .05/.14',
      GW: 'W .24 0/.12 3.3, D .23 .05/.2, X .37 -.3/.2 10.7',
      SD: 'D 1 -.15/.16, t 1.2/.15',
      SG: 'D .05 .8/.08 -.9, G .45 0/.18',
      SW: 'W .58 -.05/.16 2.7, D .19 .15/.14 -.8, X .05 .55/.22 12.4, t 1.7/.3',
      WD: 'D .19 .05/.4 1.3, S .08 -.3/.56 6.6, X .08 -.1/.56 5.6, t 2.2/.45',
      WG: 'D .17 0/.24, G .56 -.25/.28 3.4, t 2.9/.25',
      WS: 'D .17 .15/.16, S .5 -.25/.24 3.6, t 1.2/.35',
    },
  },
};

/** Each painter's settings; a climate's class may override any of them. */
export const KINDS: Readonly<Record<GroundKind, KindSettings>> = {
  water: { base: 0.45, amp: 0.45, cells: 3, fine: 0.1, texel: 0.22, bump: 0 },
  earth: { base: 0.5, amp: 0.12, cells: 4, fine: 0.05, texel: 0.12, bump: 0.3, stones: 5, specks: 3 },
  mud: { base: 0.5, amp: 0.16, cells: 4, fine: 0.08, texel: 0.3, bump: 0.6, pebbles: 0.08 },
  sand: { base: 0.55, amp: 0.14, cells: 3, fine: 0.08, texel: 0.26, bump: 0.5, pebbles: 0.05 },
  gravel: { base: 0.58, amp: 0.26, cells: 6, fine: 0.1, texel: 0.4, bump: 1.2, pebbles: 0.14 },
  moss: { base: 0.55, amp: 0.24, cells: 6, fine: 0.1, texel: 0.36, bump: 1.2, pebbles: 0.1 },
  sward: {
    base: 0.45,
    amp: 0.1,
    cells: 4,
    fine: 0.06,
    texel: 0.22,
    bump: 0.4,
    blades: 3,
    lean: [0.35, 1.1],
    dark: 0.22,
    light: 0.2,
  },
  marsh: { base: 0.5, amp: 0.16, cells: 4, fine: 0.08, texel: 0.3, bump: 0.4, blades: 3.2 },
  snow: { base: 0.55, amp: 0.1, cells: 2, fine: 0.05, texel: 0.06, bump: 1.4 },
};
