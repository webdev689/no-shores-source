import { FirstPerson } from '../firstperson/firstPerson.ts';
import type { Colours } from '../forge/compose.ts';
import { type DyeTable, PaletteSnap } from '../forge/dyes.ts';
import type { ForgeLooks } from '../forge/looks.ts';
import type { HairColours, RaceSkins } from '../forge/skins.ts';
import { ForgeStore } from '../forge/store.ts';
import type { Gpu } from '../gpu.ts';
import { wheelNotches } from '../overworld/overworldInput.ts';
import { type CardAt, Cards } from '../player/cards.ts';
import { plainDress } from '../player/dressing.ts';
import type { Placed } from '../player/figures.ts';
import { type Action, Input, type InputFrame } from '../player/input.ts';
import { newPlayer } from '../player/player.ts';
import { Walker } from '../player/walker.ts';
import { startMovementRules } from '../rules/movementRules.ts';
import { startLandWorker } from '../terrain/landClient.ts';
import { FigureView } from './figureView.ts';
import { arriving, type Flow, type Happening, next } from './flow.ts';
import { Foot, type FootContext } from './foot.ts';
import { Hud } from './hud.ts';
import { KIND_WORDS, type Standing } from './hudLaw.ts';
import { type Landmass, openLandmass, terrainOf } from './landmass.ts';
import { landDrawers, loadCityAssets } from './landDrawers.ts';
import { shipMesh } from './meshes.ts';
import { MeshView, type Placing } from './meshView.ts';
import { arrivalFacing, bearingTo } from './nodes.ts';
import { roomsFrom } from './rooms.ts';
import { type Drawer, GameScene } from './scene.ts';
import { Sea } from './sea.ts';
import { continentToOpen, offshore } from './seaLaw.ts';
import { loadWorld, type NodeInfo } from './worldData.ts';

/** Where every player arrives: Overlook's social space, on Saltmere. */
const FIRST_CONTINENT = 'continent-1';
const FIRST_NODE = 'overlook-social';
/** The islands' names the owner has given, by continent. */
const ISLANDS: Readonly<Record<string, string>> = { 'continent-1': 'Saltmere' };
/** The region every island lies in. */
const REGION = 'The Pale Expanse';
/** The veil stays down until the exact ground round the player has come, or this long. */
const GROUND_WAIT_S = 20;
/** How often the sea looks for another continent's coast nearby, seconds. */
const CHART_EVERY_S = 1;

const HINTS = {
  foot: [
    'Click to look round · W A S D move · Shift run',
    'Space jump · C crouch · Z weapon · Q cast',
    'Wheel: third person · M menu',
  ],
  dead: ['Enter or Respawn: back at the nearest spawn'],
  sea: ['Click the sea to sail · Drag to look · Wheel zoom', '[ ] pace · L view landings · M menu'],
  landing: ['Click a mark to choose it', 'Click it again or Enter to land · Esc back to sea'],
} as const;

/** The forge's figures and the first person's hands, read from the forge's published renders. */
async function openForge(gpu: Gpu, figures: FigureView): Promise<{ forge: Cards; firstPerson: FirstPerson }> {
  const store = await ForgeStore.open();
  const [looks, skins, hair, dyes] = await Promise.all([
    store.table<ForgeLooks>('looks'),
    store.table<RaceSkins>('skins'),
    store.table<HairColours>('hair'),
    store.table<DyeTable>('dyes'),
  ]);
  const colours: Colours = { skins, hair, snap: new PaletteSnap(dyes.palette) };
  return { forge: new Cards(figures, store, looks, colours, dyes), firstPerson: await FirstPerson.open(gpu, store) };
}

/** The words under a place's name: its kind, and its island's name where it has one. */
function placeWords(node: NodeInfo): string {
  const island = ISLANDS[node.continent];
  return island ? `${KIND_WORDS[node.kind]} · ${island}` : KIND_WORDS[node.kind];
}

/**
 * The game: the player arrives in Overlook's social space, plays on foot, returns to their ship, sails the sea, views
 * an island's side and lands at a node, each through a veil while the place loads. This wires the pieces and keeps
 * the flow; each mode is its own module.
 */
export async function startGame(gpu: Gpu, canvas: HTMLCanvasElement, hudRoot: HTMLElement): Promise<void> {
  const hud = new Hud(hudRoot);
  let flow: Flow = arriving(FIRST_NODE, 'Overlook');
  if (flow.mode === 'loading') hud.veil(flow.words);
  const base = import.meta.env.BASE_URL;
  const rooms = roomsFrom(new URLSearchParams(location.search).get('room'));
  const land = startLandWorker();
  const scene = new GameScene(gpu);
  const figureView = new FigureView(gpu);
  const meshes = new MeshView(gpu);
  const ship = meshes.mesh(shipMesh());
  const [world, rmbText, movement, { forge, firstPerson }] = await Promise.all([
    loadWorld(base),
    fetch(`${base}world/rmb/index.json`)
      .then((answer) => (answer.ok ? answer.text() : null))
      .catch(() => null),
    fetch(`${base}movement.wasm`)
      .then((answer) => {
        if (!answer.ok) throw new Error(`movement.wasm: ${answer.status}`);
        return answer.arrayBuffer();
      })
      .then(startMovementRules),
    openForge(gpu, figureView),
  ]);
  const { continents } = world;
  const cityAssets = loadCityAssets(base);
  const biomeOf = (id: string) => continents.find((continent) => continent.id === id)?.climate ?? null;
  const drawersOn = (opened: Landmass) => landDrawers(gpu, opened, scene, biomeOf(opened.id), base, cityAssets);
  let landmass = await openLandmass(land, world, rmbText, FIRST_CONTINENT);
  let drawers = drawersOn(landmass);
  scene.setLand(landmass.view, terrainOf(landmass.view));

  const input = new Input(canvas);
  const dress = plainDress('human', 0.3);
  const you: Placed = { id: 1, x: 0, y: 0, z: 0, facing: 0, dress, anim: 'idle', frame: null, spin: false };
  // Arriving, the camera stands far enough back to show the whole figure against the view it arrives to.
  const arrivalView = { firstPerson: false, distance: 4.5, shown: 4.5 };
  const walker = new Walker({ ...newPlayer(movement, 0, 0), view: arrivalView }, you, firstPerson, forge);
  const footContext: FootContext = {
    movement,
    land,
    walker,
    forge,
    rooms,
    groundAt: (x, y) => scene.groundAt(x, y),
  };
  const closeSource = (left: number, top: number, step: number, samples: number) =>
    land.ground(left, top, step, samples, samples);
  let foot: Foot | null = null;
  let sea: Sea | null = null;
  let ready = false;
  let waited = 0;
  let wasDead = false;
  let charting: string | null = null;
  let sinceChart = 0;
  /** Continents that would not open: not tried again this visit. */
  const unchartable = new Set<string>();
  let last = performance.now();
  let clock = 0;

  /** Travels through the veil: the flow moves into its loading, `work` readies the place, and the veil lifts once
   *  its ground is in. A failure stays on the veil, in words. */
  const travel = (happening: Happening, work: () => Promise<void>) => {
    const after = next(flow, happening);
    if (after === flow || after.mode !== 'loading') return;
    flow = after;
    [ready, waited] = [false, 0];
    hud.veil(after.words);
    hud.menu(null);
    document.exitPointerLock();
    work()
      .then(() => {
        ready = true;
      })
      .catch((error: unknown) => {
        hud.veil(`${after.words} failed: ${error instanceof Error ? error.message : String(error)}`);
      });
  };

  const goFoot = async (node: NodeInfo, facing: number) => {
    foot?.leave();
    foot = null;
    sea?.leaveRoom();
    foot = await Foot.enter(footContext, node, facing);
  };

  const goSea = async () => {
    foot?.leave();
    foot = null;
    if (!sea) {
      const plan = landmass.plan;
      const social = landmass.nodes[0]?.centre ?? [0, 0];
      const [from, through] = plan ? [plan.centre, plan.harbour ?? social] : [social, social];
      const anchorage = offshore(landmass.heightAt, from, through);
      // The ship first lies facing the city, so the view over it looks at the island.
      const heading = bearingTo(anchorage, from);
      sea = new Sea(
        landmass,
        continents.map((each) => each.outline),
        ship,
        anchorage,
        heading,
      );
    }
    sea.cameAboard();
    if (rooms) await sea.enterRoom(rooms('sea'));
  };

  const firstNode = landmass.nodes.find((node) => node.id === FIRST_NODE) ?? landmass.nodes[0];
  if (!firstNode) throw new Error('Saltmere has no place to arrive at');
  goFoot(firstNode, arrivalFacing(firstNode, landmass.plan, null))
    .then(() => {
      ready = true;
    })
    .catch((error: unknown) => {
      hud.veil(`Arriving failed: ${error instanceof Error ? error.message : String(error)}`);
    });

  const landAt = (id: string) => {
    const landing = sea?.landingOf(id);
    const node = landmass.nodes.find((each) => each.id === id);
    if (!landing || !node || !sea) return;
    const from = sea.position;
    travel({ kind: 'land', node: id, name: landing.name }, () =>
      goFoot(node, arrivalFacing(node, landmass.plan, from)),
    );
  };

  const syncMenu = () => {
    const resume = { label: 'Resume', run: () => change({ kind: 'back' }) };
    if (flow.mode === 'foot' && flow.menu && foot) {
      const home = { label: 'Return to ship', run: () => travel({ kind: 'return-to-ship' }, goSea) };
      hud.menu({ title: foot.node.name, choices: [resume, home] });
    } else if (flow.mode === 'sea' && flow.menu) {
      const landings = { label: 'View landings', run: () => viewLandings() };
      hud.menu({ title: 'At sea', choices: sea?.canLand ? [resume, landings] : [resume] });
    } else hud.menu(null);
  };

  /** Moves the flow on for something that needs no veil, and shows its menu. */
  const change = (happening: Happening) => {
    flow = next(flow, happening);
    if ((flow.mode === 'foot' || flow.mode === 'sea') && flow.menu) document.exitPointerLock();
    syncMenu();
  };

  const viewLandings = () => {
    // While another landmass opens, the worker's landmass is not the one the landings would be on.
    if (flow.mode !== 'sea' || !sea || charting) return;
    if (flow.menu) change({ kind: 'back' });
    if (sea.viewLandings()) change({ kind: 'view-landings' });
  };

  const choose = (id: string) => {
    if (flow.mode === 'sea' && !flow.menu) sea?.sailToMark(id);
    if (flow.mode !== 'landing' || !sea) return;
    if (flow.chosen === id) landAt(id);
    else if (sea.landingOf(id)) {
      change({ kind: 'choose', node: id });
      sea.chosen = id;
    }
  };

  const respawn = () => {
    if (foot?.standing.kind === 'dead' && foot.standing.canRespawn) foot.respawn();
  };

  hud.onMark(choose);
  hud.onRespawn(respawn);
  hud.onPace((direction) => sea?.stepPace(direction));
  hud.onLandings(viewLandings);
  addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if (event.repeat) return;
    if (key === 'm') change({ kind: 'menu' });
    else if (key === 'escape' && flow.mode === 'landing') {
      sea?.backToSea();
      change({ kind: 'back' });
    } else if (key === 'escape') change({ kind: 'back' });
    else if (key === 'l') viewLandings();
    else if (key === 'enter' && flow.mode === 'landing' && flow.chosen) landAt(flow.chosen);
    else if (key === 'enter' && flow.mode === 'foot') respawn();
    else if ((key === '[' || key === ']') && flow.mode === 'sea') sea?.stepPace(key === ']' ? 1 : -1);
  });
  canvas.addEventListener('click', () => {
    if (flow.mode === 'foot' && !flow.menu && foot?.standing.kind !== 'dead' && !input.locked) input.lock();
  });
  const atSea = () => flow.mode === 'sea' && !flow.menu;
  canvas.addEventListener('pointerdown', (event) => {
    if (!atSea()) return;
    // Held to the canvas, so a press let go over a mark or the bar still ends here.
    canvas.setPointerCapture(event.pointerId);
    sea?.pointerDown(event.offsetX, event.offsetY);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (atSea()) sea?.pointerMove(event.offsetX, event.offsetY);
  });
  canvas.addEventListener('pointerup', (event) => {
    if (atSea()) sea?.pointerUp(event.offsetX, event.offsetY);
    else sea?.pointerCancel();
  });
  canvas.addEventListener('pointercancel', () => sea?.pointerCancel());
  canvas.addEventListener('wheel', (event) => {
    if (atSea()) sea?.zoom(wheelNotches(event.deltaY, event.deltaMode, canvas.clientHeight));
  });

  /** The drawers that stand on the open landmass, its city and its nature, and the meshes and figures besides. */
  const standing = (placings: readonly Placing[], figures: readonly CardAt[]): Drawer[] => {
    const found: (Drawer | null)[] = [
      drawers.city,
      drawers.nature,
      { drawInto: (pass, fromEye, shot) => meshes.drawInto(pass, fromEye, shot.eye, placings) },
      { drawInto: (pass, fromEye, shot) => figureView.drawInto(pass, fromEye, shot.eye, shot.yaw, figures) },
    ];
    return found.filter((drawer): drawer is Drawer => drawer !== null);
  };

  const footFrame = (here: Foot, controls: InputFrame, seconds: number, size: { width: number; height: number }) => {
    const paused = flow.mode !== 'foot' || flow.menu;
    const shown = here.frame(controls, seconds, clock, paused);
    const { body } = walker.player;
    scene.keepClose([body.x, body.y], closeSource, () => undefined);
    const hands = walker.inFirstPerson
      ? (encoder: GPUCommandEncoder, view: GPUTextureView) => firstPerson.draw(encoder, view, size.width, size.height)
      : undefined;
    scene.draw(shown.shot, size, clock, seconds, standing([], shown.figures), hands);
    showStanding(shown.standing);
    hud.place(here.node.name, placeWords(here.node));
    hud.hints(shown.standing.kind === 'dead' ? HINTS.dead : HINTS.foot);
    hud.marks([]);
    hud.seaBar(null);
    const player = here.roomPlayer;
    hud.note(player === null ? '' : `In the room as player ${player}`);
    return scene.closeReady(body.x, body.y);
  };

  const showStanding = (shown: Standing) => {
    hud.reach(shown);
    const dead = shown.kind === 'dead';
    if (dead && !wasDead) document.exitPointerLock();
    wasDead = dead;
  };

  const seaFrame = (here: Sea, controls: InputFrame, seconds: number, size: { width: number; height: number }) => {
    const held = (action: Action) => (controls.held(action) ? 1 : 0);
    const turn = held('turnRight') - held('turnLeft');
    const tilt = held('lookDown') - held('lookUp');
    const viewport = { width: canvas.clientWidth, height: canvas.clientHeight };
    const shown = here.frame(seconds, clock, viewport, turn, tilt);
    scene.draw(shown.shot, size, clock, seconds, standing(shown.ships, []));
    showStanding({ kind: 'inside' });
    const island = ISLANDS[landmass.id];
    if (flow.mode === 'landing') hud.place('Landings', island ? `The side of ${island} in view` : 'The coast in view');
    else hud.place('At sea', shown.canLand && island ? `Off ${island}` : REGION);
    hud.hints(flow.mode === 'landing' ? HINTS.landing : HINTS.sea);
    hud.marks(shown.marks);
    hud.seaBar(flow.mode === 'sea' ? { pace: shown.pace, canLand: shown.canLand } : null);
    hud.note(charting ? 'Charting the coast ahead…' : shown.note);
    sinceChart += seconds;
    // Only while sailing: a landing chosen, or under way, stands on the landmass open now.
    if (!charting && flow.mode === 'sea' && sinceChart >= CHART_EVERY_S) {
      sinceChart = 0;
      chart(here);
    }
  };

  /** Opens the continent whose coast the ship nears, and draws it in place of the one it leaves. */
  const chart = (here: Sea) => {
    const other = continentToOpen(here.position, continents, landmass.id);
    if (!other || unchartable.has(other)) return;
    charting = other;
    openLandmass(land, world, rmbText, other)
      .then((opened: Landmass) => {
        landmass = opened;
        drawers.release();
        drawers = drawersOn(opened);
        scene.setLand(opened.view, terrainOf(opened.view));
        here.setLandmass(opened);
      })
      .catch((error: unknown) => {
        unchartable.add(other);
        console.error(`${other} could not be opened:`, error);
      })
      .finally(() => {
        charting = null;
      });
  };

  const frame = (now: number) => {
    const seconds = Math.min(0.1, (now - last) / 1000);
    last = now;
    clock += seconds;
    const controls = input.frame();
    const size = { width: canvas.width, height: canvas.height };
    const shown = flow.mode === 'loading' ? (ready ? flow.then : null) : flow;
    let settled = true;
    if (shown?.mode === 'foot' && foot) settled = footFrame(foot, controls, seconds, size);
    else if ((shown?.mode === 'sea' || shown?.mode === 'landing') && sea) seaFrame(sea, controls, seconds, size);
    if (flow.mode === 'loading' && ready) {
      waited += seconds;
      if (settled || waited > GROUND_WAIT_S) {
        flow = next(flow, { kind: 'loaded' });
        hud.veil(null);
        syncMenu();
      }
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
