// The yard's and the road's pieces: walls and fences, fountains, signs, gates, arches and arcades, rocks and caves,
// ruins and fallen columns, posts, the great tree, gazebos, well houses, park benches, ramps and statues, each built
// in its piece's box from the solids. A rock's, a ruin's and a column's break come of its id's own seed, so every
// client stands the same stone.
import { randomFromSeed } from './random.ts';
import { behindDoor, clampTo, doorAxes, lengthwise, room } from './frame.ts';
import { faceLook, woodLook } from './familiesIndoor.ts';
import type { Family } from './propRoles.ts';

export const OUTDOOR_FAMILIES = {
  wallPanel(add, fit, looks) {
    const { add: along, fit: long } = lengthwise(add, fit);
    const cap = Math.min(0.1, long.height * 0.08),
      post = Math.min(0.35, long.length * 0.12);
    along.box(
      looks[0],
      [long.x0, long.x1],
      [long.y0, long.y1 - cap],
      [long.z0 + long.depth * 0.15, long.z1 - long.depth * 0.15],
    );
    along.box(looks[1] ?? looks[0], [long.x0, long.x1], [long.y1 - cap, long.y1], [long.z0, long.z1]);
    if (long.length > 2) along.box(looks[0], [long.x1 - post, long.x1], [long.y0, long.y1], [long.z0, long.z1]);
  },
  railFence(add, fit, looks) {
    const { add: along, fit: long } = lengthwise(add, fit);
    const wood = woodLook(looks),
      post = clampTo(long.depth * 0.8, 0.08, 0.16);
    const spans = Math.max(1, Math.round(long.length / 2.4));
    for (let k = 0; k <= spans; k++) {
      const x = clampTo(long.x0 + (long.length * k) / spans - post / 2, long.x0, long.x1 - post);
      along.box(wood, [x, x + post], [long.y0, long.y1], [long.z0, long.z1]);
    }
    for (const y of [long.y0 + long.height * 0.4, long.y0 + long.height * 0.78])
      along.box(wood, [long.x0, long.x1], [y - 0.05, y + 0.05], [long.z0, long.z0 + Math.min(0.06, long.depth)]);
  },
  fountain(add, fit, looks) {
    const radiusX = fit.length / 2,
      radiusZ = fit.depth / 2,
      stone = looks[0],
      water = looks[1] ?? looks[0];
    const rim = fit.y0 + Math.min(0.6, fit.height * 0.3);
    add.prism(stone, fit.middleX, fit.middleZ, radiusX, radiusZ, fit.y0, rim, 8, { turn: Math.PI / 8, fill: true });
    add.prism(water, fit.middleX, fit.middleZ, radiusX * 0.86, radiusZ * 0.86, rim, rim + 0.01, 8, {
      turn: Math.PI / 8,
      fill: true,
    });
    add.prism(stone, fit.middleX, fit.middleZ, radiusX * 0.12, radiusZ * 0.12, rim, fit.y0 + fit.height * 0.7, 8);
    add.prism(
      stone,
      fit.middleX,
      fit.middleZ,
      radiusX * 0.35,
      radiusZ * 0.35,
      fit.y0 + fit.height * 0.7,
      fit.y0 + fit.height * 0.8,
      8,
      {
        taper: 1.2,
      },
    );
    add.prism(stone, fit.middleX, fit.middleZ, radiusX * 0.06, radiusZ * 0.06, fit.y0 + fit.height * 0.8, fit.y1, 6, {
      taper: 0.3,
    });
  },
  signboard(add, fit, looks) {
    const { add: along, fit: long } = lengthwise(add, fit);
    const wood = woodLook(looks),
      post = clampTo(long.length * 0.06, 0.06, 0.12);
    for (const x of [long.x0, long.x1 - post]) along.box(wood, [x, x + post], [long.y0, long.y1], [long.z0, long.z1]);
    along.box(
      faceLook(looks),
      [long.x0 + post, long.x1 - post],
      [long.y0 + long.height * 0.5, long.y1 - 0.05],
      [long.middleZ - 0.03, long.middleZ + 0.03],
      [],
    );
  },
  gateFrame(add, fit, looks) {
    const { add: along, fit: long } = lengthwise(add, fit);
    const look = looks[0],
      post = clampTo(Math.min(long.length * 0.1, long.depth), 0.12, 0.6),
      lintel = Math.min(0.4, long.height * 0.1);
    for (const x of [long.x0, long.x1 - post])
      along.box(look, [x, x + post], [long.y0, long.y1 - lintel], [long.middleZ - post / 2, long.middleZ + post / 2]);
    if (long.depth > post * 1.6)
      along.gable(looks[1] ?? look, [long.x0, long.x1], [long.y1 - lintel, long.y1], [long.z0, long.z1]);
    else along.box(look, [long.x0, long.x1], [long.y1 - lintel, long.y1], [long.z0, long.z1]);
  },
  gateArch(add, fit, looks) {
    const { add: along, fit: long } = lengthwise(add, fit);
    const stone = looks[0],
      pier = Math.min(long.length * 0.2, long.depth),
      cap = Math.min(0.3, long.height * 0.08);
    for (const x of [long.x0, long.x1 - pier]) {
      along.box(stone, [x, x + pier], [long.y0, long.y1 - cap], [long.z0, long.z1]);
      along.pyramid(looks[1] ?? stone, [x, x + pier], [long.y1 - cap, long.y1], [long.z0, long.z1]);
    }
    along.box(
      stone,
      [long.x0 + pier, long.x1 - pier],
      [long.y0 + long.height * 0.68, long.y0 + long.height * 0.82],
      [long.z0 + long.depth * 0.15, long.z1 - long.depth * 0.15],
    );
  },
  arcade(add, fit, looks) {
    const { add: along, fit: long } = lengthwise(add, fit);
    const stone = looks[0],
      piers = 3,
      pier = Math.min(long.length * 0.12, long.depth);
    for (let k = 0; k < piers; k++) {
      const x = long.x0 + ((long.length - pier) * k) / (piers - 1);
      along.box(stone, [x, x + pier], [long.y0, long.y1], [long.z0, long.z1]);
    }
    along.box(
      stone,
      [long.x0, long.x1],
      [long.y0 + long.height * 0.72, long.y1],
      [long.z0 + long.depth * 0.1, long.z1 - long.depth * 0.1],
    );
  },
  archway(add, fit, looks) {
    const { add: along, fit: long } = lengthwise(add, fit);
    const stone = looks[0],
      leg = Math.min(long.length * 0.16, 1),
      spring = long.y0 + long.height * 0.6;
    for (const x of [long.x0, long.x1 - leg]) along.box(stone, [x, x + leg], [long.y0, spring], [long.z0, long.z1]);
    const steps = 4,
      span = long.x1 - long.x0;
    for (let k = 0; k < steps; k++) {
      const y = spring + ((long.y1 - spring) * k) / steps,
        inset = (span / 2 - leg) * (1 - Math.cos(((k + 1) / steps) * (Math.PI / 2)));
      along.box(
        stone,
        [long.x0 + inset, long.x0 + inset + leg],
        [y, y + (long.y1 - spring) / steps],
        [long.z0, long.z1],
      );
      along.box(
        stone,
        [long.x1 - inset - leg, long.x1 - inset],
        [y, y + (long.y1 - spring) / steps],
        [long.z0, long.z1],
      );
    }
    along.box(
      stone,
      [long.middleX - leg, long.middleX + leg],
      [long.y1 - (long.y1 - spring) / steps, long.y1],
      [long.z0, long.z1],
    );
  },
  rock(add, fit, looks, measure, id) {
    add.rock(looks[0], [fit.x0, fit.x1], [fit.y0, fit.y1], [fit.z0, fit.z1], id * 2654435761, measure.relief);
  },
  caveMouth(add, fit, looks, measure, id) {
    const seed = id * 2654435761,
      door = measure.doors.length ? measure.doors[0] : undefined,
      stone = looks[1] ?? looks[0];
    const axes = door && doorAxes(door);
    if (!door || !axes || room(axes.centre, axes.n, fit) < 0.3) {
      add.rock(looks[0], [fit.x0, fit.x1], [fit.y0, fit.y1], [fit.z0, fit.z1], seed);
      // A door on the rock's face: a dressed stone face round it, set square to it, back into the rock.
      if (door) behindDoor(add, stone, door, fit, { margin: 0.6, above: 0.6, deep: 1.5 });
      return;
    }
    // A door deep in its box: the rock stands behind it, two boulders flank the way down to it, a stone face round it.
    const spanX = axes.corners.map((corner) => corner[0]),
      back = Math.min(...axes.corners.map((corner) => corner[2]));
    add.rock(looks[0], [fit.x0, fit.x1], [fit.y0, fit.y1], [fit.z0, back], seed);
    const flank = fit.y0 + fit.height * 0.6,
      left = Math.min(...spanX) - 0.4,
      right = Math.max(...spanX) + 0.4;
    if (left - fit.x0 > 0.3) add.rock(looks[0], [fit.x0, left], [fit.y0, flank], [back - 0.5, fit.z1], seed + 1);
    if (fit.x1 - right > 0.3) add.rock(looks[0], [right, fit.x1], [fit.y0, flank], [back - 0.5, fit.z1], seed + 2);
    behindDoor(add, stone, door, fit, { margin: 0.4, above: 0.15, deep: 0.8 });
  },
  ruin(add, fit, looks, _measure, id) {
    const { add: along, fit: long } = lengthwise(add, fit);
    const random = randomFromSeed((id * 40503) >>> 0),
      stone = looks[0];
    along.box(
      looks[1] ?? stone,
      [long.x0, long.x1],
      [long.y0, long.y0 + Math.min(0.3, long.height * 0.12)],
      [long.z0, long.z1],
    );
    // A broken wall along x, its ends standing whole; a deep piece is a room's corner, a second wall along z.
    const wall = (
      builder: typeof along,
      fromX: number,
      toX: number,
      fromZ: number,
      toZ: number,
      whole: readonly number[],
    ): void => {
      const pieces = Math.max(2, Math.round((toX - fromX) / 1.2));
      for (let k = 0; k < pieces; k++) {
        const from = fromX + ((toX - fromX) * k) / pieces,
          to = fromX + ((toX - fromX) * (k + 1)) / pieces;
        const top =
          whole.includes(k) || whole.includes(k - pieces)
            ? long.y1
            : long.y0 + long.height * (0.45 + random.next() * 0.55);
        builder.box(stone, [from, to], [long.y0, top], [fromZ, toZ]);
      }
    };
    const deep = long.depth > Math.max(1.2, long.length * 0.35);
    const thick = deep ? Math.min(0.6, long.depth * 0.2) : long.depth * 0.8;
    if (!deep) return wall(along, long.x0, long.x1, long.z0 + long.depth * 0.1, long.z1 - long.depth * 0.1, [0, -1]);
    wall(along, long.x0, long.x1, long.z0, long.z0 + thick, [0]);
    wall(along.crosswise(), long.z0 + thick, long.z1, long.x0, long.x0 + thick, [-1]);
  },
  ruinArch(add, fit, looks) {
    const { add: along, fit: long } = lengthwise(add, fit);
    const stone = looks[0],
      pier = long.length * 0.25,
      thick = [long.z0 + long.depth * 0.1, long.z1 - long.depth * 0.1];
    along.box(stone, [long.x0, long.x0 + pier], [long.y0, long.y1], [long.z0, long.z1]);
    along.box(stone, [long.x1 - pier, long.x1], [long.y0, long.y0 + long.height * 0.8], thick);
    along.box(
      stone,
      [long.x0 + pier, long.x1 - pier],
      [long.y0 + long.height * 0.62, long.y0 + long.height * 0.8],
      thick,
    );
  },
  log(add, fit, looks) {
    const { add: along, fit: long } = lengthwise(add, fit);
    along.lying(looks[0], long.x0, long.x1, (long.y0 + long.y1) / 2, long.middleZ, long.height / 2, long.depth / 2, 8);
  },
  column(add, fit, looks, _measure, id) {
    const random = randomFromSeed((id * 9781) >>> 0),
      stone = looks[0],
      base = Math.min(0.25, fit.height * 0.08);
    add.box(stone, [fit.x0, fit.x1], [fit.y0, fit.y0 + base], [fit.z0, fit.z1]);
    const broken = fit.y1 - fit.height * random.next() * 0.12;
    add.prism(stone, fit.middleX, fit.middleZ, fit.length * 0.38, fit.depth * 0.38, fit.y0 + base, broken, 8, {
      taper: 0.92,
    });
    add.prism(looks[1] ?? stone, fit.middleX, fit.middleZ, fit.length * 0.2, fit.depth * 0.2, broken, fit.y1, 5, {
      taper: 0.4,
    });
  },
  signpost(add, fit, looks) {
    const { add: along, fit: long } = lengthwise(add, fit);
    const wood = woodLook(looks),
      post = clampTo(long.length * 0.08, 0.06, 0.14),
      arm = long.y1 - 0.08;
    along.box(wood, [long.x0, long.x0 + post], [long.y0, long.y1], [long.z0, long.z1]);
    along.box(wood, [long.x0 + post, long.x1], [arm, long.y1], [long.middleZ - 0.03, long.middleZ + 0.03]);
    along.box(
      wood,
      [long.x0 + post, long.x0 + post + (long.x1 - long.x0) * 0.3],
      [arm - (long.y1 - long.y0) * 0.12, arm],
      [long.middleZ - 0.02, long.middleZ + 0.02],
    );
    along.box(
      faceLook(looks),
      [long.x0 + post + 0.1, long.x1 - 0.02],
      [arm - Math.min(0.9, long.height * 0.3), arm - 0.08],
      [long.middleZ - 0.03, long.middleZ + 0.03],
      [],
    );
  },
  signFrame(add, fit, looks) {
    const { add: along, fit: long } = lengthwise(add, fit);
    const wood = woodLook(looks),
      post = clampTo(long.length * 0.08, 0.06, 0.14),
      bar = 0.1;
    for (const x of [long.x0, long.x1 - post])
      along.box(wood, [x, x + post], [long.y0, long.y1 - bar], [long.z0, long.z1]);
    along.box(wood, [long.x0, long.x1], [long.y1 - bar, long.y1], [long.middleZ - post / 2, long.middleZ + post / 2]);
    along.box(
      faceLook(looks),
      [long.x0 + post + 0.06, long.x1 - post - 0.06],
      [long.y1 - bar - Math.min(0.9, long.height * 0.3), long.y1 - bar - 0.08],
      [long.middleZ - 0.03, long.middleZ + 0.03],
      [],
    );
  },
  signPole(add, fit, looks) {
    const { add: along, fit: long } = lengthwise(add, fit);
    const wood = woodLook(looks),
      board = Math.min(0.9, long.height * 0.25);
    along.pyramid(
      looks[1] ?? wood,
      [long.middleX - 0.3, long.middleX + 0.3],
      [long.y0, long.y0 + 0.4],
      [long.middleZ - Math.min(0.3, long.depth / 2), long.middleZ + Math.min(0.3, long.depth / 2)],
    );
    along.box(
      wood,
      [long.middleX - 0.04, long.middleX + 0.04],
      [long.y0 + 0.3, long.y1 - board],
      [long.middleZ - 0.04, long.middleZ + 0.04],
    );
    along.box(
      faceLook(looks),
      [long.x0, long.x1],
      [long.y1 - board, long.y1],
      [long.middleZ - 0.03, long.middleZ + 0.03],
      [],
    );
  },
  mound(add, fit, looks) {
    const earth = looks[0],
      ring = fit.y0 + Math.min(1.2, fit.height * 0.18),
      bands = 4,
      sides = 12;
    add.prism(looks[1] ?? earth, fit.middleX, fit.middleZ, fit.length / 2, fit.depth / 2, fit.y0, ring, sides, {
      top: false,
      turn: Math.PI / sides,
      fill: true,
    });
    for (let k = 0; k < bands; k++) {
      const from = (k / bands) * Math.PI * 0.42,
        to = ((k + 1) / bands) * Math.PI * 0.42;
      const rise = (angle: number): number => ring + ((fit.y1 - ring) * Math.sin(angle)) / Math.sin(Math.PI * 0.42);
      add.prism(
        earth,
        fit.middleX,
        fit.middleZ,
        (fit.length / 2) * Math.cos(from),
        (fit.depth / 2) * Math.cos(from),
        rise(from),
        rise(to),
        sides,
        { taper: Math.cos(to) / Math.cos(from), top: k === bands - 1, turn: Math.PI / sides, fill: true },
      );
    }
  },
  post(add, fit, looks) {
    add.box(looks[0], [fit.x0, fit.x1], [fit.y0, fit.y1 - Math.min(0.1, fit.height * 0.05)], [fit.z0, fit.z1]);
    add.pyramid(looks[0], [fit.x0, fit.x1], [fit.y1 - Math.min(0.1, fit.height * 0.05), fit.y1], [fit.z0, fit.z1]);
  },
  greatTree(add, fit, looks, measure) {
    const bark = looks[0],
      leaves = looks[1] ?? looks[0];
    const crown = fit.y0 + fit.height * 0.45,
      door = measure.doors.length ? measure.doors[0] : undefined;
    if (door) {
      // A dwelling's trunk stands square behind its door, its face the door's plane.
      const { centre, n, width } = doorAxes(door);
      const sides = 10,
        apothem = Math.max(Math.min(fit.length, fit.depth) * 0.16, width * 1.4);
      const trunkX = centre[0] - n[0] * apothem,
        trunkZ = centre[2] - n[2] * apothem,
        radius = apothem / Math.cos(Math.PI / sides);
      const turn = Math.atan2(n[2], n[0]) - Math.PI / sides;
      add.prism(bark, trunkX, trunkZ, radius, radius, fit.y0, crown + fit.height * 0.15, sides, { taper: 0.8, turn });
    } else {
      const trunk = Math.min(fit.length, fit.depth) * 0.16;
      add.prism(bark, fit.middleX, fit.middleZ, trunk * 1.8, trunk * 1.8, fit.y0, fit.y0 + fit.height * 0.08, 8, {
        taper: 0.6,
      });
      add.prism(
        bark,
        fit.middleX,
        fit.middleZ,
        trunk,
        trunk,
        fit.y0 + fit.height * 0.08,
        crown + fit.height * 0.15,
        8,
        { taper: 0.75 },
      );
    }
    add.prism(leaves, fit.middleX, fit.middleZ, fit.length / 2, fit.depth / 2, crown, fit.y0 + fit.height * 0.78, 8, {
      taper: 0.75,
      turn: Math.PI / 8,
      fill: true,
    });
    add.prism(
      leaves,
      fit.middleX,
      fit.middleZ,
      fit.length * 0.36,
      fit.depth * 0.36,
      fit.y0 + fit.height * 0.78,
      fit.y1,
      8,
      {
        taper: 0.25,
        turn: Math.PI / 8,
        fill: true,
      },
    );
  },
  gazebo(add, fit, looks) {
    const stone = looks[0],
      roof = looks[1] ?? looks[0];
    const radiusX = fit.length / 2,
      radiusZ = fit.depth / 2,
      deck = fit.y0 + Math.min(0.4, fit.height * 0.1),
      eaves = fit.y0 + fit.height * 0.7;
    add.prism(stone, fit.middleX, fit.middleZ, radiusX, radiusZ, fit.y0, deck, 6, { fill: true });
    for (let k = 0; k < 6; k++) {
      const turn = (k / 6) * Math.PI * 2,
        x = fit.middleX + Math.cos(turn) * radiusX * 0.8,
        z = fit.middleZ + Math.sin(turn) * radiusZ * 0.8;
      add.box(stone, [x - 0.12, x + 0.12], [deck, eaves], [z - 0.12, z + 0.12]);
    }
    add.prism(roof, fit.middleX, fit.middleZ, radiusX * 0.95, radiusZ * 0.95, eaves, eaves + 0.15, 6, { fill: true });
    add.prism(roof, fit.middleX, fit.middleZ, radiusX * 0.95, radiusZ * 0.95, eaves + 0.15, fit.y1, 6, {
      taper: 0,
      fill: true,
    });
  },
  wellHouse(add, fit, looks) {
    const { add: along, fit: long } = lengthwise(add, fit);
    const stone = looks[0],
      wood = woodLook(looks),
      curb = long.y0 + Math.min(0.8, long.height * 0.25),
      eaves = long.y0 + long.height * 0.78;
    const radius = Math.min(long.length, long.depth) * 0.32;
    along.prism(stone, long.middleX, long.middleZ, radius, radius, long.y0, curb, 8);
    for (const x of [long.middleX - radius - 0.1, long.middleX + radius])
      along.box(wood, [x, x + 0.1], [long.y0, eaves], [long.middleZ - 0.06, long.middleZ + 0.06]);
    along.box(
      wood,
      [long.middleX - radius - 0.1, long.middleX + radius + 0.1],
      [eaves - 0.5, eaves - 0.4],
      [long.middleZ - 0.05, long.middleZ + 0.05],
    );
    along.gable(looks[1] ?? wood, [long.x0, long.x1], [eaves, long.y1], [long.z0, long.z1]);
  },
  parkBench(add, fit, looks) {
    const { add: along, fit: long } = lengthwise(add, fit);
    const wood = woodLook(looks),
      seat = long.y0 + clampTo(0.45, long.height * 0.35, long.height * 0.6);
    for (const x of [long.x0 + 0.1, long.x1 - 0.16])
      along.box(looks[0], [x, x + 0.06], [long.y0, long.y1], [long.z0, long.z0 + 0.06]);
    for (const x of [long.x0 + 0.1, long.x1 - 0.16])
      along.box(looks[0], [x, x + 0.06], [long.y0, seat], [long.z1 - 0.06, long.z1]);
    for (let k = 0; k < 3; k++) {
      const z = long.z0 + 0.06 + ((long.depth - 0.1) * k) / 3;
      along.box(wood, [long.x0, long.x1], [seat - 0.04, seat], [z, z + (long.depth - 0.1) / 3 - 0.02]);
    }
    for (const y of [seat + (long.y1 - seat) * 0.35, long.y1 - 0.08])
      along.box(wood, [long.x0, long.x1], [y, y + 0.08], [long.z0, long.z0 + 0.04]);
  },
  ramp(add, fit, looks, measure) {
    const { add: along, fit: long } = measure.doors.length ? { add, fit } : lengthwise(add, fit);
    along.wedge(looks[0], [long.x0, long.x1], [long.y0, long.y1], [long.z0, long.z1]);
  },
  statue(add, fit, looks) {
    const stone = looks[0],
      plinth = fit.y0 + fit.height * 0.12;
    add.box(stone, [fit.x0, fit.x1], [fit.y0, plinth], [fit.z0, fit.z1]);
    const seated = fit.height < Math.max(fit.length, fit.depth) * 1.6;
    const hips = plinth + fit.height * (seated ? 0.32 : 0.42),
      shoulders = fit.y0 + fit.height * 0.84,
      head = fit.y1;
    const wide = Math.min(fit.length, fit.depth) * 0.42;
    if (seated)
      add.box(stone, [fit.middleX - wide, fit.middleX + wide], [plinth, hips - 0.1], [fit.z0 + 0.05, fit.z1 - 0.05]);
    add.prism(stone, fit.middleX, fit.middleZ, wide * 0.9, wide * 0.7, plinth, hips, 8, { taper: 0.8 });
    add.prism(stone, fit.middleX, fit.middleZ, wide * 0.72, wide * 0.55, hips, shoulders, 8, { taper: 1.1 });
    for (const side of [-1, 1])
      add.box(
        stone,
        [fit.middleX + side * wide * 0.75 - wide * 0.14, fit.middleX + side * wide * 0.75 + wide * 0.14],
        [hips + (shoulders - hips) * 0.15, shoulders],
        [fit.middleZ - wide * 0.2, fit.middleZ + wide * 0.2],
      );
    add.prism(stone, fit.middleX, fit.middleZ, wide * 0.34, wide * 0.36, shoulders, head, 8, { taper: 0.8 });
  },
} satisfies Record<string, Family>;
