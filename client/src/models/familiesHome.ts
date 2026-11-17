// A room's furniture: beds, wardrobes, cupboards, dressers, cabinets, crates, tables, counters, chairs, benches,
// hearths and pedestals, each built in its piece's box (front +z) from the solids and dressed in its pictures.
import { PLAIN_WOOD } from './parts.ts';
import { clampTo, posts } from './frame.ts';
import type { Family } from './propRoles.ts';

/** A chair's seat over its floor (m): where sitting looks for it. */
export const CHAIR_SEAT_M = 0.45;

export const HOME_FAMILIES = {
  bed(add, fit, looks) {
    const cloth = looks[0],
      sheet = looks[1] ?? cloth;
    const post = clampTo(fit.depth * 0.06, 0.05, 0.09),
      rail = fit.y0 + fit.height * 0.42,
      top = fit.y0 + fit.height * 0.66;
    posts(add, PLAIN_WOOD, { ...fit, x1: fit.x0 + post }, 0, post, fit.y0, fit.height);
    posts(add, PLAIN_WOOD, { ...fit, x0: fit.x1 - post }, 0, post, fit.y0, fit.height * 0.8);
    add.box(
      PLAIN_WOOD,
      [fit.x0, fit.x0 + post * 0.6],
      [fit.y0 + fit.height * 0.3, fit.y1 - post * 0.3],
      [fit.z0 + post, fit.z1 - post],
    );
    add.box(
      PLAIN_WOOD,
      [fit.x1 - post * 0.6, fit.x1],
      [fit.y0 + fit.height * 0.3, fit.y0 + fit.height * 0.72],
      [fit.z0 + post, fit.z1 - post],
    );
    for (const z of [fit.z0, fit.z1 - post * 0.6])
      add.box(PLAIN_WOOD, [fit.x0 + post, fit.x1 - post], [fit.y0 + fit.height * 0.22, rail], [z, z + post * 0.6]);
    add.box(
      sheet,
      [fit.x0 + post, fit.x1 - post],
      [rail, top - 0.03],
      [fit.z0 + post * 0.6, fit.z1 - post * 0.6],
      ['bottom'],
    );
    const fold = fit.x0 + fit.length * 0.3;
    add.box(cloth, [fold, fit.x1 - post * 0.6], [top - 0.04, top], [fit.z0 + post * 0.3, fit.z1 - post * 0.3]);
    for (const [from, to] of [
      [fit.z0 + post * 0.3, fit.z0 + post * 0.32],
      [fit.z1 - post * 0.32, fit.z1 - post * 0.3],
    ])
      add.box(cloth, [fold, fit.x1 - post * 0.6], [rail - 0.06, top], [from, to], ['bottom', 'top']);
    add.box(
      sheet,
      [fit.x0 + post + 0.04, fold - 0.06],
      [top - 0.03, top + Math.min(0.1, fit.height * 0.2)],
      [fit.z0 + fit.depth * 0.18, fit.z1 - fit.depth * 0.18],
    );
  },
  canopy(add, fit, looks, measure) {
    const cloth = looks[0];
    const post = clampTo(fit.depth * 0.05, 0.06, 0.1),
      bedTop = fit.y0 + Math.min(0.62, fit.height * 0.3);
    // The bed under the canopy wears the bedding, so a town's coloured canopy bed recolours its sheets.
    HOME_FAMILIES.bed(add, { ...fit, y1: bedTop, height: bedTop - fit.y0 }, [measure.bedding ?? cloth, PLAIN_WOOD]);
    posts(add, PLAIN_WOOD, fit, 0, post, fit.y0, fit.height);
    for (const z of [fit.z0, fit.z1 - post])
      add.box(PLAIN_WOOD, [fit.x0, fit.x1], [fit.y1 - post, fit.y1], [z, z + post]);
    for (const x of [fit.x0, fit.x1 - post])
      add.box(PLAIN_WOOD, [x, x + post], [fit.y1 - post, fit.y1], [fit.z0, fit.z1]);
    add.box(
      cloth,
      [fit.x0 + post, fit.x1 - post],
      [fit.y1 - post * 1.4, fit.y1 - post],
      [fit.z0 + post, fit.z1 - post],
    );
    const valance = Math.min(0.28, fit.height * 0.12);
    for (const [from, to] of [
      [fit.z0 - 0.01, fit.z0],
      [fit.z1, fit.z1 + 0.01],
    ])
      add.box(cloth, [fit.x0, fit.x1], [fit.y1 - post - valance, fit.y1 - post], [from, to], ['bottom', 'top']);
    add.box(
      cloth,
      [fit.x0 - 0.01, fit.x0],
      [fit.y0 + fit.height * 0.25, fit.y1 - post],
      [fit.z0 + post, fit.z1 - post],
      ['bottom', 'top'],
    );
  },
  wardrobe(add, fit, looks) {
    const body = looks[0],
      door = looks[1] ?? body;
    const plinth = 0.08,
      cornice = 0.07,
      lip = 0.03;
    add.box(
      body,
      [fit.x0 + lip, fit.x1 - lip],
      [fit.y0, fit.y0 + plinth],
      [fit.z0, fit.z1 - lip * 2],
      ['bottom', '-z'],
    );
    add.box(
      body,
      [fit.x0 + lip, fit.x1 - lip],
      [fit.y0 + plinth, fit.y1 - cornice],
      [fit.z0, fit.z1 - lip],
      ['bottom', '-z'],
    );
    add.box(body, [fit.x0, fit.x1], [fit.y1 - cornice, fit.y1], [fit.z0, fit.z1], ['-z']);
    const doors = fit.length > 2.4 ? 4 : 2,
      gap = 0.012,
      span = (fit.length - lip * 2 - gap * (doors + 1)) / doors;
    for (let k = 0; k < doors; k++) {
      const x = fit.x0 + lip + gap + k * (span + gap);
      add.box(
        door,
        [x, x + span],
        [fit.y0 + plinth + gap, fit.y1 - cornice - gap],
        [fit.z1 - lip, fit.z1 - lip * 0.4],
        ['-z', 'bottom'],
      );
      const knob = k % 2 === 0 ? x + span - 0.06 : x + 0.03;
      add.box(
        PLAIN_WOOD,
        [knob, knob + 0.03],
        [fit.y0 + fit.height * 0.48, fit.y0 + fit.height * 0.48 + 0.05],
        [fit.z1 - lip * 0.4, fit.z1],
        ['-z'],
      );
    }
  },
  cupboard(add, fit, looks) {
    const body = looks[0],
      door = looks[1] ?? body;
    const side = 0.04,
      lower = fit.y0 + fit.height * 0.45;
    for (const x of [fit.x0, fit.x1 - side])
      add.box(body, [x, x + side], [fit.y0, fit.y1], [fit.z0, fit.z1], ['-z', 'bottom']);
    add.box(body, [fit.x0 + side, fit.x1 - side], [fit.y0, fit.y1], [fit.z0, fit.z0 + 0.02], ['-z']);
    add.box(body, [fit.x0, fit.x1], [fit.y1 - side, fit.y1], [fit.z0, fit.z1], ['-z']);
    add.box(body, [fit.x0 + side, fit.x1 - side], [lower - side, lower], [fit.z0, fit.z1 - 0.01], ['-z']);
    for (let k = 1; k <= 2; k++) {
      const y = lower + ((fit.y1 - lower) * k) / 3;
      add.box(body, [fit.x0 + side, fit.x1 - side], [y - 0.025, y], [fit.z0 + 0.02, fit.z1 - 0.03], ['-z']);
    }
    const half = (fit.length - side * 2) / 2;
    for (let k = 0; k < 2; k++) {
      const x = fit.x0 + side + k * half;
      add.box(
        door,
        [x + 0.006, x + half - 0.006],
        [fit.y0 + 0.02, lower - side - 0.01],
        [fit.z1 - 0.025, fit.z1],
        ['-z', 'bottom'],
      );
    }
  },
  dresser(add, fit, looks) {
    const front = looks[0],
      body = looks[1] ?? PLAIN_WOOD;
    const top = 0.04,
      lip = 0.015;
    add.box(body, [fit.x0 + lip, fit.x1 - lip], [fit.y0, fit.y1 - top], [fit.z0, fit.z1 - lip], ['-z', 'bottom']);
    add.box(body, [fit.x0, fit.x1], [fit.y1 - top, fit.y1], [fit.z0, fit.z1], ['-z']);
    const drawer = (fit.height - top - 0.06) / 3;
    for (let k = 0; k < 3; k++) {
      const y = fit.y0 + 0.04 + k * drawer;
      add.box(
        front,
        [fit.x0 + lip + 0.01, fit.x1 - lip - 0.01],
        [y + 0.008, y + drawer - 0.008],
        [fit.z1 - lip, fit.z1 - 0.004],
        ['-z', 'bottom'],
      );
      for (const x of [fit.x0 + fit.length * 0.28, fit.x1 - fit.length * 0.28 - 0.03])
        add.box(
          PLAIN_WOOD,
          [x, x + 0.03],
          [y + drawer / 2 - 0.012, y + drawer / 2 + 0.012],
          [fit.z1 - 0.004, fit.z1],
          ['-z'],
        );
    }
  },
  cabinet(add, fit, looks) {
    const body = looks[0],
      door = looks[1] ?? body;
    const top = 0.035,
      lip = 0.02;
    add.box(body, [fit.x0 + lip, fit.x1 - lip], [fit.y0, fit.y1 - top], [fit.z0 + lip, fit.z1 - lip]);
    add.box(body, [fit.x0, fit.x1], [fit.y1 - top, fit.y1], [fit.z0, fit.z1]);
    const half = (fit.length - lip * 2) / 2;
    for (let k = 0; k < 2; k++) {
      const x = fit.x0 + lip + k * half;
      add.box(
        door,
        [x + 0.008, x + half - 0.008],
        [fit.y0 + 0.04, fit.y1 - top - 0.03],
        [fit.z1 - lip, fit.z1 - lip + 0.012],
        ['-z', 'bottom'],
      );
    }
  },
  crate(add, fit, looks) {
    const board = looks[0],
      batten = looks[1] ?? board;
    const b = clampTo(Math.min(fit.length, fit.depth, fit.height) * 0.07, 0.025, 0.06);
    add.box(
      board,
      [fit.x0 + b * 0.4, fit.x1 - b * 0.4],
      [fit.y0, fit.y1 - b * 0.4],
      [fit.z0 + b * 0.4, fit.z1 - b * 0.4],
    );
    for (const [fromY, toY] of [
      [fit.y0, fit.y0 + b],
      [fit.y1 - b, fit.y1],
    ]) {
      for (const [fromZ, toZ] of [
        [fit.z0, fit.z0 + b],
        [fit.z1 - b, fit.z1],
      ])
        add.box(batten, [fit.x0, fit.x1], [fromY, toY], [fromZ, toZ]);
      for (const [fromX, toX] of [
        [fit.x0, fit.x0 + b],
        [fit.x1 - b, fit.x1],
      ])
        add.box(batten, [fromX, toX], [fromY, toY], [fit.z0 + b, fit.z1 - b]);
    }
    for (const x of [fit.x0, fit.x1 - b])
      for (const z of [fit.z0, fit.z1 - b]) add.box(batten, [x, x + b], [fit.y0 + b, fit.y1 - b], [z, z + b]);
  },
  table(add, fit, looks) {
    const top = looks[0];
    const slab = clampTo(fit.height * 0.08, 0.04, 0.07),
      leg = clampTo(Math.min(fit.length, fit.depth) * 0.06, 0.05, 0.09),
      inset = Math.min(0.1, fit.depth * 0.1),
      apron = 0.08;
    add.box(top, [fit.x0, fit.x1], [fit.y1 - slab, fit.y1], [fit.z0, fit.z1]);
    const lift = fit.y1 - slab;
    const along =
      fit.length > 2.6
        ? [fit.x0 + inset, (fit.x0 + fit.x1 - leg) / 2, fit.x1 - inset - leg]
        : [fit.x0 + inset, fit.x1 - inset - leg];
    for (const x of along)
      for (const z of [fit.z0 + inset, fit.z1 - inset - leg])
        add.box(PLAIN_WOOD, [x, x + leg], [fit.y0, lift], [z, z + leg]);
    for (const z of [fit.z0 + inset, fit.z1 - inset - leg * 0.5])
      add.box(PLAIN_WOOD, [fit.x0 + inset, fit.x1 - inset], [lift - apron, lift], [z, z + leg * 0.5]);
    for (const x of [fit.x0 + inset, fit.x1 - inset - leg * 0.5])
      add.box(PLAIN_WOOD, [x, x + leg * 0.5], [lift - apron, lift], [fit.z0 + inset + leg, fit.z1 - inset - leg]);
  },
  counter(add, fit, looks) {
    const body = looks[0],
      top = looks[1] ?? body;
    const slab = 0.05,
      lip = 0.04,
      kick = 0.08;
    add.box(body, [fit.x0 + lip, fit.x1 - lip], [fit.y0, fit.y0 + kick], [fit.z0 + lip * 2, fit.z1 - lip * 2]);
    add.box(body, [fit.x0 + lip, fit.x1 - lip], [fit.y0 + kick, fit.y1 - slab], [fit.z0 + lip, fit.z1 - lip]);
    add.box(top, [fit.x0, fit.x1], [fit.y1 - slab, fit.y1], [fit.z0, fit.z1]);
    for (let k = 1; k < 4; k++) {
      const x = fit.x0 + lip + ((fit.length - lip * 2) * k) / 4 - 0.02;
      add.box(
        body,
        [x, x + 0.04],
        [fit.y0 + kick, fit.y1 - slab],
        [fit.z1 - lip, fit.z1 - lip + 0.015],
        ['-z', 'bottom'],
      );
    }
  },
  chair(add, fit, looks) {
    const wood = looks[0],
      seat = looks[1] ?? wood;
    const leg = clampTo(fit.length * 0.08, 0.04, 0.06),
      seatTop = fit.y0 + clampTo(CHAIR_SEAT_M, fit.height * 0.3, fit.height * 0.6),
      pad = 0.05;
    for (const x of [fit.x0 + 0.03, fit.x1 - 0.03 - leg])
      for (const z of [fit.z0 + 0.03, fit.z1 - 0.03 - leg])
        add.box(wood, [x, x + leg], [fit.y0, seatTop - pad], [z, z + leg]);
    add.box(seat, [fit.x0, fit.x1], [seatTop - pad, seatTop], [fit.z0, fit.z1]);
    for (const x of [fit.x0 + 0.03, fit.x1 - 0.03 - leg])
      add.box(wood, [x, x + leg], [seatTop, fit.y1], [fit.z0 + 0.03, fit.z0 + 0.03 + leg]);
    for (let k = 0; k < 3; k++) {
      const y = seatTop + ((fit.y1 - seatTop) * (k + 1)) / 4;
      add.box(
        wood,
        [fit.x0 + 0.03 + leg, fit.x1 - 0.03 - leg],
        [y - 0.05, y + 0.02],
        [fit.z0 + 0.04, fit.z0 + 0.04 + leg * 0.6],
      );
    }
    add.box(wood, [fit.x0 + 0.01, fit.x1 - 0.01], [fit.y1 - 0.06, fit.y1], [fit.z0 + 0.02, fit.z0 + 0.05 + leg]);
  },
  bench(add, fit, looks) {
    const wood = looks[0];
    const plank = 0.05,
      leg = 0.05,
      inset = Math.min(0.18, fit.length * 0.12);
    add.box(wood, [fit.x0, fit.x1], [fit.y1 - plank, fit.y1], [fit.z0, fit.z1]);
    for (const x of [fit.x0 + inset, fit.x1 - inset - leg])
      add.box(wood, [x, x + leg], [fit.y0, fit.y1 - plank], [fit.z0 + 0.04, fit.z1 - 0.04]);
    add.box(
      wood,
      [fit.x0 + inset + leg, fit.x1 - inset - leg],
      [fit.y0 + fit.height * 0.25, fit.y0 + fit.height * 0.25 + 0.06],
      [(fit.z0 + fit.z1) / 2 - 0.025, (fit.z0 + fit.z1) / 2 + 0.025],
    );
  },
  hearth(add, fit, looks) {
    const stone = looks[0],
      hearthStone = looks[1] ?? stone;
    const jamb = clampTo(fit.length * 0.2, 0.22, 0.45),
      mantel = 0.1,
      opening = fit.y0 + fit.height * 0.62,
      back = fit.z0 + fit.depth * 0.3;
    for (const [fromX, toX] of [
      [fit.x0 + 0.04, fit.x0 + jamb],
      [fit.x1 - jamb, fit.x1 - 0.04],
    ])
      add.box(stone, [fromX, toX], [fit.y0, fit.y1 - mantel], [fit.z0, fit.z1 - 0.05], ['-z', 'bottom']);
    add.box(stone, [fit.x0 + jamb, fit.x1 - jamb], [fit.y0, fit.y1 - mantel], [fit.z0, back], ['-z', 'bottom']);
    add.box(stone, [fit.x0 + jamb, fit.x1 - jamb], [opening, fit.y1 - mantel], [back, fit.z1 - 0.05], ['-z', 'bottom']);
    add.box(stone, [fit.x0, fit.x1], [fit.y1 - mantel, fit.y1], [fit.z0, fit.z1], ['-z']);
    add.box(
      hearthStone,
      [fit.x0 + jamb * 0.6, fit.x1 - jamb * 0.6],
      [fit.y0, fit.y0 + 0.05],
      [back, fit.z1],
      ['-z', 'bottom'],
    );
  },
  pedestal(add, fit, looks) {
    const stone = looks[0];
    const base = fit.height * 0.14,
      cap = fit.height * 0.12,
      inset = fit.length * 0.2;
    add.box(stone, [fit.x0, fit.x1], [fit.y0, fit.y0 + base], [fit.z0, fit.z1]);
    add.box(
      stone,
      [fit.x0 + inset, fit.x1 - inset],
      [fit.y0 + base, fit.y1 - cap],
      [fit.z0 + inset, fit.z1 - inset],
      ['bottom'],
    );
    add.box(
      stone,
      [fit.x0 + inset * 0.4, fit.x1 - inset * 0.4],
      [fit.y1 - cap, fit.y1],
      [fit.z0 + inset * 0.4, fit.z1 - inset * 0.4],
    );
  },
} satisfies Record<string, Family>;
