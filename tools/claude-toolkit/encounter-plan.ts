// Writes a webgpu-shot plan picturing every moment of one Elite Dungeon's encounters a player meets, for a room module
// dungeon-qa-build.sh built (QA_NOFOES=1), served by Vite in a worktree of its own; a port other than 5173 gives the
// plan "anyPort". Each seal from the corridor outside the doorway its room is entered by and from inside, waiting
// (the room's clock held, so it cannot start), then running, and its own moments: a Litany's show and a wrong rune's
// flash, a Weighing's plates held, an Ascent's foul water harming and a body on a pad and on its stone, a Holdfast's
// ring held, draining and drained. Then the Court: before the Boss wakes, awake, a ward with its dome, anchors filling,
// the slam, Fury's warning and its weight, and the Reckoning's warning and light. Moments the QA hooks cannot reach
// by walking are set with `room_qa_encounter` and held with `room_qa_freeze`. The run loads in 150 s.
//
//     node tools/claude-toolkit/encounter-plan.ts <room-qa.wasm> <elite place> <out dir> <plan.json> [port]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { askLayout, floorOf, ROCK, STAIR, storeyAt, storeyUnder, VOID } from '../../client/src/game/dungeonLayout.ts';

const [wasm, place, out, planPath, port = '5173'] = process.argv.slice(2);
if (!wasm || !place || !out || !planPath) throw new Error('name the room-qa.wasm, the Elite Dungeon, a folder, a plan');
const layout = askLayout(await WebAssembly.compile(readFileSync(wasm)), { place, name: place });
const plan = layout.encounters;
if (!plan) throw new Error(`${place} lays no encounters`);
mkdirSync(out, { recursive: true });
type Point = readonly number[];
type Seal = NonNullable<typeof plan>['seals'][number];
// Every room module made is kept, in the game's worker (its prediction) and in the rooms' worker the game's worker
// starts (the room itself, which judges where the body stands), and each worker acts on a word over the `qa` channel:
// a point [x, y, z?] stands every body there (lifted to z, onto a pad) and heals it; {call, args} calls a QA hook.
// The rooms' worker is started from a script that runs the same capture first and then imports the worker's own.
const capture =
  'const Real=WebAssembly.Instance;self.__qa=[];const Made=function(module,imports){' +
  'const made=new Real(module,imports);if(made.exports.room_qa_move){self.__qa.push(made.exports);}return made;};' +
  'Made.prototype=Real.prototype;WebAssembly.Instance=Made;' +
  "new BroadcastChannel('qa').onmessage=(word)=>{const asked=word.data;self.__qa.forEach((room)=>{" +
  'if(asked.call){room[asked.call](...asked.args);return;}room.room_qa_move(asked[0],asked[1]);' +
  'if(asked[2]!==undefined)room.room_qa_encounter(1,asked[2],0);room.room_qa_encounter(0,0,0);});};';
const init =
  `(()=>{${capture}const Started=self.Worker;if(!Started)return;` +
  'self.Worker=function(url,options){const href=new URL(String(url),self.location.href).href;' +
  "if(!href.includes('roomWorker'))return new Started(url,options);" +
  `const head=${JSON.stringify(`(()=>{${capture}})();`)};` +
  "const script=new Blob([head+'\\nimport '+JSON.stringify(href)+';'],{type:'text/javascript'});" +
  'return new Started(URL.createObjectURL(script),options);};})();';
const steps: object[] = [{ wait: 150 }, { frames: 2 }, { shot: `${out}/00_arrived.png` }];
const sleep = (millis: number) => `await new Promise((done)=>setTimeout(done,${millis}));`;
const bearing = ([fromX = 0, fromY = 0]: Point, [toX = 0, toY = 0]: Point) =>
  (Math.atan2(toX - fromX, -(toY - fromY)) * 180) / Math.PI;
const middleOf = (points: readonly Point[]): Point => [
  points.reduce((sum, point) => sum + (point[0] ?? 0), 0) / points.length,
  points.reduce((sum, point) => sum + (point[1] ?? 0), 0) / points.length,
  points[0]?.[2] ?? 0,
];
/** `metres` from `from` toward `to` on the floor, at `from`'s height. */
const toward = (from: Point, to: Point, metres: number): Point => {
  const [east, south] = [(to[0] ?? 0) - (from[0] ?? 0), (to[1] ?? 0) - (from[1] ?? 0)];
  const length = Math.hypot(east, south) || 1;
  return [(from[0] ?? 0) + (east / length) * metres, (from[1] ?? 0) + (south / length) * metres, from[2] ?? 0];
};

/** A QA hook called in every room module, then a moment for the rooms' worker to take it. */
const call = (name: string, ...args: number[]) =>
  steps.push({
    eval: `(async()=>{new BroadcastChannel('qa').postMessage({call:'${name}',args:${JSON.stringify(args)}});${sleep(300)}})()`,
  });
const freeze = (held: boolean) => call('room_qa_freeze', held ? 1 : 0);
const encounter = (what: number, first: number, second: number) => call('room_qa_encounter', what, first, second);
// The room ticks as the page draws (a slow frame runs many ticks), so a pause is a frame as well as its time.
const pause = (millis: number) => steps.push({ eval: `(async()=>{${sleep(millis)}})()` }, { frames: 1 });
/** The storey a point (x, y, z) stands on, and that storey's floor (m). */
const storeyOfPoint = (point: Point) => storeyUnder(layout, (point[2] ?? 0) + 0.01);
const floorUnder = (point: Point) => floorOf(layout, storeyOfPoint(point));
/** Stands the body at `point`, lifted to `lift` (a pad's top, or else the floor of the point's storey), asked again
 *  every `every` ms until the page's own body stands there; the run fails if it never does. */
const stand = (point: Point, lift = floorUnder(point), every = 1000) => {
  const [east = 0, south = 0] = point;
  steps.push({
    eval:
      `(async()=>{const qa=new BroadcastChannel('qa');let at=null;for(let tries=0;tries<${(60000 / every) | 0};tries+=1){` +
      `qa.postMessage([${east},${south},${lift}]);${sleep(every)}at=self.__qaWhere();` +
      `if(Math.hypot(at.x-${east},at.y-${south})<1)return at;}` +
      `throw new Error('never stood at ${east},${south}: '+JSON.stringify(at));})()`,
  });
};
let shot = 1;
/** Turns the camera from where the body stands toward `facing` and pictures it. */
const picture = (standing: Point, facing: Point, camera: string, name: string) => {
  const [east, south] = standing;
  steps.push(
    { frames: 2 },
    { eval: `self.__qaLook([${east},${south},${bearing(standing, facing)},'${camera}'])` },
    { frames: 2 },
    { shot: `${out}/${String(shot++).padStart(2, '0')}_${name}.png` },
  );
};

const KINDS = ['', 'litany', 'weighing', 'ascent', 'holdfast'];
const [LITANY, WEIGHING, ASCENT, HOLDFAST] = [1, 2, 3, 4];
// Cells are storey-major: a storey's plane follows the one over it.
const plane = layout.columns * layout.rows;
/** A cell's middle, on its storey's floor. */
const centre = (cell: number): Point => [
  (((cell % plane) % layout.columns) + 0.5) * layout.cell,
  (Math.floor((cell % plane) / layout.columns) + 0.5) * layout.cell,
  floorOf(layout, Math.floor(cell / plane)),
];
const cellOf = (point: Point) =>
  storeyOfPoint(point) * plane +
  Math.floor((point[1] ?? 0) / layout.cell) * layout.columns +
  Math.floor((point[0] ?? 0) / layout.cell);
/** The cells beside `cell` on its storey, in the order east, south, west, north. */
const besideOn = (cell: number) => {
  const [storey, column, row] = [Math.floor(cell / plane), (cell % plane) % layout.columns, Math.floor((cell % plane) / layout.columns)];
  return (
    [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ] as const
  ).flatMap(([east, south]) => {
    const [nextColumn, nextRow] = [column + east, row + south];
    const inside = nextColumn >= 0 && nextRow >= 0 && nextColumn < layout.columns && nextRow < layout.rows;
    return inside ? [storey * plane + nextRow * layout.columns + nextColumn] : [];
  });
};
/** The flight a flight's cell is of, or undefined. */
const flightOf = (cell: number) =>
  (layout.stairs ?? []).find((stair) => {
    const storey = Math.floor(cell / plane);
    return (storey === stair.upper || storey === stair.upper + 1) && stair.cells.includes(cell % plane);
  });
/** The landing a flight's end cell steps onto: its head's on the upper storey, its foot's on the lower; else null. */
const landingOf = (cell: number) => {
  const [flight, storey] = [flightOf(cell), Math.floor(cell / plane)];
  if (!flight) return null;
  if (storey === flight.upper && cell % plane === flight.cells[0]) return storey * plane + flight.top;
  if (storey === flight.upper + 1 && cell % plane === flight.cells.at(-1)) return storey * plane + flight.bottom;
  return null;
};
/** The cells a walk steps to from a cell, as the rules walk it (crates/dungeon storeys.rs `walk_from`): open cells
 *  beside it on its storey but open air, a flight's cells only to its own and its ends to their landings, and a
 *  flight's cell to its twin on the other storey it joins. */
const walkFrom = (cell: number) => {
  const flight = (each: number) => (layout.cells[each] === STAIR ? flightOf(each) : undefined);
  const steps = besideOn(cell).filter((next) => {
    if (layout.cells[next] === ROCK || layout.cells[next] === VOID) return false;
    const [from, to] = [flight(cell), flight(next)];
    if (from && to) return from === to;
    if (from) return landingOf(cell) === next;
    if (to) return landingOf(next) === cell;
    return true;
  });
  const twin = flight(cell);
  if (!twin) return steps;
  const other = Math.floor(cell / plane) === twin.upper ? twin.upper + 1 : twin.upper;
  return [...steps, other * plane + (cell % plane)];
};
// Each cell's walk from the way in over the open cells, as the room's plan reads the doorway a room is entered by.
const walks = layout.cells.map(() => Infinity);
walks[layout.wayIn.cell] = 0;
for (const todo = [layout.wayIn.cell]; todo.length > 0; ) {
  const cell = todo.shift() ?? 0;
  for (const next of walkFrom(cell)) {
    if (walks[next] !== Infinity) continue;
    walks[next] = (walks[cell] ?? 0) + 1;
    todo.push(next);
  }
}
/** The solids of a storey: each by the floor nearest its bottom, so a piece sunk under its floor stays its own. */
const boxesOn = (storey: number) => layout.boxes.filter((box) => storeyAt(layout, box[4]) === storey);
/** A room's doorway cell it is entered by (nearest the way in on the walk), and the open cell outside it that the
 *  company comes from. */
function entry(room: number): { door: Point; outside: Point } {
  const doors = (plan?.seals.find((seal) => seal.room === room)?.doors ?? []).map(cellOf);
  const cells = doors.length > 0 ? doors : layout.cells.flatMap((found, cell) => (found === room ? [cell] : []));
  // Nearest the way in on the walk, the lower cell on a tie, as the room's plan reads it (`entered_by`).
  const first = (best: number, cell: number) => {
    const [mine, theirs] = [walks[cell] ?? Infinity, walks[best] ?? Infinity];
    return mine < theirs || (mine === theirs && cell < best) ? cell : best;
  };
  const door = cells.reduce(first);
  const around = besideOn(door).filter((cell) => ![room, ROCK, VOID, STAIR].includes(layout.cells[cell] ?? ROCK));
  const outside = around.reduce(first, door);
  return { door: centre(door), outside: centre(outside) };
}
/** The middle of the seal's room's cell, clear of every pad and solid by a metre, farthest from `from`. */
function floorAcross(seal: Seal, from: Point): Point {
  const storey = Math.floor(layout.cells.indexOf(seal.room) / plane);
  const clear = ([x = 0, y = 0]: Point) =>
    [...seal.pads, ...boxesOn(storey)].every(
      ([minX, minY, maxX, maxY]) => x < minX - 1 || x > maxX + 1 || y < minY - 1 || y > maxY + 1,
    );
  const far = (point: Point) => Math.hypot((point[0] ?? 0) - (from[0] ?? 0), (point[1] ?? 0) - (from[1] ?? 0));
  const cells = layout.cells.flatMap((room, cell) => (room === seal.room ? [centre(cell)] : []));
  return cells.filter(clear).sort((first, second) => far(second) - far(first))[0] ?? from;
}

/** How far `point` stands inside room `index`'s walls and clear of every solid, metres (less than 0 outside). */
function openness(index: number, point: Point): number {
  const [x = 0, y = 0] = point;
  const room = layout.rooms[index];
  const walls = room
    ? Math.min(
        x - room.x * layout.cell,
        (room.x + room.width) * layout.cell - x,
        y - room.y * layout.cell,
        (room.y + room.depth) * layout.cell - y,
      )
    : 0;
  const storey = storeyOfPoint(point);
  const solids = boxesOn(storey).map(([minX, minY, maxX, maxY]) => Math.max(minX - x, x - maxX, minY - y, y - maxY));
  return Math.min(walls, ...solids);
}

plan.seals.forEach((seal, index) => {
  const kind = KINDS[seal.kind] ?? 'seal';
  // A Weighing's lone player has its first two plates in play: the picture looks between them.
  const shown = seal.kind === WEIGHING ? seal.pieces.slice(0, 2) : seal.pieces;
  const middle = middleOf(shown.length > 1 ? shown : [...shown, ...seal.doors]);
  const { door, outside } = entry(seal.room);
  // Waiting, from the corridor the company comes by, looking in through the doorway.
  stand(outside);
  picture(outside, toward(outside, door, 8), 'third,4,15', `${kind}_waiting_outside`);
  // Waiting, from the doorway it is entered by, where a player first sees it: the room's clock held, so standing in
  // its room does not start it. The camera stands behind, in the corridor.
  freeze(true);
  const inside = door;
  stand(inside);
  picture(inside, middle, 'first,0,12', `${kind}_waiting_inside`);
  freeze(false);
  const first = seal.pieces[0] ?? middle;
  if (seal.kind === LITANY) {
    // The room ticks as the page draws, many ticks to a slow frame: a frame lets the seal start, then the show's
    // first rune half shown is set, not waited for.
    steps.push({ frames: 1 });
    freeze(true);
    encounter(9, index, 30);
    picture(inside, first, 'first,0,20', 'litany_show');
    freeze(false);
    // A step on the second rune before the first is lit is wrong: it flashes red for a second.
    const wrong = seal.pieces[1] ?? first;
    stand(wrong, undefined, 150);
    freeze(true);
    picture(wrong, toward(wrong, inside, -1), 'third,6,50', 'litany_wrong');
    freeze(false);
  }
  if (seal.kind === WEIGHING) {
    pause(800);
    freeze(true);
    picture(inside, middle, 'first,0,12', 'weighing_running');
    freeze(false);
    const [plate, other] = [seal.pieces[0] ?? first, seal.pieces[1] ?? first];
    stand(plate);
    pause(800);
    // On the second plate's far side, still on it, looking back over it to the first.
    const held = toward(other, plate, -0.6);
    stand(held, undefined, 300);
    freeze(true);
    picture(held, plate, 'third,9,50', 'weighing_plates_held');
    freeze(false);
  }
  if (seal.kind === ASCENT) {
    const stone = seal.pads[seal.pads.length - 1];
    const water = floorAcross(seal, door);
    // The room ticks only as the page draws: enough frames for the floor to harm the body a time or two.
    stand(water, undefined, 300);
    steps.push({ frames: 30 });
    freeze(true);
    picture(water, middleOf(seal.pads.map(([minX, minY, maxX, maxY]) => [(minX + maxX) / 2, (minY + maxY) / 2])), 'third,6,25', 'ascent_foul_water');
    encounter(0, 0, 0);
    freeze(false);
    const pad = seal.pads[1] ?? stone;
    if (pad && stone) {
      const padMiddle = [(pad[0] + pad[2]) / 2, (pad[1] + pad[3]) / 2];
      stand(padMiddle, pad[4] + 0.05, 300);
      pause(600);
      freeze(true);
      picture(padMiddle, [(stone[0] + stone[2]) / 2, (stone[1] + stone[3]) / 2], 'third,6,25', 'ascent_on_pad');
      freeze(false);
      const top = [(stone[0] + stone[2]) / 2, (stone[1] + stone[3]) / 2];
      stand(top, stone[4] + 0.05, 200);
      freeze(true);
      picture(top, door, 'first,0,50', 'ascent_on_stone');
      // Off the stone before the clock runs again, so the seal stays for the Court's pictures.
      stand(door);
      freeze(false);
    }
  }
  if (seal.kind === HOLDFAST) {
    // Inside the ring on the side whose camera, 4 m behind the body, stands deepest in the room's open floor, so neither
    // a wall nor a pillar comes between it and the body and the whole relic.
    const roomy = (point: Point) => openness(seal.room, point);
    const sides = [0, 1, 2, 3, 4, 5, 6, 7].map((eighth) => {
      const turn = (eighth * Math.PI) / 4;
      const out = (metres: number): Point => [
        (first[0] ?? 0) + Math.sin(turn) * metres,
        (first[1] ?? 0) - Math.cos(turn) * metres,
        first[2] ?? 0,
      ];
      return { ring: out(2.4), room: Math.min(roomy(out(2.4)), roomy(out(4.4)), roomy(out(6.4))) };
    });
    const ring = sides.reduce((best, side) => (side.room > best.room ? side : best)).ring;
    // Looking a little aside of the relic, so the ring at its middle never stands behind the body's head.
    const [acrossX, acrossY] = [(first[1] ?? 0) - (ring[1] ?? 0), (ring[0] ?? 0) - (first[0] ?? 0)];
    const aside: Point = [(first[0] ?? 0) + acrossX * 0.5, (first[1] ?? 0) + acrossY * 0.5];
    stand(ring);
    pause(800);
    freeze(true);
    picture(ring, aside, 'third,4,20', 'holdfast_held');
    encounter(2, index, 0.45);
    picture(ring, aside, 'third,4,20', 'holdfast_draining');
    encounter(2, index, 0);
    picture(ring, aside, 'third,4,20', 'holdfast_drained');
    encounter(2, index, 1);
    freeze(false);
  }
});

// The Court: the end room from inside the doorway it is entered by, looking over the anchors.
const anchors = middleOf(plan.anchors);
const court = entry(layout.end);
stand(court.door);
picture(court.door, anchors, 'first,0,10', 'court_before_wake');
const [anchor0 = anchors, anchor1 = anchors, anchor2 = anchors] = plan.anchors;
// From the anchors' middle side of each, never its wall side, so the camera behind stands in the open room.
const byAnchor = toward(anchor2, anchors, 1.8);
stand(byAnchor);
picture(byAnchor, anchor2, 'third,6,45', 'court_anchors_resting');
// Awake, the Boss strikes: the body's health is held whole and deep from here, so no death hides a moment. Before
// each picture of it the Boss (and its post, where a ward holds it) is stood ahead on the camera's line, 6.5 m or as
// far as the end room's open floor allows, and the camera looks low enough that it stands in the frame's middle.
encounter(10, 1, 0);
const bossAhead = (from: Point, to: Point) => {
  let metres = 6.5;
  while (metres > 2 && openness(layout.end, toward(from, to, metres)) < 1.5) metres -= 0.25;
  const [east = 0, south = 0] = toward(from, to, metres);
  encounter(11, east, south);
  // Frames enough for the page's figure to follow it there after a long move.
  steps.push({ frames: 20 });
};
encounter(3, 0, 0);
pause(1500);
bossAhead(byAnchor, anchor0);
freeze(true);
picture(byAnchor, anchor0, 'third,9,22', 'court_awake');
freeze(false);
encounter(4, 0, 0);
pause(2500);
encounter(0, 0, 0);
freeze(true);
bossAhead(byAnchor, anchor0);
picture(byAnchor, anchor0, 'third,9,22', 'court_ward');
encounter(5, 0, 1);
encounter(5, 1, 0.5);
// Beside an anchor, not on it, so its beam does not stand in the camera's way.
const beside = toward(anchor1, anchors, 1.8);
stand(beside);
// The Boss stands where the slam and Fury pictures want it; the filling anchor is this picture's own.
bossAhead(beside, anchor0);
picture(beside, anchor1, 'third,7,45', 'court_anchors_filling');
encounter(6, 0, 50);
picture(beside, anchor0, 'third,9,22', 'court_slam');
encounter(6, 0, 300);
encounter(8, 0, 45 * 60);
picture(beside, anchor0, 'third,9,14', 'court_fury_warning');
encounter(8, 0, -31 * 60);
picture(beside, anchor0, 'third,9,14', 'court_fury');
// The ward broken, a Reckoning may start at once on its own: it is set straight after, so its call is pictured in
// its moment.
for (const nth of [0, 1, 2]) encounter(5, nth, 1);
freeze(false);
steps.push({ frames: 1 });
encounter(7, 0, 420);
freeze(true);
picture(beside, anchor0, 'third,8,25', 'court_reckoning');
const url = `http://localhost:${port}/?at=1&spawn=&run=node-${place}--run-qaqa0001&view=third,7`;
const anyPort = port !== '5173';
writeFileSync(
  planPath,
  JSON.stringify({ url, routes: { 'room.wasm': wasm }, steps, init, size: [1280, 720], anyPort }, null, 1),
);
console.log(JSON.stringify(plan.seals.map((seal) => [KINDS[seal.kind], seal.pieces.length, seal.pads.length])));
