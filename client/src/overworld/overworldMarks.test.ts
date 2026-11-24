import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Vec3 } from './ground.ts';
import { eyeFor, poseOf, projectPoint, TILT } from './overworldCamera.ts';
import { edgeHold, MARK, MARK_KINDS, markGrow, pickMark, placeMarks, type Mark } from './overworldMarks.ts';

const viewport = { width: 1600, height: 900 };
const ship: Vec3 = [3_800_000, 2_400_000, 0];
const seaPose = poseOf(eyeFor(ship, 0, TILT.initial, 260));
const mark = (id: string, place: Vec3, edge = false): Mark => ({ id, kind: 'mission', name: id, at: place, edge });

test('the nodes are marked by kind: social spaces, patrol areas, missions, dungeons, world bosses, ports and the Playlist', () => {
  assert.deepEqual([...MARK_KINDS], ['social', 'patrol', 'mission', 'dungeon', 'boss', 'outpost', 'port', 'playlist']);
});

test('a mark grows with the eye height over it from its own size at 260 m', () => {
  assert.equal(markGrow(260), 1);
  assert.equal(markGrow(100), 1, 'never smaller than itself');
  assert.equal(markGrow(520), 2);
  assert.equal(markGrow(26_000), 100);
  assert.equal(markGrow(Number.NaN), 1);
});

test('a point on the picture is not held; one off it is held at the edge with its arrow pointing to it', () => {
  assert.equal(edgeHold({ x: 800, y: 450, depth: 10, front: true }, 1600, 900), null);
  const right = edgeHold({ x: 5_000, y: 450, depth: 10, front: true }, 1600, 900);
  assert.deepEqual(right, { x: 1600 - MARK.edgeMarginPx, y: 450, angle: 90 });
  const above = edgeHold({ x: 800, y: -2_000, depth: 10, front: true }, 1600, 900, 28, 60, 28);
  assert.deepEqual(above, { x: 800, y: 60, angle: 0 }, 'under furniture at the top');
  const behind = edgeHold({ x: 5_000, y: 450, depth: -10, front: false }, 1600, 900);
  assert.equal(behind?.x, MARK.edgeMarginPx, 'behind the eye, mirrored');
  const straightBehind = edgeHold({ x: 800, y: 450, depth: -10, front: false }, 1600, 900);
  assert.deepEqual([straightBehind?.x, straightBehind?.y], [800, 900 - MARK.edgeMarginPx], 'straight behind: below');
  assert.equal(Math.abs(straightBehind?.angle ?? 0), 180);
});

test('marks on the picture are laid where they project, farthest first; those off it are held or left out', () => {
  const near = mark('near', [ship[0], ship[1] - 50, 0]);
  const far = mark('far', [ship[0] + 100, ship[1] - 400, 0]);
  const gone = mark('gone', [ship[0], ship[1] + 5_000, 0]);
  const held = mark('held', [ship[0], ship[1] + 5_000, 0], true);
  const placed = placeMarks([near, gone, far, held], seaPose, viewport);
  assert.deepEqual(
    placed.map((each) => each.id),
    ['held', 'far', 'near'],
  );
  const nearPoint = projectPoint(seaPose, viewport, near.at);
  assert.equal(placed[2].x, nearPoint.x);
  assert.equal(placed[2].held, false);
  assert.equal(placed[2].arrowDegrees, null);
  assert.equal(placed[0].held, true);
  assert.equal(placed[0].sizePx, MARK.heldPx);
  assert.equal(Math.abs(placed[0].arrowDegrees ?? 0), 180, 'behind the camera: its arrow points down');
});

test('a mark is its world size over its depth on the screen, held between the smallest and largest sizes', () => {
  const focal = viewport.height / 2 / Math.tan(seaPose.fovY / 2);
  const target = mark('target', [ship[0], ship[1] - 100, 0]);
  const [placed] = placeMarks([target], seaPose, viewport);
  const depth = projectPoint(seaPose, viewport, target.at).depth;
  assert.equal(placed.worldM, MARK.worldM);
  assert.ok(Math.abs(placed.sizePx - (MARK.worldM * focal) / depth) < 1e-9);
  const underfoot = placeMarks([mark('underfoot', [ship[0], ship[1] + 150, 240])], seaPose, viewport);
  assert.equal(underfoot[0]?.sizePx, MARK.maxPx);
  const lookingOut = poseOf(eyeFor(ship, 0, TILT.lowest, 450));
  const distant = placeMarks([mark('distant', [ship[0], ship[1] - 20_000, 0])], lookingOut, viewport);
  assert.equal(distant[0]?.sizePx, MARK.minPx);
});

test('a node at the focus reads at one size from the sea camera and from the bird-eye view 100 km up', () => {
  const node = mark('node', ship);
  const fromSea = placeMarks([node], seaPose, viewport)[0];
  const highPose = poseOf(eyeFor(ship, 0, TILT.initial, 100_000));
  const fromAbove = placeMarks([node], highPose, viewport)[0];
  assert.ok(Math.abs(fromAbove.sizePx / fromSea.sizePx - 1) < 1e-9, `${fromSea.sizePx} px and ${fromAbove.sizePx} px`);
  assert.ok(fromAbove.worldM > 9_000, 'it stands kilometres tall to read from up there');
});

test('a pointer picks the nearest mark whose square holds it, and nothing off them', () => {
  const back = mark('back', [ship[0], ship[1] - 200, 0]);
  const front = mark('front', [ship[0], ship[1] - 190, 0]);
  const placed = placeMarks([back, front], seaPose, viewport);
  const point = projectPoint(seaPose, viewport, back.at);
  assert.equal(pickMark(placed, point.x, point.y), 'front', 'the nearer is drawn over it');
  assert.equal(pickMark(placed, 5, 5), null);
  assert.equal(pickMark([], 800, 450), null);
});
