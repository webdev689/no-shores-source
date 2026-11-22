// Writes a webgpu-shot plan that pictures every room of one patrol's dungeon, for a room.wasm dungeon-qa-build.sh
// built: it joins before the dungeon's entrance and enters, then stands in each room's cell farthest from its middle
// and faces the middle, so one page load pictures the whole dungeon. Beside the plan, `<plan>.labels.json` names each
// picture's room, look, ceiling and size. Run from the repo root, with the built page served on port 5173.
//
//     node tools/claude-toolkit/dungeon-plan.ts <room-qa.wasm> <patrol id> <number> <out dir> [most rooms]
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { askDungeon } from '../../client/src/game/dungeonLayout.ts';

const [wasm, patrol, numberText = '0', out, mostText = '99'] = process.argv.slice(2);
if (!wasm || !patrol || !out) throw new Error('name the room-qa.wasm, the patrol, its dungeon number and a folder');
const number = Number(numberText);
const land = 'content/world/land';
const nodes: { id: string; name: string }[] = readdirSync(land).flatMap(
  (file) => JSON.parse(readFileSync(`${land}/${file}`, 'utf8')).nodes ?? [],
);
const patrolName = nodes.find((node) => node.id === patrol)?.name;
if (!patrolName) throw new Error(`no patrol ${patrol} in ${land}`);
const layout = askDungeon(await WebAssembly.compile(readFileSync(wasm)), patrol, patrolName, number);

/** How far the view turns for each pixel the mouse moves, as the game's player.ts turns it. */
const MOUSE_TURN = 0.0025;
const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
const bearing = ([fromX, fromY]: number[], [toX, toY]: number[]) =>
  Math.atan2((toX ?? 0) - (fromX ?? 0), -((toY ?? 0) - (fromY ?? 0)));
// The canvas reads as pointer-locked, so mousemove turns the view; each room module made is told its entrance.
const init =
  "Object.defineProperty(Document.prototype,'pointerLockElement',{configurable:true,get(){return document.getElementById('game');}});" +
  'HTMLCanvasElement.prototype.requestPointerLock=function(){return Promise.resolve();};' +
  '(()=>{const Real=WebAssembly.Instance;window.__qa=[];const Made=function(m,i){const made=new Real(m,i);' +
  `if(made.exports.room_qa_entrance){made.exports.room_qa_entrance(${number});window.__qa.push(made.exports);}return made;};` +
  'Made.prototype=Real.prototype;WebAssembly.Instance=Made;})();';
const steps: object[] = [
  { waitFor: `Enter ${layout.name}`, timeout: 600 },
  { frames: 3 },
  { key: 'e' },
  { wait: 8 },
  { frames: 20 },
];
let yaw = layout.arrival.bearing;
const look = (pixels: number, axis: 'movementX' | 'movementY') =>
  steps.push({ eval: `window.dispatchEvent(new MouseEvent('mousemove',{${axis}:${pixels}}));'${axis} ${pixels}'` }, { frames: 6 });
mkdirSync(`${out}/shots`, { recursive: true });
const labels: Record<string, string> = {};
layout.rooms.slice(0, Number(mostText)).forEach((room, index) => {
  const middle = [(room.x + room.width / 2) * layout.cell, (room.y + room.depth / 2) * layout.cell];
  const centre = (cell: number) => [
    ((cell % layout.columns) + 0.5) * layout.cell,
    (Math.floor(cell / layout.columns) + 0.5) * layout.cell,
  ];
  const own = layout.cells.flatMap((owner, cell) => (owner === index ? [cell] : []));
  const far = (cell: number) => Math.hypot((centre(cell)[0] ?? 0) - (middle[0] ?? 0), (centre(cell)[1] ?? 0) - (middle[1] ?? 0));
  const stand = own.reduce((best, cell) => (far(cell) > far(best) ? cell : best), own[0] ?? 0);
  const [x = 0, y = 0] = centre(stand);
  steps.push({ eval: `window.__qa.forEach((room)=>room.room_qa_move(${x},${y}));'moved'` }, { frames: 16 });
  const pixels = Math.round(wrap((far(stand) < 0.5 ? yaw + Math.PI : bearing([x, y], middle)) - yaw) / MOUSE_TURN);
  yaw += pixels * MOUSE_TURN;
  look(pixels, 'movementX');
  look(-50, 'movementY');
  const shot = `${out}/shots/${patrol}-${number}-${String(index).padStart(2, '0')}.png`;
  steps.push({ shot });
  look(50, 'movementY');
  const style = layout.looks[room.look]?.style ?? '?';
  labels[shot] = `${room.name} · ${style} · ${room.ceiling} · ${room.width}x${room.depth}`;
});
const plan = `${out}/${patrol}-${number}.json`;
writeFileSync(plan, JSON.stringify({ url: `http://localhost:5173/?at=${patrol}`, size: [1280, 800], init, routes: { 'room.wasm': wasm }, steps }, null, 1));
writeFileSync(`${plan}.labels.json`, JSON.stringify(labels, null, 1));
console.log(`${plan}: ${layout.name}, ${layout.rooms.length} rooms, ${layout.looks.map((each) => each.style).join(' > ')}`);
