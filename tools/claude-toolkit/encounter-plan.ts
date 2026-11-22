// Writes a webgpu-shot plan that pictures one Elite Dungeon's encounters: each seal from its doorway and from its first
// piece, and the Court's anchors. For a room module dungeon-qa-build.sh built (QA_NOFOES=1 keeps a headless player
// alive), served by a development page (`npx vite --port 5173` in a worktree of its own, so edits do not reload it):
// its address goes into the run with `&run=` (runAsked.ts) and `&spawn=` opens the QA hooks (qaViews.ts). A headless
// frame takes some 20 s, so each picture waits three, and the first comes after the 150 s the run takes to load.
//
//     node tools/claude-toolkit/encounter-plan.ts <room-qa.wasm> <elite place> <out dir> <plan.json>
import { readFileSync, writeFileSync } from 'node:fs';
import { askLayout } from '../../client/src/game/dungeonLayout.ts';

const [wasm, place, out, planPath] = process.argv.slice(2);
if (!wasm || !place || !out || !planPath) throw new Error('name the room-qa.wasm, the Elite Dungeon, a folder, a plan');
const layout = askLayout(await WebAssembly.compile(readFileSync(wasm)), { place, name: place });
const plan = layout.encounters;
if (!plan) throw new Error(`${place} lays no encounters`);
type Point = readonly number[];
// The room module the page makes in the game's worker is kept, so a step can stand the body anywhere.
const init =
  '(()=>{const Real=WebAssembly.Instance;self.__qa=[];const Made=function(module,imports){' +
  'const made=new Real(module,imports);if(made.exports.room_qa_move){self.__qa.push(made.exports);}return made;};' +
  'Made.prototype=Real.prototype;WebAssembly.Instance=Made;})();';
const steps: object[] = [{ wait: 150 }, { frames: 3 }, { shot: `${out}/00_arrived.png` }];
const bearing = ([fromX = 0, fromY = 0]: Point, [toX = 0, toY = 0]: Point) =>
  (Math.atan2(toX - fromX, -(toY - fromY)) * 180) / Math.PI;
const middleOf = (points: readonly Point[]): Point => [
  points.reduce((sum, point) => sum + (point[0] ?? 0), 0) / points.length,
  points.reduce((sum, point) => sum + (point[1] ?? 0), 0) / points.length,
];
let shot = 1;
const picture = (stand: Point, facing: Point, camera: string, name: string) => {
  const [east, south] = stand;
  steps.push(
    { eval: `self.__qa.forEach((room)=>room.room_qa_move(${east},${south}));'moved'` },
    { frames: 3 },
    { eval: `self.__qaLook([${east},${south},${bearing(stand, facing)},'${camera}'])` },
    { frames: 3 },
    { shot: `${out}/${String(shot++).padStart(2, '0')}_${name}.png` },
  );
};
const KINDS = ['', 'litany', 'weighing', 'ascent', 'holdfast'];
for (const seal of plan.seals) {
  const kind = KINDS[seal.kind] ?? 'seal';
  const middle = middleOf(seal.pieces);
  picture(seal.doors[0] ?? [(middle[0] ?? 0) + 4, middle[1] ?? 0], middle, 'third,7,30', `${kind}_from_door`);
  const first = seal.pieces[0];
  if (first) picture(first, middle, 'third,5,20', `${kind}_on_first`);
}
const anchor = plan.anchors[0];
if (anchor) picture(anchor, middleOf(plan.anchors), 'third,8,35', 'court_anchors');
const url = `http://localhost:5173/?at=1&spawn=&run=node-${place}--run-qaqa0001&view=third,7`;
writeFileSync(planPath, JSON.stringify({ url, routes: { 'room.wasm': wasm }, steps, init, size: [1280, 720] }, null, 1));
console.log(JSON.stringify(plan.seals.map((seal) => [KINDS[seal.kind], seal.pieces.length, seal.pads.length])));
