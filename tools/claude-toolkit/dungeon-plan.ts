// Writes a webgpu-shot plan picturing one patrol's dungeon storey by storey, for a room module dungeon-qa-build.sh
// built (QA_NOFOES=1), served by this checkout's Vite: the page goes into the dungeon's run by its address (`&run=`),
// and each view stands the body on its storey's floor and the camera at an eye of its own (`__qaEye`). By default each
// room (up to [most rooms]) from its cell farthest from its middle, then each flight from its head and its foot, a
// gallery over its hall and the hall up at it, and the map on each storey and on all. `review` pictures each landmark,
// the exit and the portal arches, two more rooms, each look's longest corridor and close views of each style's kit
// pieces (from the published packs: behind a proxy, NODE_USE_ENV_PROXY=1). `<plan>.labels.json` names each picture.
//     node tools/claude-toolkit/dungeon-plan.ts <room-qa.wasm> <patrol id> <number> <out dir> [most | review] [port]
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import table from '../../content/dungeon/landmarks.json' with { type: 'json' };
import manifest from '../../content/dungeon/modules.json' with { type: 'json' };
import { cellAt, centreOf, isOpen, ontoWall, stepOf, wallPoint, wayTurns } from '../../client/src/game/dungeonCells.ts';
import { planeKits } from '../../client/src/game/dungeonDressing.ts';
import { placedLandmarks } from '../../client/src/game/dungeonLandmarks.ts';
import { askDungeon, CORRIDOR, STAIR, styleAt, type StyleKey, VOID } from '../../client/src/game/dungeonLayout.ts';
import { type ModulePack, readModulePack, turnAbout } from '../../client/src/game/dungeonModules.ts';
import { type StoreyPlane, storeyPlanes } from '../../client/src/game/dungeonStoreyPlanes.ts';
import { propPlansOf } from '../../client/src/game/dungeonPacks.test.ts';

const [wasm, patrol, numberText = '0', out, mostText = '99', port = '5173'] = process.argv.slice(2);
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
// Each storey as a dungeon of one storey, z from its floor: the cells' helpers read it as they read any.
const planes = storeyPlanes(layout);
const planeOf = (room: number) => planes[layout.rooms[room]?.storey ?? 0] ?? planes[0]!;

/** How near a stand may come to a solid or rock, so the body is not pushed off it, and a first person's eye over the
 *  feet; how far back and up a third person's eye stands (m). */
const [BODY_ROOM, EYE_M, BACK_M, OVER_M] = [0.45, 1.6, 2.2, 2.4];
// Every room module made is kept, in the game's worker and in the rooms' worker it starts, and acts on a word over
// the `qa` channel: a point [x, y, z] stands every body there (lifted to z) and heals it; {call, args} calls a hook.
const capture =
  'const Real=WebAssembly.Instance;self.__qa=[];const Made=function(module,imports){' +
  'const made=new Real(module,imports);if(made.exports.room_qa_move){self.__qa.push(made.exports);}return made;};' +
  "Made.prototype=Real.prototype;WebAssembly.Instance=Made;new BroadcastChannel('qa').onmessage=(word)=>{" +
  'const asked=word.data;self.__qa.forEach((room)=>{if(asked.call){room[asked.call](...asked.args);return;}' +
  'room.room_qa_move(asked[0],asked[1]);room.room_qa_encounter(1,asked[2],0);room.room_qa_encounter(0,0,0);});};' +
  "(()=>{const real=self.fetch;self.__packs={};self.fetch=function(what,...rest){const url=String(what&&what.url||what);if(url.endsWith('.modules'))self.__packs[url]=(self.__packs[url]||0)+1;return real.call(this,what,...rest);};})();";
const init =
  `(()=>{${capture}const Started=self.Worker;if(!Started)return;` +
  'self.Worker=function(url,options){const href=new URL(String(url),self.location.href).href;' +
  "if(!href.includes('roomWorker'))return new Started(url,options);" +
  `const head=${JSON.stringify(`(()=>{${capture}})();`)};` +
  "const script=new Blob([head+'\\nimport '+JSON.stringify(href)+';'],{type:'text/javascript'});" +
  'return new Started(URL.createObjectURL(script),options);};})();';
const sleep = (millis: number) => `await new Promise((done)=>setTimeout(done,${millis}));`;
// In at the run's way in, Leave offered there; every body's health held deep, as the Boss still stands.
const steps: object[] = [
  { waitFor: 'Leave', timeout: 900 },
  { frames: 20 },
  { eval: `(async()=>{new BroadcastChannel('qa').postMessage({call:'room_qa_encounter',args:[10,1,0]});${sleep(300)}})()` },
];
const bearing = ([fromX = 0, fromY = 0]: readonly number[], [toX = 0, toY = 0]: readonly number[]) =>
  Math.atan2(toX - fromX, -(toY - fromY));
/** Stands every body at (x, y) on the floor `z`, asking again until the game's body stands there. */
const stand = ([x = 0, y = 0]: readonly number[], z: number) =>
  steps.push(
    {
      eval:
        "(async()=>{const qa=new BroadcastChannel('qa');let at=null;for(let tries=0;tries<60;tries+=1){" +
        `qa.postMessage([${x},${y},${z}]);${sleep(1000)}at=self.__qaWhere();if(Math.hypot(at.x-${x},at.y-${y})<1)return at;}` +
        `throw new Error('never stood at ${x},${y}: '+JSON.stringify(at));})()`,
    },
    { frames: 6 },
  );
/** The camera at `from` on `plane`'s floor looking at `to`, `down` radians below level: in first person at the eye,
 *  in third behind and over it, as far back as its storey's floor stays open. */
const eye = (plane: StoreyPlane, from: readonly number[], to: readonly number[], down: number, third: boolean) => {
  const turn = bearing(from, to);
  const [backX, backY] = [-Math.sin(turn), Math.cos(turn)];
  let back = 0;
  while (third && back < BACK_M && clear(plane, [(from[0] ?? 0) + backX * (back + 0.25), (from[1] ?? 0) + backY * (back + 0.25)]))
    back += 0.25;
  const spot = [(from[0] ?? 0) + backX * back, (from[1] ?? 0) + backY * back, plane.floor + (third ? OVER_M : EYE_M)];
  const view = [...spot, (turn * 180) / Math.PI, ((down + (third ? 0.14 : 0)) * 180) / Math.PI];
  steps.push({ eval: `self.__qaEye(${JSON.stringify(view)})` }, { frames: 4 });
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
  return `${room?.name} · storey ${room?.storey ?? 0} · ${style} · ${room?.ceiling} · ${room?.width}x${room?.depth}`;
};
const cellsOf = (plane: StoreyPlane, owner: number) =>
  plane.layout.cells.flatMap((each, cell) => (each === owner ? [cell] : []));
const distance = (from: readonly number[], to: readonly number[]) =>
  Math.hypot((from[0] ?? 0) - (to[0] ?? 0), (from[1] ?? 0) - (to[1] ?? 0));
/** Whether a body may stand at a point of a storey: on its open floor (never a flight's or open air), clear of its
 *  solids. */
function clear(plane: StoreyPlane, [x = 0, y = 0]: readonly number[]) {
  const floor = (east: number, south: number) => {
    const cell = cellAt(plane.layout, x + east, y + south);
    const kind = plane.layout.cells[cell];
    return isOpen(plane.layout, cell) && kind !== VOID && kind !== STAIR;
  };
  return (
    x > 0 &&
    y > 0 &&
    [-BODY_ROOM, 0, BODY_ROOM].every((east) => [-BODY_ROOM, 0, BODY_ROOM].every((south) => floor(east, south))) &&
    plane.layout.boxes.every(
      ([west, north, eastX, southY]) =>
        x < west - BODY_ROOM || x > eastX + BODY_ROOM || y < north - BODY_ROOM || y > southY + BODY_ROOM,
    )
  );
}
/** Whether a storey's floor from a point most of the way to a target is open: no rock stands between them. */
function seen(plane: StoreyPlane, [fromX = 0, fromY = 0]: readonly number[], [toX = 0, toY = 0]: readonly number[]) {
  return Array.from({ length: 20 }, (_unused, step) => (step * 0.9) / 19).every((share) =>
    isOpen(plane.layout, cellAt(plane.layout, fromX + (toX - fromX) * share, fromY + (toY - fromY) * share)),
  );
}
/** The first clear point `away` from a target along `out` on a cell of `owner` (a room's number, or a corridor) that
 *  sees it, trying the next distance as it must. */
function standOff(plane: StoreyPlane, target: readonly number[], out: readonly number[], away: readonly number[], owner: number) {
  for (const metres of away) {
    const point = [(target[0] ?? 0) + (out[0] ?? 0) * metres, (target[1] ?? 0) + (out[1] ?? 0) * metres];
    const ours = plane.layout.cells[cellAt(plane.layout, point[0] ?? 0, point[1] ?? 0)] === owner;
    if (ours && clear(plane, point) && seen(plane, point, target)) return point;
  }
  return null;
}

/** A room from the cell farthest from what it faces, in third person, so the player stands in it for scale. */
function overview(index: number, toward: readonly number[] | null, label: string) {
  const [room, plane] = [layout.rooms[index], planeOf(index)];
  if (!room) return;
  const middle = toward ?? [(room.x + room.width / 2) * layout.cell, (room.y + room.depth / 2) * layout.cell];
  // A doorway's cell would put the eye out in the corridor, and rock inside a room can stand between a cell and it.
  const doorways = new Set(plane.layout.frames.map(([cell]) => cell));
  const open = cellsOf(plane, index).filter((cell) => clear(plane, centreOf(plane.layout, cell)));
  const prefer = (cells: number[], keep: (cell: number) => boolean) => (cells.some(keep) ? cells.filter(keep) : cells);
  const own = prefer(prefer(open, (cell) => seen(plane, centreOf(plane.layout, cell), middle)), (cell) => !doorways.has(cell));
  const far = (cell: number) => distance(centreOf(plane.layout, cell), middle);
  const spot = own.reduce((best, cell) => (far(cell) > far(best) ? cell : best), own[0] ?? 0);
  const from = centreOf(plane.layout, spot);
  stand(from, plane.floor);
  eye(plane, from, far(spot) < 0.5 ? [from[0] ?? 0, (from[1] ?? 0) + 1] : middle, review ? 0.15 : 0, true);
  shot(label);
}

/** A first-person view of `target` from `away` metres along `out` on a cell of `owner`, the eye pitched to `down`. */
function close(plane: StoreyPlane, target: readonly number[], out: readonly number[], away: readonly number[], down: number, label: string, owner: number) {
  const from = standOff(plane, target, out, away, owner);
  if (!from) return false;
  stand(from, plane.floor);
  eye(plane, from, target, down, false);
  shot(label);
  return true;
}

/** Each flight from its head looking down it and from its foot looking up it, and a gallery over its hall and the
 *  hall looking up at it, each in first person and in third. */
function storeyViews() {
  const both = (plane: StoreyPlane, from: readonly number[], to: readonly number[], down: number, label: string) => {
    stand(from, plane.floor);
    for (const third of [false, true]) {
      eye(plane, from, to, down, third);
      shot(`${label}, ${third ? 'third' : 'first'} person`);
    }
  };
  (layout.stairs ?? []).slice(0, 3).forEach((stair, flight) => {
    const [upper, lower] = [planes[stair.upper], planes[stair.upper + 1]];
    if (!upper || !lower) return;
    const [head, foot] = [stair.cells[0] ?? 0, stair.cells[stair.cells.length - 1] ?? 0];
    both(upper, centreOf(upper.layout, stair.top), centreOf(upper.layout, foot), 0.5, `flight ${flight} from its head`);
    both(lower, centreOf(lower.layout, stair.bottom), centreOf(lower.layout, head), -0.35, `flight ${flight} from its foot`);
  });
  const cells = layout.columns * layout.rows;
  const first = layout.cells.findIndex((kind) => kind === VOID);
  const [over, under] = [planes[Math.floor(first / cells)], planes[Math.floor(first / cells) + 1]];
  if (first < 0 || !over || !under) return;
  // The open air's middle, and the gallery's cell beside the air nearest it, looking across the air and down into it.
  const air = over.layout.cells.flatMap((kind, cell) => (kind === VOID ? [cell] : []));
  const middle = [0, 1].map((axis) => air.reduce((sum, cell) => sum + (centreOf(over.layout, cell)[axis] ?? 0), 0) / air.length);
  const besideAir = (cell: number) =>
    [1, -1, layout.columns, -layout.columns].some((step) => over.layout.cells[cell + step] === VOID);
  const gallery = over.layout.cells
    .flatMap((kind, cell) => (kind !== VOID && besideAir(cell) && clear(over, centreOf(over.layout, cell)) ? [cell] : []))
    .sort((one, other) => distance(centreOf(over.layout, one), middle) - distance(centreOf(over.layout, other), middle))[0];
  if (gallery !== undefined) both(over, centreOf(over.layout, gallery), middle, 0.45, 'the gallery over its hall');
  // From the hall's floor farthest from the air, looking up at the gallery's floor over its middle.
  const hall = under.layout.cells[air[0] ?? 0] ?? CORRIDOR;
  const floor = cellsOf(under, hall).filter((cell) => clear(under, centreOf(under.layout, cell)));
  const away = (cell: number) => distance(centreOf(under.layout, cell), middle);
  const far = floor.sort((one, other) => away(other) - away(one))[0];
  const rise = over.floor + 1 - (under.floor + EYE_M);
  if (far !== undefined) both(under, centreOf(under.layout, far), middle, -Math.atan2(rise, away(far)), 'the hall up at its gallery');
}

/** The map from the way in: at rest on the top storey, each storey under it, then all of them. */
function mapViews() {
  const top = planes[0]!;
  stand([layout.arrival.x, layout.arrival.y], top.floor);
  steps.push({ eval: 'self.__qaEye(null)' }, { frames: 3 }, { key: 'n' }, { frames: 12 });
  shot('the map, the top storey');
  for (let storey = 1; storey < planes.length; storey++) {
    steps.push({ key: '[' }, { frames: 12 });
    shot(`the map, storey ${storey}`);
  }
  steps.push({ key: 'l' }, { frames: 12 });
  shot('the map, every storey');
  steps.push({ key: 'n' }, { frames: 3 });
}

if (!review) {
  layout.rooms.slice(0, Number(mostText)).forEach((_room, index) => overview(index, null, roomLabel(index)));
  storeyViews();
  mapViews();
} else {
  const chosen = new Set<number>();
  for (const plane of planes) {
    const middleOf = (cells: readonly number[]) =>
      [0, 1].map((axis) => cells.reduce((sum, cell) => sum + (centreOf(plane.layout, cell)[axis] ?? 0), 0) / cells.length);
    for (const landmark of placedLandmarks(plane.layout)) {
      const index = plane.layout.cells[landmark.cells[0] ?? 0] ?? CORRIDOR;
      const middle = middleOf(landmark.cells);
      chosen.add(index);
      overview(index, middle, `${landmark.module} in ${roomLabel(index)}`);
      // A wall piece is seen from the side it faces first: modelled facing south, turned as it is laid.
      const facing = turnAbout([0, 1, 0], landmark.place.turns).slice(0, 2);
      const wall = table.landmarks.find((entry) => entry.module === landmark.module)?.wall ?? false;
      const sides = [...(wall ? [facing] : []), ...[[1, 0], [0, 1], [-1, 0], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]]];
      const sizes = landmark.cells.length > 1 ? [5.5, 5, 4.5, 6, 4] : [3.5, 3, 4, 2.6];
      sides.some((out) => close(plane, middle, out, sizes, 0.45, `${landmark.module} close`, index));
    }
  }
  const archOf = (plane: StoreyPlane | undefined, door: { x: number; y: number }, side: number, owner: number, label: string) => {
    if (!plane) return;
    const arch = [door.x, door.y];
    const from = standOff(plane, arch, inward(side), [5, 4.5, 4, 3.5, 3], owner);
    if (from) {
      stand(from, plane.floor);
      eye(plane, from, arch, 0.05, true);
      shot(`${label} arch: ${roomLabel(owner)}`);
    }
    close(plane, arch, inward(side), [2.6, 2.2, 3], -0.15, `${label} arch close`, owner);
  };
  // A storey's own plane stands its exit door and portal at their wall; the others' off the grid.
  const exitPlane = planes.find((plane) => plane.exit);
  const portalPlane = planes.find((plane) => plane.portal);
  archOf(exitPlane, exitPlane?.layout.exitDoor ?? layout.exitDoor, layout.wayIn.side, layout.wayIn.room, 'exit');
  archOf(portalPlane, portalPlane?.layout.portal ?? layout.portal, layout.portal.side, layout.end, 'portal');
  chosen.add(layout.wayIn.room).add(layout.end);
  // Two more rooms: a look or a ceiling not pictured yet first, then the largest.
  const pictured = (index: number, key: (room: (typeof layout.rooms)[number]) => string) =>
    [...chosen].some((other) => layout.rooms[other] && key(layout.rooms[other]) === key(layout.rooms[index] ?? layout.rooms[0]!));
  const rank = (index: number) => {
    const room = layout.rooms[index];
    if (!room) return -1;
    return (pictured(index, (each) => `${each.look}`) ? 0 : 200) + (pictured(index, (each) => each.ceiling) ? 0 : 100) + room.width * room.depth;
  };
  for (let more = 0; more < 2; more++) {
    const left = layout.rooms.map((_room, index) => index).filter((index) => !chosen.has(index));
    const best = left.sort((first, second) => rank(second) - rank(first))[0];
    if (best === undefined) break;
    chosen.add(best);
    overview(best, null, roomLabel(best));
  }
  // Each look's longest straight corridor on any storey, from one end along it.
  const corridors = new Map<number, { plane: StoreyPlane; run: number[] }>();
  for (const plane of planes)
    for (const alongX of [true, false])
      plane.layout.cells.forEach((owner, cell) => {
        const looks = plane.layout.cellLooks;
        const straight = (each: number) =>
          plane.layout.cells[each] === CORRIDOR && wayTurns(plane.layout, each) === (alongX ? 0 : 1) && looks[each] === looks[cell];
        if (owner !== CORRIDOR || !straight(cell)) return;
        const run = [cell];
        while (straight(run[run.length - 1]! + (alongX ? 1 : layout.columns))) run.push(run[run.length - 1]! + (alongX ? 1 : layout.columns));
        const look = looks[cell] ?? 0;
        if (run.length > (corridors.get(look)?.run.length ?? 0)) corridors.set(look, { plane, run });
      });
  for (const [look, { plane, run }] of corridors) {
    const [from, to] = [centreOf(plane.layout, run[0]!), centreOf(plane.layout, run[run.length - 1]!)];
    if (!clear(plane, from)) continue;
    stand(from, plane.floor);
    eye(plane, from, run.length > 1 ? to : [(from[0] ?? 0) + 1, from[1] ?? 0], 0.1, true);
    shot(`corridor · storey ${plane.storey} · ${layout.looks[look]?.style} · ${run.length} cells`);
  }
  await closeViews();
}

/** First-person views of each style's kit pieces, where the published packs place them, storey by storey. */
async function closeViews() {
  const styles = [...new Set(layout.looks.map((each) => each.style))];
  const packs = new Map<StyleKey, ModulePack>();
  for (const style of styles) {
    const key = (manifest.styles as Partial<Record<StyleKey, string>>)[style];
    const answer = key ? await fetch(manifest.base + key).catch(() => null) : null;
    if (answer?.ok) packs.set(style, readModulePack(await answer.arrayBuffer()));
    else console.warn(`no ${style} pack, so no close views of its kit pieces`);
  }
  const kits = planeKits(layout, packs, (plane) => propPlansOf(plane.layout));
  for (const style of styles) {
    const done = new Set<string>();
    // Each kind of piece pictured once, on the first storey that has it.
    const once = (kind: string, view: () => boolean) => !done.has(kind) && view() && done.add(kind);
    for (const { plane, placed } of kits) {
      const within = plane.layout;
      const ofStyle = (cell: number) => styleAt(within, cell) === style;
      const owner = (cell: number) => within.cells[cell] ?? CORRIDOR;
      const frames = within.frames.filter(([cell]) => ofStyle(cell));
      once('door in', () => frames.some(([cell, side]) => close(plane, wallPoint(within, cell, side), inward(side), [3, 2.6, 2.2], -0.1, `${style} door, room face`, owner(cell))));
      once('door out', () => frames.some(([cell, side]) => close(plane, wallPoint(within, cell, side), stepOf(side), [3, 2.6, 2.2], -0.1, `${style} door, corridor face`, CORRIDOR)));
      once('pillar', () =>
        within.pillars
          .filter(([x, y]) => ofStyle(cellAt(within, x, y)))
          .some(([x, y]) => [[1, 1], [-1, 1], [1, -1], [-1, -1]].some((out) => close(plane, [x, y], out, [2, 1.6], -0.35, `${style} pillar`, owner(cellAt(within, x, y))))),
      );
      once('sconce', () =>
        within.torches
          .filter(([x, y]) => ofStyle(cellAt(within, x, y)))
          .some(([x, y, , side]) => close(plane, ontoWall(within, x, y, side), inward(side), [2, 1.6, 2.4], -0.25, `${style} sconce`, owner(cellAt(within, x, y)))),
      );
      const piece = (kind: string, away: number[], down: number, label: string) =>
        once(kind, () =>
          placed
            .filter(({ module, cell }) => module.startsWith(`${style}.${kind}`) && ofStyle(cell))
            .some(({ module, place, cell }) => {
              const out = kind === 'ceiling' || kind === 'floor' ? [0.8, 0.6] : turnAbout([0, 1, 0], place.turns);
              return close(plane, place.origin, out, away, down, `${label}: ${module}`, owner(cell));
            }),
        );
      piece('wall.base', [2.6, 2.2, 3], -0.3, `${style} wall set`);
      piece('feature', [2, 1.6, 2.4], -0.05, `${style} feature`);
      piece('ceiling', [1.4, 1, 1.8], -1.0, `${style} ceiling piece`);
      piece('floor', [2, 1.6, 2.4], 0.7, `${style} floor piece`);
    }
  }
}

function inward(side: number) {
  return stepOf(side).map((step) => -step);
}

steps.push({ eval: 'self.__qaEye(null)' }, { eval: 'JSON.stringify(self.__packs)' });
const plan = `${out}/${patrol}-${number}.json`;
const url = `http://localhost:${port}/?at=1&spawn=&run=node-${patrol}--elite--dungeon-${number}--run-qaqa0001`;
writeFileSync(plan, JSON.stringify({ url, size: [1280, 800], init, routes: { 'room.wasm': wasm }, anyPort: port !== '5173', steps }, null, 1));
writeFileSync(`${plan}.labels.json`, JSON.stringify(labels, null, 1));
const storeys = `${planes.length} storeys, ${layout.stairs?.length ?? 0} flights`;
console.log(`${plan}: ${layout.name}, ${layout.rooms.length} rooms, ${storeys}, ${layout.looks.map((each) => each.style).join(' > ')}, ${shots} pictures`);
