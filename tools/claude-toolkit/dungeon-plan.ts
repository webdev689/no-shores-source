// Writes a webgpu-shot plan that pictures one patrol's dungeon, for a room.wasm dungeon-qa-build.sh built: it joins
// before the dungeon's entrance, enters, then stands and faces each view, so one page load pictures the dungeon.
// By default each room (up to [most rooms]) from its cell farthest from its middle, facing the middle. `review`
// pictures each landmark's room twice, the way in's facing the exit, the end facing the portal, two more rooms, each
// look's longest corridor, and first-person close views of each style's door, pillar, sconce, wall set, feature,
// ceiling and floor pieces (placed from the published packs: behind a proxy, NODE_USE_ENV_PROXY=1). Beside the plan,
// `<plan>.labels.json` names each picture; the last step prints each pack's fetches. Serve the built page on 5173.
//
//     node tools/claude-toolkit/dungeon-plan.ts <room-qa.wasm> <patrol id> <number> <out dir> [most rooms | review]
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import table from '../../content/dungeon/landmarks.json' with { type: 'json' };
import manifest from '../../content/dungeon/modules.json' with { type: 'json' };
import { cellAt, centreOf, isOpen, ontoWall, stepOf, wallPoint, wayTurns } from '../../client/src/game/dungeonCells.ts';
import { kitPlacements } from '../../client/src/game/dungeonKits.ts';
import { placedLandmarks } from '../../client/src/game/dungeonLandmarks.ts';
import { askDungeon, CORRIDOR, styleAt, type StyleKey } from '../../client/src/game/dungeonLayout.ts';
import { type ModulePack, readModulePack, turnAbout } from '../../client/src/game/dungeonModules.ts';

const [wasm, patrol, numberText = '0', out, mostText = '99'] = process.argv.slice(2);
if (!wasm || !patrol || !out) throw new Error('name the room-qa.wasm, the patrol, its dungeon number and a folder');
const number = Number(numberText);
const review = mostText === 'review';
const land = 'content/world/land';
const nodes: { id: string; name: string }[] = readdirSync(land).flatMap(
  (file) => JSON.parse(readFileSync(`${land}/${file}`, 'utf8')).nodes ?? [],
);
const patrolName = nodes.find((node) => node.id === patrol)?.name;
if (!patrolName) throw new Error(`no patrol ${patrol} in ${land}`);
const layout = askDungeon(await WebAssembly.compile(readFileSync(wasm)), patrol, patrolName, number);

/** How far the view turns for each pixel the mouse moves, as the game's player.ts turns it. */
const MOUSE_TURN = 0.0025;
/** Where player.ts starts the view's pitch (down is positive). */
const START_PITCH = 0.1;
/** How near a stand may come to a solid or rock, so the body is not pushed off it (m). */
const BODY_ROOM = 0.45;
const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
const bearing = ([fromX, fromY]: readonly number[], [toX, toY]: readonly number[]) =>
  Math.atan2((toX ?? 0) - (fromX ?? 0), -((toY ?? 0) - (fromY ?? 0)));
// The canvas reads as pointer-locked, so mousemove turns the view; each room module made is told its entrance, and
// every pack the page fetches is counted.
const init =
  "Object.defineProperty(Document.prototype,'pointerLockElement',{configurable:true,get(){return document.getElementById('game');}});" +
  'HTMLCanvasElement.prototype.requestPointerLock=function(){return Promise.resolve();};' +
  '(()=>{const Real=WebAssembly.Instance;window.__qa=[];const Made=function(m,i){const made=new Real(m,i);' +
  `if(made.exports.room_qa_entrance){made.exports.room_qa_entrance(${number});window.__qa.push(made.exports);}return made;};` +
  'Made.prototype=Real.prototype;WebAssembly.Instance=Made;})();' +
  "(()=>{const real=window.fetch;window.__packs={};window.fetch=function(what,...rest){const url=String(what&&what.url||what);if(url.endsWith('.modules'))window.__packs[url]=(window.__packs[url]||0)+1;return real.call(this,what,...rest);};})();";
const steps: object[] = [
  { waitFor: `Enter ${layout.name}`, timeout: 600 },
  { frames: 3 },
  { key: 'e' },
  { wait: 8 },
  { frames: 20 },
];
let yaw = layout.arrival.bearing;
let pitch = START_PITCH;
let firstPerson = false;
const look = (pixels: number, axis: 'movementX' | 'movementY') =>
  steps.push({ eval: `window.dispatchEvent(new MouseEvent('mousemove',{${axis}:${pixels}}));'${axis} ${pixels}'` }, { frames: 3 });
const stand = ([x, y]: readonly number[]) =>
  steps.push({ eval: `window.__qa.forEach((room)=>room.room_qa_move(${x},${y}));'moved'` }, { frames: 10 });
const face = (from: readonly number[], to: readonly number[]) => {
  const pixels = Math.round(wrap(bearing(from, to) - yaw) / MOUSE_TURN);
  yaw += pixels * MOUSE_TURN;
  if (pixels) look(pixels, 'movementX');
};
const tilt = (to: number) => {
  const pixels = Math.round((to - pitch) / MOUSE_TURN);
  pitch += pixels * MOUSE_TURN;
  if (pixels) look(pixels, 'movementY');
};
// The perspective's button (the back side button) flips first and third person.
const person = (first: boolean) => {
  if (first === firstPerson) return;
  firstPerson = first;
  steps.push(
    { eval: "document.getElementById('game').dispatchEvent(new MouseEvent('mousedown',{button:3}));'down'" },
    { frames: 2 },
    { eval: "window.dispatchEvent(new MouseEvent('mouseup',{button:3}));'up'" },
    { frames: 4 },
  );
};
mkdirSync(`${out}/shots`, { recursive: true });
const labels: Record<string, string> = {};
let shots = 0;
const shot = (label: string) => {
  const path = `${out}/shots/${patrol}-${number}-${String(shots++).padStart(2, '0')}.png`;
  steps.push({ shot: path });
  labels[path] = label;
};
const roomLabel = (index: number) => {
  const room = layout.rooms[index];
  const style = layout.looks[room?.look ?? -1]?.style ?? '?';
  return `${room?.name} · ${style} · ${room?.ceiling} · ${room?.width}x${room?.depth}`;
};
const roomCells = (index: number) => layout.cells.flatMap((owner, cell) => (owner === index ? [cell] : []));
const distance = (from: readonly number[], to: readonly number[]) =>
  Math.hypot((from[0] ?? 0) - (to[0] ?? 0), (from[1] ?? 0) - (to[1] ?? 0));
/** Whether a body may stand at a point: on an open cell, clear of every solid. */
const clear = ([x = 0, y = 0]: readonly number[]) =>
  x > 0 &&
  y > 0 &&
  isOpen(layout, cellAt(layout, x, y)) &&
  [-BODY_ROOM, BODY_ROOM].every((east) =>
    [-BODY_ROOM, BODY_ROOM].every((south) => isOpen(layout, cellAt(layout, x + east, y + south))),
  ) &&
  layout.boxes.every(
    ([west, north, eastX, southY]) =>
      x < west - BODY_ROOM || x > eastX + BODY_ROOM || y < north - BODY_ROOM || y > southY + BODY_ROOM,
  );
/** Whether the floor from a point most of the way to a target is open: no rock stands between them. */
function seen([fromX = 0, fromY = 0]: readonly number[], [toX = 0, toY = 0]: readonly number[]) {
  return Array.from({ length: 20 }, (_unused, step) => (step * 0.9) / 19).every((share) =>
    isOpen(layout, cellAt(layout, fromX + (toX - fromX) * share, fromY + (toY - fromY) * share)),
  );
}
/** The first clear point `away` from a target along `out` on a cell of `owner` (a room's number, or a corridor) that
 *  sees it, trying the next distance as it must. */
function standOff(target: readonly number[], out: readonly number[], away: readonly number[], owner: number): number[] | null {
  for (const metres of away) {
    const point = [(target[0] ?? 0) + (out[0] ?? 0) * metres, (target[1] ?? 0) + (out[1] ?? 0) * metres];
    const ours = layout.cells[cellAt(layout, point[0] ?? 0, point[1] ?? 0)] === owner;
    if (ours && clear(point) && seen(point, target)) return point;
  }
  return null;
}

/** A room from the cell farthest from what it faces, third person, so the player stands in it for scale. */
function overview(index: number, toward: readonly number[] | null, label: string) {
  const room = layout.rooms[index];
  if (!room) return;
  const middle = toward ?? [(room.x + room.width / 2) * layout.cell, (room.y + room.depth / 2) * layout.cell];
  // A doorway's cell would put the camera behind the player out in the corridor, and rock inside a room can stand
  // between a cell and what it faces.
  const doorways = new Set(layout.frames.map(([cell]) => cell));
  const open = roomCells(index).filter((cell) => clear(centreOf(layout, cell)));
  const prefer = (cells: number[], keep: (cell: number) => boolean) => (cells.some(keep) ? cells.filter(keep) : cells);
  const own = prefer(
    prefer(open, (cell) => seen(centreOf(layout, cell), middle)),
    (cell) => !doorways.has(cell),
  );
  const far = (cell: number) => distance(centreOf(layout, cell), middle);
  const spot = own.reduce((best, cell) => (far(cell) > far(best) ? cell : best), own[0] ?? 0);
  const from = centreOf(layout, spot);
  person(false);
  stand(from);
  face(from, far(spot) < 0.5 ? [from[0], (from[1] ?? 0) + 1] : middle);
  tilt(review ? 0.15 : -0.025);
  shot(label);
}

/** A first-person view of `target` from `away` metres along `out` on a cell of `owner`, the eye pitched to `down`. */
function close(
  target: readonly number[],
  out: readonly number[],
  away: readonly number[],
  down: number,
  label: string,
  owner: number,
) {
  const from = standOff(target, out, away, owner);
  if (!from) return false;
  person(true);
  stand(from);
  face(from, target);
  tilt(down);
  shot(label);
  return true;
}

if (!review) {
  layout.rooms.slice(0, Number(mostText)).forEach((_room, index) => overview(index, null, roomLabel(index)));
} else {
  const landmarks = placedLandmarks(layout);
  const middleOf = (cells: readonly number[]) =>
    [0, 1].map((axis) => cells.reduce((sum, cell) => sum + (centreOf(layout, cell)[axis] ?? 0), 0) / cells.length);
  const chosen = new Set<number>();
  for (const landmark of landmarks) {
    const index = layout.cells[landmark.cells[0] ?? 0] ?? CORRIDOR;
    const middle = middleOf(landmark.cells);
    chosen.add(index);
    overview(index, middle, `${landmark.module} in ${roomLabel(index)}`);
    // A wall piece is seen from the side it faces first: modelled facing south, turned as it is laid.
    const facing = turnAbout([0, 1, 0], landmark.place.turns).slice(0, 2);
    const wall = table.landmarks.find((entry) => entry.module === landmark.module)?.wall ?? false;
    const sides = [
      ...(wall ? [facing] : []),
      ...[[1, 0], [0, 1], [-1, 0], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]],
    ];
    const sizes = landmark.cells.length > 1 ? [5.5, 5, 4.5, 6, 4] : [3.5, 3, 4, 2.6];
    sides.some((out) => close(middle, out, sizes, 0.45, `${landmark.module} close`, index));
  }
  const wayIn = layout.wayIn.room;
  const exit = [layout.exitDoor.x, layout.exitDoor.y];
  person(false);
  const exitFrom = standOff(exit, inward(layout.wayIn.side), [5, 4.5, 4, 3.5, 3], wayIn);
  if (exitFrom) {
    stand(exitFrom);
    face(exitFrom, exit);
    tilt(0.05);
    shot(`exit arch, way in: ${roomLabel(wayIn)}`);
  }
  close(exit, inward(layout.wayIn.side), [2.6, 2.2, 3], -0.15, 'exit arch close', wayIn);
  const portal = [layout.portal.x, layout.portal.y];
  person(false);
  const portalFrom = standOff(portal, inward(layout.portal.side), [5, 4.5, 4, 3.5, 3], layout.end);
  if (portalFrom) {
    stand(portalFrom);
    face(portalFrom, portal);
    tilt(0.05);
    shot(`portal arch, end: ${roomLabel(layout.end)}`);
  }
  close(portal, inward(layout.portal.side), [2.6, 2.2, 3], -0.15, 'portal arch close', layout.end);
  chosen.add(wayIn).add(layout.end);
  // Two more rooms: a look or a ceiling not pictured yet first, then the largest.
  const seen = (index: number, key: (room: (typeof layout.rooms)[number]) => string) =>
    [...chosen].some((other) => layout.rooms[other] && key(layout.rooms[other]) === key(layout.rooms[index] ?? layout.rooms[0]!));
  const rank = (index: number) => {
    const room = layout.rooms[index];
    if (!room) return -1;
    return (seen(index, (each) => `${each.look}`) ? 0 : 200) + (seen(index, (each) => each.ceiling) ? 0 : 100) + room.width * room.depth;
  };
  for (let more = 0; more < 2; more++) {
    const left = layout.rooms.map((_room, index) => index).filter((index) => !chosen.has(index));
    const best = left.sort((first, second) => rank(second) - rank(first))[0];
    if (best === undefined) break;
    chosen.add(best);
    overview(best, null, roomLabel(best));
  }
  // Each look's longest straight corridor, from one end along it.
  const corridors = new Map<number, number[]>();
  for (const alongX of [true, false])
    layout.cells.forEach((owner, cell) => {
      const straight = (each: number) =>
        layout.cells[each] === CORRIDOR && wayTurns(layout, each) === (alongX ? 0 : 1) && layout.cellLooks[each] === layout.cellLooks[cell];
      if (owner !== CORRIDOR || !straight(cell)) return;
      const run = [cell];
      while (straight(run[run.length - 1]! + (alongX ? 1 : layout.columns))) run.push(run[run.length - 1]! + (alongX ? 1 : layout.columns));
      const look = layout.cellLooks[cell] ?? 0;
      if (run.length > (corridors.get(look)?.length ?? 0)) corridors.set(look, run);
    });
  for (const [look, run] of corridors) {
    const [from, to] = [centreOf(layout, run[0]!), centreOf(layout, run[run.length - 1]!)];
    if (!clear(from)) continue;
    person(false);
    stand(from);
    face(from, run.length > 1 ? to : [(from[0] ?? 0) + 1, from[1] ?? 0]);
    tilt(0.1);
    shot(`corridor · ${layout.looks[look]?.style} · ${run.length} cells`);
  }
  await closeViews();
}

/** First-person views of each style's kit pieces, where the published packs place them. */
async function closeViews() {
  const styles = [...new Set(layout.looks.map((each) => each.style))];
  const packs = new Map<StyleKey, ModulePack>();
  for (const style of styles) {
    const key = (manifest.styles as Partial<Record<StyleKey, string>>)[style];
    const answer = key ? await fetch(manifest.base + key).catch(() => null) : null;
    if (answer?.ok) packs.set(style, readModulePack(await answer.arrayBuffer()));
    else console.warn(`no ${style} pack, so no close views of its kit pieces`);
  }
  const placed = kitPlacements(layout, packs);
  for (const style of styles) {
    const ofStyle = (cell: number) => styleAt(layout, cell) === style;
    const frames = layout.frames.filter(([cell]) => ofStyle(cell));
    const owner = (cell: number) => layout.cells[cell] ?? CORRIDOR;
    frames.some(([cell, side]) =>
      close(wallPoint(layout, cell, side), inward(side), [3, 2.6, 2.2], -0.1, `${style} door, room face`, owner(cell)),
    );
    frames.some(([cell, side]) =>
      close(wallPoint(layout, cell, side), stepOf(side), [3, 2.6, 2.2], -0.1, `${style} door, corridor face`, CORRIDOR),
    );
    layout.pillars
      .filter(([x, y]) => ofStyle(cellAt(layout, x, y)))
      .some(([x, y]) =>
        [[1, 1], [-1, 1], [1, -1], [-1, -1]].some((out) =>
          close([x, y], out, [2, 1.6], -0.35, `${style} pillar`, owner(cellAt(layout, x, y))),
        ),
      );
    layout.torches
      .filter(([x, y]) => ofStyle(cellAt(layout, x, y)))
      .some(([x, y, , side]) =>
        close(ontoWall(layout, x, y, side), inward(side), [2, 1.6, 2.4], -0.25, `${style} sconce`, owner(cellAt(layout, x, y))),
      );
    const piece = (kind: string, away: number[], down: number, label: string) =>
      placed
        .filter(({ module, cell }) => module.startsWith(`${style}.${kind}`) && ofStyle(cell))
        .some(({ module, place, cell }) => {
          const out = kind === 'ceiling' || kind === 'floor' ? [0.8, 0.6] : turnAbout([0, 1, 0], place.turns);
          return close(place.origin, out, away, down, `${label}: ${module}`, owner(cell));
        });
    piece('wall.base', [2.6, 2.2, 3], -0.3, `${style} wall set`);
    piece('feature', [2, 1.6, 2.4], -0.05, `${style} feature`);
    piece('ceiling', [1.4, 1, 1.8], -1.0, `${style} ceiling piece`);
    piece('floor', [2, 1.6, 2.4], 0.7, `${style} floor piece`);
  }
}

function inward(side: number) {
  return stepOf(side).map((step) => -step);
}

steps.push({ eval: 'JSON.stringify(window.__packs)' });
const plan = `${out}/${patrol}-${number}.json`;
writeFileSync(plan, JSON.stringify({ url: `http://localhost:5173/?at=${patrol}`, size: [1280, 800], init, routes: { 'room.wasm': wasm }, steps }, null, 1));
writeFileSync(`${plan}.labels.json`, JSON.stringify(labels, null, 1));
console.log(`${plan}: ${layout.name}, ${layout.rooms.length} rooms, ${layout.looks.map((each) => each.style).join(' > ')}, ${shots} pictures`);
