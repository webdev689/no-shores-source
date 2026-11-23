// Writes a webgpu-shot plan that pictures one Elite Dungeon's encounters: each seal from its doorway and from its first
// piece, and the Court's anchors. For a room module dungeon-qa-build.sh built (QA_NOFOES=1 keeps a headless player
// alive), served by a development page (`npx vite --port 5173` in a worktree of its own, so edits do not reload it):
// its address goes into the run with `&run=` (runAsked.ts) and `&spawn=` opens the QA hooks (qaViews.ts). A headless
// frame takes some 20 s, so each picture waits three, and the first comes after the 150 s the run takes to load.
//
//     node tools/claude-toolkit/encounter-plan.ts <room-qa.wasm> <elite place> <out dir> <plan.json> [port]
//
// A port other than 5173 (where another checkout's Vite holds it) gives the plan "anyPort". Each move is asked again
// until the page's own body (`__qaWhere`) stands within a metre of its point, and fails the run if it never does, so a
// picture never shows where the body was before.
import { readFileSync, writeFileSync } from 'node:fs';
import { askLayout } from '../../client/src/game/dungeonLayout.ts';

const [wasm, place, out, planPath, port = '5173'] = process.argv.slice(2);
if (!wasm || !place || !out || !planPath) throw new Error('name the room-qa.wasm, the Elite Dungeon, a folder, a plan');
const layout = askLayout(await WebAssembly.compile(readFileSync(wasm)), { place, name: place });
const plan = layout.encounters;
if (!plan) throw new Error(`${place} lays no encounters`);
type Point = readonly number[];
// Every room module made is kept, in the game's worker (its prediction) and in the rooms' worker the game's worker
// starts (the room itself, which judges where the body stands), and each worker moves its own on a word over the `qa`
// channel, so a step can stand the body anywhere. The rooms' worker is started from a script that runs the same
// capture first and then imports the worker's own.
const capture =
  'const Real=WebAssembly.Instance;self.__qa=[];const Made=function(module,imports){' +
  'const made=new Real(module,imports);if(made.exports.room_qa_move){self.__qa.push(made.exports);}return made;};' +
  'Made.prototype=Real.prototype;WebAssembly.Instance=Made;' +
  "new BroadcastChannel('qa').onmessage=(word)=>self.__qa.forEach((room)=>room.room_qa_move(word.data[0],word.data[1]));";
const init =
  `(()=>{${capture}const Started=self.Worker;if(!Started)return;` +
  'self.Worker=function(url,options){const href=new URL(String(url),self.location.href).href;' +
  "if(!href.includes('roomWorker'))return new Started(url,options);" +
  `const head=${JSON.stringify(`(()=>{${capture}})();`)};` +
  "const script=new Blob([head+'\\nimport '+JSON.stringify(href)+';'],{type:'text/javascript'});" +
  'return new Started(URL.createObjectURL(script),options);};})();';
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
    {
      eval:
        `(async()=>{const qa=new BroadcastChannel('qa');let at=null;for(let tries=0;tries<60;tries+=1){` +
        `qa.postMessage([${east},${south}]);await new Promise((done)=>setTimeout(done,1000));at=self.__qaWhere();` +
        `if(Math.hypot(at.x-${east},at.y-${south})<1)return at;}` +
        `throw new Error('never stood at ${east},${south}: '+JSON.stringify(at));})()`,
    },
    { frames: 3 },
    { eval: `self.__qaLook([${east},${south},${bearing(stand, facing)},'${camera}'])` },
    { frames: 3 },
    { shot: `${out}/${String(shot++).padStart(2, '0')}_${name}.png` },
  );
};
const KINDS = ['', 'litany', 'weighing', 'ascent', 'holdfast'];
/** The middle of the seal's room's cell clear of its pads by a metre that stands farthest from its first doorway. */
function floorAcross(seal: NonNullable<typeof plan>['seals'][number]): Point | null {
  const [doorX = 0, doorY = 0] = seal.doors[0] ?? [];
  const clear = ([x, y]: Point) =>
    seal.pads.every(
      ([minX, minY, maxX, maxY]) =>
        (x ?? 0) < minX - 1 || (x ?? 0) > maxX + 1 || (y ?? 0) < minY - 1 || (y ?? 0) > maxY + 1,
    );
  const cells = layout.cells.flatMap((room, cell) =>
    room === seal.room
      ? [[((cell % layout.columns) + 0.5) * layout.cell, (Math.floor(cell / layout.columns) + 0.5) * layout.cell]]
      : [],
  );
  const far = (point: Point) => Math.hypot((point[0] ?? 0) - doorX, (point[1] ?? 0) - doorY);
  return cells.filter(clear).sort((a, b) => far(b) - far(a))[0] ?? null;
}
for (const seal of plan.seals) {
  const kind = KINDS[seal.kind] ?? 'seal';
  const middle = middleOf(seal.pieces);
  // Two metres into the room from its doorway, so the doorway's arch never stands between the camera and the seal.
  const door = seal.doors[0] ?? [(middle[0] ?? 0) + 4, middle[1] ?? 0];
  const inward = Math.hypot((middle[0] ?? 0) - (door[0] ?? 0), (middle[1] ?? 0) - (door[1] ?? 0)) || 1;
  // An Ascent's first pad reaches back to its doorway, so it is seen from the doorway itself and from across the room;
  // any other's, two metres in unless that is on a piece (a rune stepped there would count).
  const step = seal.kind === 3 ? 0 : Math.min(2, inward / 2) / inward;
  const inside = [
    (door[0] ?? 0) + ((middle[0] ?? 0) - (door[0] ?? 0)) * step,
    (door[1] ?? 0) + ((middle[1] ?? 0) - (door[1] ?? 0)) * step,
  ];
  const onPiece = seal.pieces.some((piece) => Math.hypot((piece[0] ?? 0) - (inside[0] ?? 0), (piece[1] ?? 0) - (inside[1] ?? 0)) < 1.5);
  picture(onPiece ? door : inside, middle, 'third,8,45', `${kind}_from_door`);
  const first = seal.pieces[0];
  // An Ascent's one piece is the stone on its top pad, which a move on the floor never reaches: the climb is seen
  // instead from the floor across the room, from the cell of its room clear of every pad farthest from its doorway.
  const across = seal.kind === 3 ? floorAcross(seal) : null;
  if (across) picture(across, middle, 'third,5,15', `${kind}_across`);
  // Beside its first piece, a step and a half back toward its doorway, looking over it toward the rest.
  else if (first) {
    const back = Math.hypot((door[0] ?? 0) - (first[0] ?? 0), (door[1] ?? 0) - (first[1] ?? 0)) || 1;
    const share = Math.min(1.5, back) / back;
    const beside = [
      (first[0] ?? 0) + ((door[0] ?? 0) - (first[0] ?? 0)) * share,
      (first[1] ?? 0) + ((door[1] ?? 0) - (first[1] ?? 0)) * share,
    ];
    picture(beside, first, 'third,6,50', `${kind}_by_first`);
  }
}
const anchor = plan.anchors[0];
// From the anchors' middle, off every wall they keep to, looking at the first.
if (anchor) picture(middleOf(plan.anchors), anchor, 'third,8,45', 'court_anchors');
const url = `http://localhost:${port}/?at=1&spawn=&run=node-${place}--run-qaqa0001&view=third,7`;
const anyPort = port !== '5173';
writeFileSync(
  planPath,
  JSON.stringify({ url, routes: { 'room.wasm': wasm }, steps, init, size: [1280, 720], anyPort }, null, 1),
);
console.log(JSON.stringify(plan.seals.map((seal) => [KINDS[seal.kind], seal.pieces.length, seal.pads.length])));
