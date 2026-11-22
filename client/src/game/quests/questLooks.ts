// How the houses' roads' figures look: each speaker of content/story/cast.json a step may walk with, as the keepers
// wear their own dress at their counters, and the roads' new faces in the forge's pieces the keepers wear; or a roster
// type's own look, as its foes are dressed. A figure's look on the wire counts the cast's speakers from 1, and a
// roster type's number from 101.
import cast from '../../../../content/story/cast.json' with { type: 'json' };
import { type Dress, plainDress } from '../../player/dressing.ts';
import { foeDress } from '../../player/foeDress.ts';
import type { FoeType } from '../../rules/roster.ts';
import { KEEPERS, KEEPER_KINDS, dressed } from '../keepers.ts';

/** A figure as it is drawn: its dress, and how many times life size. */
export interface Face {
  readonly dress: Dress;
  readonly scale?: number;
}

/** The cast's speakers in its order. */
export const SPEAKERS: readonly string[] = Object.keys(cast.speakers);
/** A roster type's look on the wire is its number past this. */
export const ROSTER_LOOKS = 100;

/** The roads' own faces. Pell, a young Stormcaller, in the house's blue as Arlo Kestrel wears it, without his cloak or
 *  steel; Tobin, a ship's boy, small and in plain deck clothes; Wren, a Veiled runner, in grey and close-fitting, for
 *  running; High Assessor Corvane and the Tithe's Reeve in the Tithe's grey, the Reeve in leather as its guards are. */
export const FACES: Readonly<Record<string, Face>> = {
  pell: {
    dress: dressed(
      'male',
      'human',
      0.4,
      { style: 'tied', colour: 'brown' },
      ['shirt_long_v', 'short_tunic', 'breeches', 'tall_boots'],
      { short_tunic: 'Blue', breeches: 'Grey', tall_boots: 'DarkBrown' },
    ),
  },
  tobin: {
    dress: dressed(
      'male',
      'human',
      0.55,
      { style: 'crop', colour: 'blond' },
      ['shirt_short_round', 'breeches', 'shoes'],
      { shirt_short_round: 'White', breeches: 'DarkBrown', shoes: 'DarkBrown' },
    ),
    scale: 0.85,
  },
  wren: {
    dress: dressed(
      'female',
      'human',
      0.35,
      { style: 'short', colour: 'black' },
      ['shirt_long_round', 'vest', 'casual_pants', 'boots'],
      { shirt_long_round: 'Grey', vest: 'Grey', casual_pants: 'DarkBrown', boots: 'DarkBrown' },
    ),
  },
  corvane: {
    dress: dressed(
      'male',
      'human',
      0.75,
      { style: 'crop', colour: 'grey' },
      ['shirt_long_deep', 'vest', 'breeches', 'tall_boots'],
      { shirt_long_deep: 'White', vest: 'Grey', breeches: 'Grey', tall_boots: 'DarkBrown' },
    ),
  },
  reeve: {
    dress: dressed(
      'male',
      'human',
      0.6,
      { style: 'tied', colour: 'black' },
      ['shirt_long_round', 'short_tunic', 'breeches', 'tall_boots'],
      { shirt_long_round: 'Grey', short_tunic: 'Grey', breeches: 'DarkBrown', tall_boots: 'DarkBrown' },
      { cuirass: 'leather' },
    ),
  },
};

/** How the speaker `key` looks: the roads' own face, a keeper's dress, or the townsfolk's plain one. */
export function speakerFace(key: string): Face {
  const keeper = KEEPER_KINDS.find((kind) => KEEPERS[kind].speaker === key);
  return FACES[key] ?? { dress: keeper ? KEEPERS[keeper].dress : plainDress('human', 0.5) };
}

/** How a figure of look `look` is drawn, by `roster`'s types; none for a look neither the cast nor the roster holds. */
export function faceOf(look: number, roster: readonly FoeType[]): Face | null {
  if (look > ROSTER_LOOKS) {
    const type = roster.find((each) => each.type === look - ROSTER_LOOKS);
    const dress = type ? foeDress(type) : null;
    return dress ? { dress } : null;
  }
  const speaker = SPEAKERS[look - 1];
  return speaker === undefined ? null : speakerFace(speaker);
}
