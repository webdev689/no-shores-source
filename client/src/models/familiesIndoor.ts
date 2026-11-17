// A shop's and a workshop's pieces: shelves, lecterns, armchairs and thrones, racks, boards, panels, beams and
// hangings, ladders, troughs, carts, siege engines, boats, huts and tents, each built in its piece's box (front +z)
// from the solids and dressed in its pictures.
import type { Picture } from './model.ts';
import { PLAIN_WOOD } from './parts.ts';
import { clampTo, doorAxes, lengthwise } from './frame.ts';
import { DOOR_FRAME_M } from './doors.ts';
import { CHAIR_SEAT_M } from './familiesHome.ts';
import type { Family } from './propRoles.ts';

/** The first of `looks` that is no plain plank (archive 67) and no swatch (archive 0): a shelf's goods, a sign's
 *  face; else the first. */
export const faceLook = (looks: readonly Picture[]): Picture =>
  looks.find(([archive]) => archive !== 67 && archive !== 0) ?? looks[0];
/** The first plank of `looks`, else the plain one. */
export const woodLook = (looks: readonly Picture[]): Picture => looks.find(([archive]) => archive === 67) ?? PLAIN_WOOD;

export const INDOOR_FAMILIES = {
  shelf(add, fit, looks) {
    const goods = faceLook(looks),
      wood = woodLook(looks);
    const side = 0.04,
      back = 0.02;
    for (const x of [fit.x0, fit.x1 - side])
      add.box(wood, [x, x + side], [fit.y0, fit.y1], [fit.z0, fit.z1], ['bottom', '-z']);
    add.box(wood, [fit.x0, fit.x1], [fit.y1 - side, fit.y1], [fit.z0, fit.z1], ['-z']);
    add.box(
      wood,
      [fit.x0 + side, fit.x1 - side],
      [fit.y0, fit.y0 + 0.08],
      [fit.z0 + back, fit.z1 - 0.01],
      ['bottom', '-z'],
    );
    add.box(
      goods,
      [fit.x0 + side, fit.x1 - side],
      [fit.y0 + 0.08, fit.y1 - side],
      [fit.z0, fit.z0 + back],
      ['bottom', '-z'],
    );
    const boards = clampTo(Math.round(fit.height / 0.45), 2, 5);
    for (let k = 1; k < boards; k++) {
      const y = fit.y0 + 0.08 + ((fit.y1 - side - fit.y0 - 0.08) * k) / boards;
      add.box(wood, [fit.x0 + side, fit.x1 - side], [y - 0.025, y], [fit.z0 + back, fit.z1 - 0.01], ['-z']);
    }
  },
  stepShelf(add, fit, looks) {
    const split = fit.z0 + fit.depth * 0.45;
    INDOOR_FAMILIES.shelf(add, { ...fit, z1: split, depth: split - fit.z0 }, looks);
    const wood = woodLook(looks),
      top = fit.y0 + fit.height * 0.42;
    add.box(faceLook(looks), [fit.x0 + 0.02, fit.x1 - 0.02], [fit.y0, top - 0.04], [split, fit.z1 - 0.02], ['-z']);
    add.box(wood, [fit.x0, fit.x1], [top - 0.04, top], [split, fit.z1], ['-z']);
  },
  lectern(add, fit, looks) {
    const wood = woodLook(looks),
      base = 0.06,
      desk = fit.y0 + fit.height * 0.78;
    add.box(
      wood,
      [fit.x0 + fit.length * 0.15, fit.x1 - fit.length * 0.15],
      [fit.y0, fit.y0 + base],
      [fit.z0 + fit.depth * 0.15, fit.z1 - fit.depth * 0.15],
    );
    add.box(
      wood,
      [fit.middleX - fit.length * 0.12, fit.middleX + fit.length * 0.12],
      [fit.y0 + base, desk],
      [fit.middleZ - fit.depth * 0.12, fit.middleZ + fit.depth * 0.12],
    );
    add.wedge(looks[0], [fit.x0, fit.x1], [desk, fit.y1], [fit.z0, fit.z1]);
    add.box(wood, [fit.x0, fit.x1], [desk, desk + 0.03], [fit.z1 - 0.03, fit.z1]);
  },
  armchair(add, fit, looks) {
    const wood = woodLook(looks),
      cloth = faceLook(looks);
    const seat = fit.y0 + clampTo(CHAIR_SEAT_M, fit.height * 0.25, fit.height * 0.6),
      arm = Math.min(0.1, fit.length * 0.12),
      back = Math.min(0.12, fit.depth * 0.15);
    add.box(wood, [fit.x0 + arm, fit.x1 - arm], [fit.y0, seat - 0.08], [fit.z0 + back, fit.z1 - 0.02]);
    add.box(cloth, [fit.x0 + arm, fit.x1 - arm], [seat - 0.08, seat], [fit.z0 + back, fit.z1 - 0.02]);
    for (const x of [fit.x0, fit.x1 - arm]) add.box(wood, [x, x + arm], [fit.y0, seat + 0.22], [fit.z0 + back, fit.z1]);
    add.box(wood, [fit.x0, fit.x1], [fit.y0, fit.y1], [fit.z0, fit.z0 + back]);
    add.box(
      cloth,
      [fit.x0 + arm, fit.x1 - arm],
      [seat, fit.y1 - 0.08],
      [fit.z0 + back, fit.z0 + back + 0.04],
      ['bottom', '-z'],
    );
  },
  throne(add, fit, looks) {
    INDOOR_FAMILIES.armchair(add, { ...fit, y1: fit.y1 - 0.12, height: fit.height - 0.12 }, looks);
    const wood = woodLook(looks),
      back = Math.min(0.12, fit.depth * 0.15);
    for (const x of [fit.x0, fit.x1 - 0.1])
      add.pyramid(wood, [x, x + 0.1], [fit.y1 - 0.12, fit.y1], [fit.z0, fit.z0 + back]);
  },
  rack(add, fit, looks) {
    const { add: along, fit: long } = lengthwise(add, fit);
    const wood = woodLook(looks),
      leg = clampTo(long.depth * 0.08, 0.04, 0.08);
    for (const x of [long.x0, long.x1 - leg]) {
      along.box(wood, [x, x + leg], [long.y0, long.y1], [long.middleZ - leg / 2, long.middleZ + leg / 2]);
      along.box(wood, [x, x + leg], [long.y0, long.y0 + leg], [long.z0, long.z1]);
      along.box(
        wood,
        [x, x + leg],
        [long.y0 + long.height * 0.55, long.y0 + long.height * 0.55 + leg],
        [long.z0 + long.depth * 0.15, long.z1 - long.depth * 0.15],
      );
    }
    for (const y of [long.y0 + long.height * 0.35, long.y0 + long.height * 0.7, long.y1 - leg])
      along.box(
        wood,
        [long.x0 + leg, long.x1 - leg],
        [y, y + leg * 0.8],
        [long.middleZ - leg * 0.4, long.middleZ + leg * 0.4],
      );
    // A rack that wore its goods shows them on a board between its rails.
    const goods = faceLook(looks);
    if (goods !== wood)
      along.box(
        goods,
        [long.x0 + leg, long.x1 - leg],
        [long.y0 + long.height * 0.35, long.y1 - leg],
        [long.middleZ - 0.01, long.middleZ + 0.01],
        [],
      );
  },
  board(add, fit, looks, measure) {
    const look = looks[0];
    if (fit.height <= Math.min(fit.length, fit.depth)) {
      const cover = measure.cover ?? 15;
      const halves = [
        [fit.x0, fit.middleX],
        [fit.middleX, fit.x1],
      ];
      const depths = [
        [fit.z0, fit.middleZ],
        [fit.middleZ, fit.z1],
      ];
      for (let i = 0; i < 2; i++)
        for (let k = 0; k < 2; k++)
          if (cover & (1 << (i * 2 + k))) add.box(look, halves[i], [fit.y0, fit.y1], depths[k]);
      return;
    }
    const { add: along, fit: long } = lengthwise(add, fit);
    const rim = clampTo(Math.min(long.length, long.height) * 0.04, 0.02, 0.06);
    along.box(
      look,
      [long.x0 + rim, long.x1 - rim],
      [long.y0 + rim, long.y1 - rim],
      [long.z0 + long.depth * 0.2, long.z1 - long.depth * 0.2],
    );
    const edge = woodLook(looks);
    for (const [fromX, toX] of [
      [long.x0, long.x0 + rim],
      [long.x1 - rim, long.x1],
    ])
      along.box(edge, [fromX, toX], [long.y0, long.y1], [long.z0, long.z1]);
    for (const [fromY, toY] of [
      [long.y0, long.y0 + rim],
      [long.y1 - rim, long.y1],
    ])
      along.box(edge, [long.x0 + rim, long.x1 - rim], [fromY, toY], [long.z0, long.z1]);
  },
  panel(add, fit, looks) {
    const { add: along, fit: long } = lengthwise(add, fit);
    along.box(
      looks[0],
      [long.x0, long.x1],
      [long.y0, long.y1 - 0.04],
      [long.z0 + long.depth * 0.1, long.z1 - long.depth * 0.1],
    );
    along.box(woodLook(looks), [long.x0, long.x1], [long.y1 - 0.04, long.y1], [long.z0, long.z1]);
  },
  beam(add, fit, looks) {
    add.box(looks[0], [fit.x0, fit.x1], [fit.y0, fit.y1], [fit.z0, fit.z1], []);
  },
  hanging(add, fit, looks) {
    const { add: along, fit: long } = lengthwise(add, fit);
    const z = long.middleZ,
      rod = Math.min(0.04, long.height * 0.03);
    along.quad(
      looks[0],
      [
        [long.x0, long.y0, z],
        [long.x1, long.y0, z],
        [long.x1, long.y1 - rod, z],
        [long.x0, long.y1 - rod, z],
      ],
      [0, 0, 1],
    );
    along.quad(
      looks[0],
      [
        [long.x1, long.y0, z],
        [long.x0, long.y0, z],
        [long.x0, long.y1 - rod, z],
        [long.x1, long.y1 - rod, z],
      ],
      [0, 0, -1],
    );
    along.box(
      woodLook(looks),
      [long.x0, long.x1],
      [long.y1 - rod, long.y1],
      [z - 0.0005, z + 0.0005 + Math.min(0.01, long.depth)],
    );
  },
  ladder(add, fit, looks) {
    const { add: along, fit: long } = lengthwise(add, fit);
    const wood = woodLook(looks),
      rail = clampTo(long.length * 0.1, 0.04, 0.07);
    for (const x of [long.x0, long.x1 - rail])
      along.box(looks[0], [x, x + rail], [long.y0, long.y1], [long.z0, long.z1]);
    for (let y = long.y0 + 0.3; y < long.y1 - 0.1; y += 0.3)
      along.box(
        wood,
        [long.x0 + rail, long.x1 - rail],
        [y - 0.02, y + 0.02],
        [long.middleZ - (long.z1 - long.z0) * 0.3, long.middleZ + (long.z1 - long.z0) * 0.3],
      );
  },
  trough(add, fit, looks) {
    const { add: along, fit: long } = lengthwise(add, fit);
    const wall = clampTo(long.depth * 0.08, 0.03, 0.08),
      look = looks[0];
    for (const [fromZ, toZ] of [
      [long.z0, long.z0 + wall],
      [long.z1 - wall, long.z1],
    ])
      along.box(look, [long.x0, long.x1], [long.y0, long.y1], [fromZ, toZ]);
    for (const [fromX, toX] of [
      [long.x0, long.x0 + wall],
      [long.x1 - wall, long.x1],
    ])
      along.box(look, [fromX, toX], [long.y0, long.y1], [long.z0 + wall, long.z1 - wall]);
    along.box(
      looks[1] ?? look,
      [long.x0 + wall, long.x1 - wall],
      [long.y0, long.y0 + long.height * 0.3],
      [long.z0 + wall, long.z1 - wall],
    );
  },
  cart(add, fit, looks) {
    const { add: along, fit: long } = lengthwise(add, fit);
    const wood = woodLook(looks),
      wheel = Math.min(long.height * 0.45, long.depth * 0.45),
      bed = long.y0 + wheel;
    const bedEnd = long.x0 + long.length * 0.68;
    along.box(looks[0], [long.x0, bedEnd], [bed, bed + 0.06], [long.z0 + 0.12, long.z1 - 0.12]);
    for (const [fromZ, toZ] of [
      [long.z0 + 0.12, long.z0 + 0.17],
      [long.z1 - 0.17, long.z1 - 0.12],
    ])
      along.box(wood, [long.x0, bedEnd], [bed + 0.06, long.y1], [fromZ, toZ]);
    for (const [fromX, toX] of [
      [long.x0, long.x0 + 0.05],
      [bedEnd - 0.05, bedEnd],
    ])
      along.box(wood, [fromX, toX], [bed + 0.06, long.y1], [long.z0 + 0.17, long.z1 - 0.17]);
    for (const z of [long.z0 + 0.05, long.z1 - 0.05]) {
      const hub = long.x0 + long.length * 0.34;
      along.wheel(wood, hub, long.y0 + wheel, z, wheel, 0.08);
    }
    for (const z of [long.z0 + 0.2, long.z1 - 0.26])
      along.box(wood, [bedEnd, long.x1], [bed - 0.04, bed + 0.02], [z, z + 0.06]);
  },
  siege(add, fit, looks) {
    const { add: along, fit: long } = lengthwise(add, fit);
    const wood = woodLook(looks),
      wheel = Math.min(0.35, long.height * 0.18),
      deck = long.y0 + wheel * 1.4;
    along.box(wood, [long.x0, long.x1], [deck, deck + 0.12], [long.z0 + 0.08, long.z1 - 0.08]);
    for (const x of [long.x0 + wheel, long.x1 - wheel])
      for (const z of [long.z0 + 0.04, long.z1 - 0.04]) along.wheel(wood, x, long.y0 + wheel, z, wheel, 0.08);
    const mid = long.x0 + long.length * 0.4;
    for (const z of [long.z0 + 0.15, long.z1 - 0.25])
      along.box(wood, [mid - 0.06, mid + 0.06], [deck + 0.12, long.y0 + long.height * 0.75], [z, z + 0.1]);
    along.box(
      wood,
      [long.x0 + 0.1, long.x1 - 0.1],
      [long.y0 + long.height * 0.75, long.y0 + long.height * 0.75 + 0.1],
      [long.middleZ - 0.06, long.middleZ + 0.06],
    );
    along.box(
      looks[0],
      [long.x1 - long.length * 0.25, long.x1 - 0.05],
      [long.y0 + long.height * 0.75, long.y1],
      [long.middleZ - 0.12, long.middleZ + 0.12],
    );
  },
  boat(add, fit, looks, measure) {
    const { add: along, fit: long, doors } = lengthwise(add, fit, measure.doors);
    const hull = looks[0],
      wood = woodLook(looks),
      door = doors.length ? doors[0] : undefined;
    const deck = door ? Math.min(door.a[1], door.b[1], door.c[1]) : long.y0 + long.height * 0.42,
      bow = long.x1 - long.length * 0.18,
      inset = long.depth * 0.18,
      inside = [long.middleX, (long.y0 + deck) / 2, long.middleZ];
    const keel = [
      [long.x0, long.y0, long.z0 + inset],
      [bow, long.y0, long.z0 + inset],
      [bow, long.y0, long.z1 - inset],
      [long.x0, long.y0, long.z1 - inset],
    ];
    const rail = [
      [long.x0, deck, long.z0],
      [bow, deck, long.z0],
      [bow, deck, long.z1],
      [long.x0, deck, long.z1],
    ];
    const prow = [long.x1, deck, long.middleZ];
    along.facing(hull, [keel[0], keel[1], rail[1], rail[0]], inside);
    along.facing(hull, [keel[2], keel[3], rail[3], rail[2]], inside);
    along.facing(hull, [keel[3], keel[0], rail[0], rail[3]], inside);
    along.facing(hull, [keel[1], rail[1], prow], inside);
    along.facing(hull, [keel[2], prow, rail[2]], inside);
    along.facing(hull, [keel[1], prow, keel[2]], [long.middleX, deck, long.middleZ]);
    along.facing(wood, rail, [long.middleX, long.y0, long.middleZ]);
    along.facing(wood, [rail[1], prow, rail[2]], [long.middleX, long.y0, long.middleZ]);
    let mast = long.x0 + long.length * 0.55;
    if (door) {
      // A boat with a door: a deckhouse behind it, its face the door's plane, the mast clear behind the house.
      const face = door.a[0],
        away = -Math.sign(door.n[0]) || -1,
        run = Math.min(6, long.length * 0.2);
      const across = [door.a[2], door.b[2], door.c[2]],
        head = Math.max(door.a[1], door.b[1], door.c[1]);
      along.box(
        wood,
        [Math.min(face, face + away * run), Math.max(face, face + away * run)],
        [deck, Math.min(long.y1, head + 0.4)],
        [Math.max(long.z0 + inset, Math.min(...across) - 1), Math.min(long.z1 - inset, Math.max(...across) + 1)],
      );
      mast = clampTo(face + away * (run + 2), long.x0 + 1, bow - 1);
    } else {
      const cabin = long.x0 + long.length * 0.22;
      along.box(
        wood,
        [long.x0, cabin],
        [deck, deck + (long.y1 - deck) * 0.32],
        [long.z0 + long.depth * 0.15, long.z1 - long.depth * 0.15],
      );
    }
    const girth = Math.max(0.12, long.depth * 0.03);
    along.box(wood, [mast - girth, mast + girth], [deck, long.y1], [long.middleZ - girth, long.middleZ + girth]);
    along.box(
      wood,
      [mast - girth, mast + girth],
      [long.y1 - (long.y1 - deck) * 0.3, long.y1 - (long.y1 - deck) * 0.28],
      [long.z0 + long.depth * 0.1, long.z1 - long.depth * 0.1],
    );
  },
  hut(add, fit, looks, measure) {
    const door = measure.doors.length ? measure.doors[0] : undefined;
    const { add: along, fit: long } = door ? { add, fit } : lengthwise(add, fit);
    const wall = looks[0],
      roof = looks[1] ?? looks[0];
    // A hut with a door: its front wall is the door's plane, its eaves over the door's head.
    const head = door ? Math.max(door.a[1], door.b[1], door.c[1]) : long.y0;
    const eaves = clampTo(Math.max(long.y0 + long.height * 0.62, head + 0.1), long.y0, long.y1 - 0.15),
      over = Math.min(0.25, long.depth * 0.06);
    along.box(
      wall,
      [long.x0 + over, long.x1 - over],
      [long.y0, eaves],
      [long.z0 + over, door ? door.a[2] : long.z1 - over],
    );
    along.gable(roof, [long.x0, long.x1], [eaves, long.y1], [long.z0, long.z1], 'x', wall);
    along.quad(
      roof,
      [
        [long.x0, eaves, long.z0],
        [long.x1, eaves, long.z0],
        [long.x1, eaves, long.z1],
        [long.x0, eaves, long.z1],
      ],
      [0, -1, 0],
    );
  },
  tent(add, fit, looks, measure) {
    const cloth = looks[0],
      door = measure.doors.length ? measure.doors[0] : undefined;
    if (!door) {
      add.pyramid(cloth, [fit.x0, fit.x1], [fit.y0, fit.y1], [fit.z0, fit.z1]);
      const pole = woodLook(looks);
      add.box(
        pole,
        [fit.middleX - 0.04, fit.middleX + 0.04],
        [fit.y0, fit.y1],
        [fit.middleZ - 0.04, fit.middleZ + 0.04],
      );
      return;
    }
    // A tent with a door: a lean-to set square to it, its front the door's own plane up to a ridge over the door's
    // head, flat over the door's frame, then sloping to the ground, as wide and deep as its box allows, so nothing
    // stands before the door.
    const { corners, centre, n, across, up, width } = doorAxes(door);
    const head = Math.max(...corners.map((corner) => corner[1])),
      ground = fit.y0;
    const ridge = Math.min(fit.y1, head + 0.25);
    const level = [n[0], 0, n[2]].map((value) => value / (Math.hypot(n[0], n[2]) || 1));
    // The front runs down the door's own plane past its sill to the ground.
    const rise = (y: number): number[] => [
      centre[0] + (up[0] / up[1]) * (y - centre[1]),
      y,
      centre[2] + (up[2] / up[1]) * (y - centre[1]),
    ];
    const foot = rise(ground);
    const offset = (corner: readonly number[], side: number, back: number): number[] => [
      corner[0] + across[0] * side - level[0] * back,
      corner[1],
      corner[2] + across[2] * side - level[2] * back,
    ];
    const inside = (corner: readonly number[]): boolean =>
      corner[0] >= fit.x0 - 0.011 &&
      corner[0] <= fit.x1 + 0.011 &&
      corner[2] >= fit.z0 - 0.011 &&
      corner[2] <= fit.z1 + 0.011;
    const top = rise(ridge),
      flat = DOOR_FRAME_M * 5;
    for (const [half, deep] of [
      [width / 2 + 1.2, 3],
      [width / 2 + 0.6, 2],
      [width / 2 + 0.2, 1.2],
    ]) {
      const [frontLeft, frontRight, topLeft, topRight, ridgeLeft, ridgeRight, backLeft, backRight] = [
        offset(foot, -half, 0),
        offset(foot, half, 0),
        offset(top, -half, 0),
        offset(top, half, 0),
        offset(top, -half, flat),
        offset(top, half, flat),
        offset(foot, -half, deep),
        offset(foot, half, deep),
      ];
      if (![frontLeft, frontRight, topLeft, topRight, ridgeLeft, ridgeRight, backLeft, backRight].every(inside))
        continue;
      const mid = [(frontLeft[0] + backRight[0]) / 2, (ground * 2 + ridge) / 3, (frontLeft[2] + backRight[2]) / 2];
      add.facing(cloth, [frontLeft, frontRight, topRight, topLeft], mid);
      add.facing(cloth, [topLeft, topRight, ridgeRight, ridgeLeft], mid);
      add.facing(cloth, [ridgeLeft, ridgeRight, backRight, backLeft], mid);
      add.facing(cloth, [frontLeft, topLeft, ridgeLeft, backLeft], mid);
      add.facing(cloth, [frontRight, backRight, ridgeRight, topRight], mid);
      return;
    }
  },
} satisfies Record<string, Family>;
