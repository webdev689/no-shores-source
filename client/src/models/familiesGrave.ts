// The burial pieces: headstones, ledgers, box tombs, obelisks, sarcophagi, mausoleums, ankhs, shrine fronts, the
// little temples and the graves, each built in its piece's box from the solids. A headstone's crown comes of its
// id's own seed, so a yard's stones differ and every client stands the same yard.
import { randomFromSeed } from './random.ts';
import { clampTo, lengthwise, type Frame } from './frame.ts';
import type { PartBuilder } from './parts.ts';
import type { Family } from './propRoles.ts';

/** Steps under a piece: `count` slabs, each `rise` high, each stepping in `inset`. Answers the top of the last. */
function steps(
  add: PartBuilder,
  look: readonly number[],
  fit: Frame,
  count: number,
  rise: number,
  inset: number,
): number {
  for (let k = 0; k < count; k++)
    add.box(
      look,
      [fit.x0 + inset * k, fit.x1 - inset * k],
      [fit.y0 + rise * k, fit.y0 + rise * (k + 1)],
      [fit.z0 + inset * k, fit.z1 - inset * k],
    );
  return fit.y0 + rise * count;
}

export const GRAVE_FAMILIES = {
  headstone(add, fit, looks, _measure, id) {
    const { add: along, fit: long } = lengthwise(add, fit);
    const stone = looks[0],
      random = randomFromSeed((id * 7919) >>> 0);
    const thick = Math.min(long.depth, Math.max(0.12, long.length * 0.18));
    const base = Math.min(0.15, long.height * 0.1);
    along.box(looks[1] ?? stone, [long.x0, long.x1], [long.y0, long.y0 + base], [long.z0, long.z1]);
    const face = [long.middleZ - thick / 2, long.middleZ + thick / 2],
      crown = Math.min(long.length * 0.4, long.height * 0.2),
      shoulder = long.y1 - crown;
    along.box(stone, [long.x0 + long.length * 0.05, long.x1 - long.length * 0.05], [long.y0 + base, shoulder], face);
    const kind = Math.floor(random.next() * 3);
    if (kind === 0)
      along.gable(stone, [long.x0 + long.length * 0.05, long.x1 - long.length * 0.05], [shoulder, long.y1], face, 'z');
    else if (kind === 1) {
      along.box(
        stone,
        [long.x0 + long.length * 0.15, long.x1 - long.length * 0.15],
        [shoulder, long.y1 - crown * 0.4],
        face,
      );
      along.box(
        stone,
        [long.x0 + long.length * 0.3, long.x1 - long.length * 0.3],
        [long.y1 - crown * 0.4, long.y1],
        face,
      );
    } else {
      along.box(stone, [long.x0, long.x1], [shoulder, shoulder + crown * 0.3], [face[0] - 0.01, face[1] + 0.01]);
      along.box(
        stone,
        [long.middleX - long.length * 0.08, long.middleX + long.length * 0.08],
        [shoulder + crown * 0.3, long.y1],
        face,
      );
    }
  },
  graveSlab(add, fit, looks) {
    const { add: along, fit: long } = lengthwise(add, fit);
    const stone = looks[0],
      foot = Math.min(0.12, long.height * 0.4);
    for (const x of [long.x0 + long.length * 0.08, long.x1 - long.length * 0.2])
      along.box(
        looks[1] ?? stone,
        [x, x + long.length * 0.12],
        [long.y0, long.y0 + foot],
        [long.z0 + 0.05, long.z1 - 0.05],
      );
    if (long.height > 0.35) along.wedge(stone, [long.x0, long.x1], [long.y0 + foot, long.y1], [long.z0, long.z1]);
    else along.box(stone, [long.x0, long.x1], [long.y0 + foot, long.y1], [long.z0, long.z1]);
  },
  tomb(add, fit, looks) {
    const stone = looks[0],
      trim = looks[1] ?? stone;
    const top = steps(add, trim, fit, 2, Math.min(0.15, fit.height * 0.1), Math.min(fit.length, fit.depth) * 0.06);
    const inset = Math.min(fit.length, fit.depth) * 0.16,
      cap = Math.min(0.15, fit.height * 0.1);
    add.box(stone, [fit.x0 + inset, fit.x1 - inset], [top, fit.y1 - cap * 2], [fit.z0 + inset, fit.z1 - inset]);
    add.box(
      trim,
      [fit.x0 + inset * 0.7, fit.x1 - inset * 0.7],
      [fit.y1 - cap * 2, fit.y1 - cap],
      [fit.z0 + inset * 0.7, fit.z1 - inset * 0.7],
    );
    add.pyramid(
      stone,
      [fit.x0 + inset * 0.7, fit.x1 - inset * 0.7],
      [fit.y1 - cap, fit.y1],
      [fit.z0 + inset * 0.7, fit.z1 - inset * 0.7],
    );
  },
  obelisk(add, fit, looks) {
    const stone = looks[0];
    const top = steps(
      add,
      looks[1] ?? stone,
      fit,
      3,
      Math.min(0.14, fit.height * 0.05),
      Math.min(fit.length, fit.depth) * 0.1,
    );
    const half = Math.min(fit.length, fit.depth) * 0.16,
      tip = fit.y1 - Math.min(0.5, fit.height * 0.1);
    add.prism(stone, fit.middleX, fit.middleZ, half * Math.SQRT2, half * Math.SQRT2, top, tip, 4, {
      taper: 0.6,
      turn: Math.PI / 4,
    });
    add.prism(stone, fit.middleX, fit.middleZ, half * 0.6 * Math.SQRT2, half * 0.6 * Math.SQRT2, tip, fit.y1, 4, {
      taper: 0,
      turn: Math.PI / 4,
    });
  },
  sarcophagus(add, fit, looks) {
    const { add: along, fit: long } = lengthwise(add, fit);
    const stone = looks[0],
      trim = looks[1] ?? stone;
    const top = steps(
      along,
      trim,
      long,
      2,
      Math.min(0.12, long.height * 0.12),
      Math.min(long.length, long.depth) * 0.06,
    );
    const inset = Math.min(long.length, long.depth) * 0.14,
      lid = Math.min(0.25, (long.y1 - top) * 0.3);
    along.box(stone, [long.x0 + inset, long.x1 - inset], [top, long.y1 - lid], [long.z0 + inset, long.z1 - inset]);
    along.gable(
      trim,
      [long.x0 + inset * 0.8, long.x1 - inset * 0.8],
      [long.y1 - lid, long.y1],
      [long.z0 + inset * 0.8, long.z1 - inset * 0.8],
    );
  },
  mausoleum(add, fit, looks) {
    const stone = looks[0],
      roof = looks[1] ?? stone;
    const top = steps(add, stone, fit, 1, Math.min(0.2, fit.height * 0.05), 0);
    const inset = Math.min(fit.length, fit.depth) * 0.08,
      eaves = fit.y0 + fit.height * 0.62;
    add.box(stone, [fit.x0 + inset, fit.x1 - inset], [top, eaves], [fit.z0 + inset, fit.z1 - inset]);
    const pilaster = Math.min(fit.length, fit.depth) * 0.1;
    for (const x of [fit.x0, fit.x1 - pilaster])
      for (const z of [fit.z0, fit.z1 - pilaster]) add.box(roof, [x, x + pilaster], [top, eaves], [z, z + pilaster]);
    add.prism(roof, fit.middleX, fit.middleZ, (fit.length / 2) * 1.08, (fit.depth / 2) * 1.08, eaves, fit.y1, 8, {
      taper: 0,
      turn: Math.PI / 8,
    });
    add.box(
      looks[2] ?? roof,
      [fit.middleX - fit.length * 0.12, fit.middleX + fit.length * 0.12],
      [top, top + (eaves - top) * 0.7],
      [fit.z1 - inset, fit.z1 - inset + 0.02],
      ['bottom', '-z'],
    );
  },
  ankh(add, fit, looks) {
    const stone = looks[0];
    const top = steps(
      add,
      looks[1] ?? stone,
      fit,
      2,
      Math.min(0.15, fit.height * 0.08),
      Math.min(fit.length, fit.depth) * 0.12,
    );
    const bar = Math.min(fit.length, fit.depth) * 0.07,
      cross = fit.y0 + fit.height * 0.66,
      loop = (fit.y1 - cross) * 0.85;
    add.box(stone, [fit.middleX - bar, fit.middleX + bar], [top, cross], [fit.middleZ - bar, fit.middleZ + bar]);
    add.box(
      stone,
      [fit.middleX - fit.length * 0.3, fit.middleX + fit.length * 0.3],
      [cross, cross + bar * 2],
      [fit.middleZ - bar, fit.middleZ + bar],
    );
    const ring = Math.min(fit.length * 0.16, loop / 2);
    for (const side of [-1, 1])
      add.box(
        stone,
        [fit.middleX + side * ring - bar, fit.middleX + side * ring + bar],
        [cross + bar * 2, fit.y1 - bar],
        [fit.middleZ - bar, fit.middleZ + bar],
      );
    add.box(
      stone,
      [fit.middleX - ring - bar, fit.middleX + ring + bar],
      [fit.y1 - bar * 2, fit.y1],
      [fit.middleZ - bar, fit.middleZ + bar],
    );
  },
  shrineFront(add, fit, looks) {
    const { add: along, fit: long } = lengthwise(add, fit);
    const stone = looks[0],
      trim = looks[1] ?? stone;
    const top = steps(
      along,
      trim,
      long,
      2,
      Math.min(0.15, long.height * 0.06),
      Math.min(long.length, long.depth) * 0.08,
    );
    const wall = long.z0 + long.depth * 0.35,
      beam = long.y1 - Math.min(0.35, long.height * 0.12);
    along.box(stone, [long.x0 + 0.2, long.x1 - 0.2], [top, long.y1], [long.z0 + 0.1, wall]);
    for (let k = 0; k < 4; k++) {
      const x = long.x0 + 0.25 + ((long.length - 0.8) * k) / 3;
      along.prism(trim, x + 0.15, (wall + long.z1 - 0.2) / 2, 0.15, 0.15, top, beam, 8);
    }
    along.box(stone, [long.x0 + 0.1, long.x1 - 0.1], [beam, long.y1], [wall, long.z1 - 0.1]);
    along.box(
      looks[2] ?? trim,
      [long.middleX - long.length * 0.12, long.middleX + long.length * 0.12],
      [top, top + (beam - top) * 0.6],
      [wall, wall + 0.02],
      ['bottom', '-z'],
    );
  },
  temple(add, fit, looks, measure) {
    const door = measure.doors.length ? measure.doors[0] : undefined;
    const { add: along, fit: long } = door ? { add, fit } : lengthwise(add, fit);
    const stone = looks[0],
      roof = looks[1] ?? stone,
      inset = Math.min(long.length, long.depth) * 0.03;
    let floor = steps(along, stone, long, 2, Math.min(0.2, long.height * 0.04), inset);
    // A temple with a door: its cella's front the door's plane, its eaves over the door's head, and where the door's
    // sill stands above the steps, a podium to it and a flight up before the door.
    const heights = door ? [door.a[1], door.b[1], door.c[1]] : [];
    const sill = door ? Math.min(...heights) : floor,
      head = door ? Math.max(...heights) : floor;
    const porch = door ? door.a[2] : long.z0 + long.depth * 0.72;
    let front = long.z1;
    if (sill > floor + 0.05) {
      const flights = Math.ceil((sill - floor) / 0.2),
        tread = Math.min(0.3, (long.z1 - porch) / (flights + 2));
      front = long.z1 - flights * tread;
      along.box(stone, [long.x0 + inset * 2, long.x1 - inset * 2], [floor, sill], [long.z0 + inset * 2, front]);
      const span = [
        Math.max(long.x0 + inset * 2, long.middleX - long.length * 0.25),
        Math.min(long.x1 - inset * 2, long.middleX + long.length * 0.25),
      ];
      for (let k = 0; k < flights; k++)
        along.box(
          stone,
          span,
          [floor, sill - ((sill - floor) * k) / flights],
          [front + tread * k, k === flights - 1 ? long.z1 : front + tread * (k + 1)],
        );
      floor = sill;
    }
    const eaves = clampTo(Math.max(long.y0 + long.height * 0.66, head + 0.2), floor + 0.5, long.y1 - 0.4);
    along.box(
      stone,
      [long.x0 + long.length * 0.1, long.x1 - long.length * 0.1],
      [floor, eaves],
      [long.z0 + long.depth * 0.08, porch],
    );
    for (let k = 0; k < 4; k++) {
      const x = long.x0 + long.length * 0.12 + (long.length * 0.76 * k) / 3;
      along.prism(roof, x, (porch + front) / 2, 0.22, 0.22, floor, eaves, 8);
    }
    along.box(
      stone,
      [long.x0 + long.length * 0.05, long.x1 - long.length * 0.05],
      [eaves, eaves + 0.25],
      [long.z0 + long.depth * 0.05, long.z1 - long.depth * 0.02],
    );
    along.gable(
      roof,
      [long.x0 + long.length * 0.03, long.x1 - long.length * 0.03],
      [eaves + 0.25, long.y1],
      [long.z0 + long.depth * 0.03, long.z1],
      'x',
      stone,
    );
  },
  grave(add, fit, looks, measure, id) {
    const { add: along, fit: long } = lengthwise(add, fit);
    const stone = looks[0],
      ledger = Math.min(0.25, long.height * 0.2);
    along.box(
      looks[1] ?? stone,
      [long.x0 + long.length * 0.15, long.x1],
      [long.y0, long.y0 + ledger],
      [long.z0, long.z1],
    );
    GRAVE_FAMILIES.headstone(
      along,
      {
        ...long,
        x1: long.x0 + long.length * 0.15,
        length: long.length * 0.15,
        depth: long.depth * 0.6,
        z0: long.middleZ - long.depth * 0.3,
        z1: long.middleZ + long.depth * 0.3,
      },
      looks,
      measure,
      id,
    );
  },
} satisfies Record<string, Family>;
