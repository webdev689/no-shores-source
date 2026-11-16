// The builder every forge lays its faces through: each face's picture laid at TEXELS_PER_METRE by the face's own
// plane, each face wound to its normal, and the same builder seen turned, so a family can build along its piece's
// long side or toward its door whichever way the piece stands.
import { meshBuilder, type ForgedModel, type Picture } from './model.ts';
import { solidsOf, type Solids } from './solids.ts';
import { faceNormal, type Vector } from './vector.ts';

/** Texels a metre a picture is laid at. */
export const TEXELS_PER_METRE = 40;
/** The wood a frame wears where its piece wore no wood of its own: Daggerfall's plain plank, 32 x 64. */
export const PLAIN_WOOD: Picture = [67, 0, 32, 64];

/** A face: its picture, its corners round its edge, and its normal, else its corners' own. */
export type Face = (
  picture: readonly number[],
  corners: readonly (readonly number[])[],
  normal?: readonly number[],
) => void;

export type PartBuilder = Solids & {
  quad: Face;
  tri: Face;
  /** A quad with its own UVs, never turned: a picture laid once over a face. */
  quadUv(
    picture: readonly number[],
    corners: readonly (readonly number[])[],
    normal: readonly number[],
    mapping: readonly (readonly number[])[],
  ): void;
  model(): ForgedModel;
  /** The same builder with x and z swapped. */
  crosswise(): PartBuilder;
  /** The same builder mirrored across z = zSum / 2. */
  mirror(zSum: number): PartBuilder;
};

const swap = (point: readonly number[]): Vector => [point[2], point[1], point[0]];

export function partBuilder(): PartBuilder {
  const mesh = meshBuilder();
  const uvOf = (picture: readonly number[], corner: readonly number[], normal: readonly number[]): Vector => {
    const [, , wide, tall] = picture;
    const alongX = Math.abs(normal[0]),
      alongY = Math.abs(normal[1]);
    const [across, upward] =
      alongX >= alongY && alongX >= Math.abs(normal[2])
        ? [corner[2], corner[1]]
        : alongY >= Math.abs(normal[2])
          ? [corner[0], corner[2]]
          : [corner[0], corner[1]];
    return [(across * TEXELS_PER_METRE) / wide, (-upward * TEXELS_PER_METRE) / tall];
  };
  const quad: Face = (picture, corners, normal = faceNormal(corners)) =>
    mesh.quad(
      [picture[0], picture[1]],
      corners,
      normal,
      corners.map((corner) => uvOf(picture, corner, normal)),
    );
  const tri: Face = (picture, corners, normal = faceNormal(corners)) =>
    mesh.tri(
      [picture[0], picture[1]],
      corners,
      normal,
      corners.map((corner) => uvOf(picture, corner, normal)),
    );
  const model = (): ForgedModel => mesh.model();
  const quadUv: PartBuilder['quadUv'] = (picture, corners, normal, mapping) =>
    mesh.quad([picture[0], picture[1]], corners, normal, mapping);
  const seen = (
    turn: (point: readonly number[]) => readonly number[],
    turnNormal: (normal: readonly number[]) => readonly number[],
  ): PartBuilder => {
    const turnedQuad: Face = (picture, corners, normal = faceNormal(corners)) =>
      quad(picture, corners.map(turn), turnNormal(normal));
    const turnedTri: Face = (picture, corners, normal = faceNormal(corners)) =>
      tri(picture, corners.map(turn), turnNormal(normal));
    return {
      ...solidsOf(turnedQuad, turnedTri),
      quad: turnedQuad,
      tri: turnedTri,
      quadUv,
      model,
      crosswise: () =>
        seen(
          (point) => turn(swap(point)),
          (normal) => turnNormal(swap(normal)),
        ),
      mirror: (zSum) =>
        seen(
          (point) => turn([point[0], point[1], zSum - point[2]]),
          (normal) => turnNormal([normal[0], normal[1], -normal[2]]),
        ),
    };
  };
  return seen(
    (point) => point,
    (normal) => normal,
  );
}
