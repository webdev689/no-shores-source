import type { Gpu } from '../gpu.ts';
import { coastField } from '../heldmap/coastField.ts';
import { HeldMap } from '../heldmap/heldMap.ts';
import { castOf } from '../nature/cast.ts';
import { woodsOf } from '../nature/woods.ts';
import { CHART_CELL_M, CHART_COLUMNS, CHART_ROWS } from '../overworld/discovery.ts';
import { wheelNotches } from '../overworld/overworldInput.ts';
import type { CardAt } from '../player/cards.ts';
import { plainDress } from '../player/dressing.ts';
import type { Placed } from '../player/figures.ts';
import { type Action, Input, type InputFrame } from '../player/input.ts';
import { newPlayer } from '../player/player.ts';
import { askedView } from '../player/playerCamera.ts';
import { Walker } from '../player/walker.ts';
import { startMovementRules } from '../rules/movementRules.ts';
import { startLandWorker } from '../terrain/landClient.ts';
import { LocalRoom, sloopBuildText } from '../network/localRoom.ts';
import { RoomConnection } from '../network/roomConnection.ts';
import { MarkView } from '../ships/markView.ts';
import { loadShip, shipSails } from '../ships/shipMesh.ts';
import { ShipView } from '../ships/shipView.ts';
import { FigureView } from './figureView.ts';
import { arriving, type Flow, type Happening, next } from './flow.ts';
import { Foot, type FootContext } from './foot.ts';
import { keptDiscovered } from './discovered.ts';
import { Hud } from './hud.ts';
import { KIND_WORDS, type Standing } from './hudLaw.ts';
import { type Landmass, openLandmass, terrainOf } from './landmass.ts';
import { landDrawers, loadCityAssets } from './landDrawers.ts';
import { loadLandTexts } from './landTexts.ts';
import { askedArrival, type GateWay, gateWay } from './gates.ts';
import { openForge } from './openForge.ts';
import { arrivalFacing, bearingTo } from './nodes.ts';
import { roomsFrom } from './rooms.ts';
import { type Drawer, GameScene } from './scene.ts';
import { Sea } from './sea.ts';
import type { SeaShip } from './seaShips.ts';
import { HINTS } from './hints.ts';
import { type SloopBuild, sloopBuildOf } from './shipPanel.ts';
import { showSeaHud } from './seaHud.ts';
import { fightControls } from './seaCombat.ts';
import { continentToOpen, offshore } from './seaLaw.ts';
import { arrivalAt, loadWorld, type NodeInfo } from './worldData.ts';

/** Where every player arrives: Overlook's social space, on Saltmere; `?at=<node id>` arrives at any node instead, to
 *  look round the world. */
const FIRST_NODE = 'overlook-social';
/** The most ships drawn at sea in a frame: the player's and those near it. */
const SEA_SHIPS = 16;
/** The islands' names the owner has given, by continent. */
const ISLANDS: Readonly<Record<string, string>> = { 'continent-1': 'Saltmere' };
/** The region every island lies in. */
const REGION = 'The Pale Expanse';
/** The veil stays down until the exact ground round the player has come, or this long. */
const GROUND_WAIT_S = 20;
/** How often the sea looks for another continent's coast nearby, seconds. */
const CHART_EVERY_S = 1;

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
  // The sea room's own module, for playing alone; fetched now, compiled once.
  const roomModule = fetch(`${base}room.wasm`)
    .then((answer) => (answer.ok ? answer.arrayBuffer() : Promise.reject(new Error(`room.wasm: ${answer.status}`))))
    .then((bytes) => WebAssembly.compile(bytes));
  // The Sloop's build as the naval rules hold it, for Manage's panel: read once when first opened, however it reads.
  let [compiled, sloopBuild]: [WebAssembly.Module | null, SloopBuild | null | undefined] = [null, undefined];
  void roomModule.then((module) => (compiled = module)).catch(() => undefined);
  const builtSloop = () =>
    (compiled && sloopBuild === undefined ? (sloopBuild = sloopBuildOf(sloopBuildText(compiled))) : sloopBuild) ?? null;
  const land = startLandWorker();
  const scene = new GameScene(gpu);
  const figureView = new FigureView(gpu);
  const [world, landTexts, movement, { forge, firstPerson, store }, sloop] = await Promise.all([
    loadWorld(base),
    loadLandTexts(base),
    fetch(`${base}movement.wasm`)
      .then((answer) => {
        if (!answer.ok) throw new Error(`movement.wasm: ${answer.status}`);
        return answer.arrayBuffer();
      })
      .then(startMovementRules),
    openForge(gpu, figureView),
    loadShip('sloop').then((mesh) => new ShipView(gpu, mesh, shipSails('sloop'), SEA_SHIPS)),
  ]);
  const { continents } = world;
  const cityAssets = loadCityAssets(base);
  const biomeOf = (id: string) => continents.find((continent) => continent.id === id)?.climate ?? null;
  const drawersOn = (opened: Landmass) => landDrawers(gpu, opened, scene, biomeOf(opened.id), base, cityAssets);
  const asked = new URLSearchParams(location.search).get('at');
  const start = (asked === null ? null : arrivalAt(world, asked)) ?? arrivalAt(world, FIRST_NODE);
  if (!start) throw new Error('the world has no Overlook to arrive at');
  if (start.node !== FIRST_NODE) {
    flow = arriving(start.node, start.name);
    if (flow.mode === 'loading') hud.veil(flow.words);
  }
  const discovered = keptDiscovered(world);
  discovered.arrived(start.continent, start.node);

  let landmass = await openLandmass(land, world, landTexts, start.continent);
  let drawers = drawersOn(landmass);
  /** A landmass's land as the scene draws it, its biome's woods coloured on it past the reach of its drawn trees. */
  const terrainFor = (opened: Landmass) => {
    const biome = biomeOf(opened.id);
    return terrainOf(opened.view, biome ? woodsOf(castOf(biome)) : undefined);
  };
  scene.setLand(landmass.view, terrainFor(landmass), biomeOf(landmass.id));

  const input = new Input(canvas);
  const dress = plainDress('human', 0.3);
  const you: Placed = { id: 1, x: 0, y: 0, z: 0, facing: 0, dress, anim: 'idle', frame: null, spin: false };
  // Arriving, the camera stands far enough back to show the whole figure against the view it arrives to.
  // The address may ask for another (`&view=`), to picture a place from first person or nearer.
  const arrivalView = askedView(location.search) ?? { firstPerson: false, distance: 4.5, shown: 4.5 };
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
  let wasWalking = false;
  let charting: string | null = null;
  let sinceChart = 0;
  /** Continents that would not open: not tried again this visit. */
  const unchartable = new Set<string>();
  let last = performance.now();
  let clock = 0;

  /** Travels through the veil: the flow moves into its loading, `work` readies the place, and the veil lifts once
   *  its ground is in. A failure stays on the veil, in words. */
  /** A way that failed, tried again with Enter. */
  let retry: (() => void) | null = null;
  /** Runs `work` behind the veil showing `words`; the veil lifts once it is done and the ground has come. A failure
   *  stays on the veil, and Enter tries it again. */
  const behindVeil = (words: string, work: () => Promise<void>) => {
    retry = null;
    [ready, waited] = [false, 0];
    hud.veil(words);
    work()
      .then(() => {
        ready = true;
      })
      .catch((error: unknown) => {
        const why = error instanceof Error ? error.message : String(error);
        hud.veil(`${words} failed: ${why}. Press Enter to try again.`);
        retry = () => behindVeil(words, work);
      });
  };

  const travel = (happening: Happening, work: () => Promise<void>) => {
    const after = next(flow, happening);
    if (after === flow || after.mode !== 'loading') return;
    flow = after;
    hud.menu(null);
    document.exitPointerLock();
    behindVeil(after.words, work);
  };

  /** Leaves wherever the player was: death's grey goes with them. */
  const leaveHere = () => {
    canvas.classList.remove('dead');
    wasDead = false;
  };

  const goFoot = async (node: NodeInfo, facing: number) => {
    leaveHere();
    foot?.leave();
    foot = null;
    sea?.leaveRoom();
    foot = await Foot.enter(footContext, node, facing);
  };

  const goSea = async () => {
    leaveHere();
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
        { waterline: sloop.waterline, sails: sloop.sails, marks: new MarkView(gpu) },
        anchorage,
        heading,
        { movement, walker, forge },
      );
    }
    sea.cameAboard();
    // The held map's coasts are worked out behind the veil, not on its first raising.
    mapOf();
    // Online the server's sea room; playing alone, the same room in the page.
    await sea.enterRoom(
      rooms
        ? (snapshot) => RoomConnection.open(rooms('sea'), snapshot)
        : async (snapshot) => LocalRoom.openSea(await roomModule, world.layoutText, snapshot),
    );
  };

  const arrived = landmass.nodes.find((node) => node.id === start.node) ?? landmass.nodes[0];
  if (!arrived) throw new Error(`${start.name} has no place to arrive at`);
  const { node: firstNode, facing: firstFacing } = askedArrival(arrived, location.search);
  if (flow.mode === 'loading')
    behindVeil(flow.words, () => goFoot(firstNode, firstFacing ?? arrivalFacing(firstNode, landmass.plan, null)));

  const landAt = (id: string) => {
    discovered.nodes([id]);
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
      const landfall = sea?.landfall;
      const label = landfall?.kind === 'dock' ? `Dock at ${landfall.port}` : 'Go ashore';
      hud.menu({ title: 'At sea', choices: landfall ? [resume, { label, run: () => goAshore() }] : [resume] });
    } else hud.menu(null);
  };

  /** Moves the flow on for something that needs no veil, and shows its menu. */
  const change = (happening: Happening) => {
    flow = next(flow, happening);
    if ((flow.mode === 'foot' || flow.mode === 'sea') && flow.menu) document.exitPointerLock();
    syncMenu();
  };

  /** Docks or goes ashore as the sea offers: the view flies up over the island's side to choose a landing. */
  const goAshore = () => {
    // While another landmass opens, the worker's landmass is not the one the landings would be on.
    if (flow.mode !== 'sea' || !sea || charting) return;
    if (flow.menu) change({ kind: 'back' });
    if (!sea.goAshore()) return;
    change({ kind: 'view-landings' });
    discovered.nodes(sea.landings);
  };

  /** The held map, made when it is first asked for, since its coasts are worked out then. */
  let heldMap: HeldMap | null = null;
  /** The map is wanted: it is raised once the view stands at the helm. */
  let mapWanted = false;
  const mapOf = (): HeldMap => {
    if (heldMap) return heldMap;
    const field = coastField(
      continents.map((each) => each.outline),
      CHART_COLUMNS,
      CHART_ROWS,
      CHART_CELL_M,
    );
    const made = new HeldMap(gpu, field, store, (to) => sea?.planTo(to) ?? { ok: false, why: 'No ship.' }, hudRoot);
    // Lowered, the view goes back up; a destination set, the ship sets sail as it does.
    made.onLowered((sail) => {
      sea?.fromHelm();
      if (sail) sea?.sailTo(sail);
    });
    heldMap = made;
    return made;
  };

  /** Takes the view down to the ship's helm, where the map is raised. */
  const openMap = () => {
    if (flow.mode !== 'sea' || flow.menu || !sea || heldMap?.shown) return;
    mapWanted = sea.toHelm();
  };

  /** Opens Manage over her deck, or closes it. */
  const manage = () => {
    if (flow.mode === 'sea' && !flow.menu && !sea?.aboard.walking) sea?.manage();
  };

  /** The player leaves the helm to walk her deck, the pointer held to look round as on foot. */
  const leaveHelm = () => {
    if (flow.mode === 'sea' && !flow.menu && sea?.leaveHelm()) input.lock();
  };

  /** Takes the helm again, at her wheel. */
  const takeHelm = () => {
    if (flow.mode === 'sea' && !flow.menu) sea?.takeHelm();
  };

  /** Stops the voyage under way, or resumes the one stopped. */
  const stopOrResume = () => {
    if (flow.mode !== 'sea' || flow.menu || !sea || sea.aboard.active) return;
    if (sea.resumable) sea.resume();
    else sea.stop();
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
  hud.onVoyage(stopOrResume);
  hud.onMap(openMap);
  hud.onLandfall(goAshore);
  hud.onManage(manage);
  hud.onLeaveHelm(leaveHelm);
  hud.onTakeHelm(takeHelm);
  addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if (event.repeat) return;
    if (heldMap?.shown) {
      if (key === 'escape') heldMap.escape();
      else if (key === 'enter') heldMap.setSail();
      return;
    }
    // On the way down to the helm, Escape turns back before the map is raised.
    if (key === 'escape' && mapWanted && sea?.helmView) {
      mapWanted = false;
      sea.fromHelm();
      return;
    }
    if (key === 'enter' && retry) retry();
    else if (key === 'm') change({ kind: 'menu' });
    else if (key === 'escape' && flow.mode === 'landing') {
      sea?.backToSea();
      change({ kind: 'back' });
    } else if (key === 'escape') change({ kind: 'back' });
    else if (key === 'l' || (key === 'enter' && flow.mode === 'sea' && !flow.menu)) goAshore();
    else if (key === ' ' && flow.mode === 'sea') stopOrResume();
    else if (key === 'n') openMap();
    else if (key === 'b') manage();
    else if (key === 'h') leaveHelm();
    else if (key === 'e' && sea?.aboard.walking) takeHelm();
    else if (key === 'e' && flow.mode === 'foot' && !flow.menu) goThrough();
    else if (key === 'enter' && flow.mode === 'landing' && flow.chosen) landAt(flow.chosen);
    else if (key === 'enter' && flow.mode === 'foot') respawn();
    else if ((key === '[' || key === ']') && flow.mode === 'sea') sea?.stepPace(key === ']' ? 1 : -1);
  });
  canvas.addEventListener('click', () => {
    if (flow.mode === 'foot' && !flow.menu && foot?.standing.kind !== 'dead' && !input.locked) input.lock();
    if (flow.mode === 'sea' && !flow.menu && sea?.aboard.walking && !input.locked) input.lock();
  });
  const atSea = () => flow.mode === 'sea' && !flow.menu;
  /** While the map is up, the pointer and the wheel are the map's. */
  const mapUp = () => heldMap?.shown ?? false;
  canvas.addEventListener('pointerdown', (event) => {
    if (!atSea()) return;
    // Held to the canvas, so a press let go over a mark or the bar still ends here; a locked pointer is held already.
    if (!input.locked) canvas.setPointerCapture(event.pointerId);
    if (mapUp()) heldMap?.pointerDown(event.offsetX, event.offsetY);
    else sea?.pointerDown(event.offsetX, event.offsetY);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!atSea()) return;
    if (mapUp()) heldMap?.pointerMove(event.offsetX, event.offsetY);
    else sea?.pointerMove(event.offsetX, event.offsetY);
  });
  /** A press is let go by whichever took it; neither keeps one after, where the map rose or fell in between. */
  const forgetPresses = () => {
    sea?.pointerCancel();
    heldMap?.pointerCancel();
  };
  canvas.addEventListener('pointerup', (event) => {
    if (atSea() && mapUp()) heldMap?.pointerUp(event.offsetX, event.offsetY);
    else if (atSea()) sea?.pointerUp(event.offsetX, event.offsetY);
    forgetPresses();
  });
  canvas.addEventListener('pointercancel', forgetPresses);
  fightControls(canvas, () => sea?.fight ?? null);
  canvas.addEventListener('wheel', (event) => {
    if (!atSea()) return;
    if (mapUp()) heldMap?.wheel(event.offsetX, event.offsetY, event.deltaY, event.deltaMode);
    else sea?.zoom(wheelNotches(event.deltaY, event.deltaMode, canvas.clientHeight));
  });

  /** The drawers that stand on the open landmass, its city and its nature, and the meshes and figures besides. */
  const standing = (ships: readonly SeaShip[], figures: readonly CardAt[]): Drawer[] => {
    const found: (Drawer | null)[] = [
      drawers.city,
      drawers.layouts,
      drawers.nature,
      {
        drawInto: (pass, fromEye, shot, time) => {
          const camera = { fromEye, eye: shot.eye };
          ships.forEach((ship, slot) => sloop.drawInto(pass, ship.place, camera, slot, ship.shade, ship.rig));
          sea?.fight?.draw(pass, camera, time);
        },
      },
      {
        castInto: (pass, fromEye, shot, _time, shadow) =>
          figureView.castInto(pass, fromEye, shot.eye, shot.yaw, figures, shadow),
        drawInto: (pass, fromEye, shot, _time, shadow) =>
          figureView.drawInto(pass, fromEye, shot.eye, shot.yaw, figures, shadow),
      },
    ];
    return found.filter((drawer): drawer is Drawer => drawer !== null);
  };

  /** The way through the gate the player stands in, if any, and going through it to the node it leads to. */
  let through: GateWay | null = null;
  const goThrough = () => {
    const way = through;
    if (way && flow.mode === 'foot') travel(way.happening, () => goFoot(way.node, way.facing));
  };
  hud.onPassage(goThrough);

  const footFrame = (here: Foot, controls: InputFrame, seconds: number, size: { width: number; height: number }) => {
    const paused = flow.mode !== 'foot' || flow.menu;
    const shown = here.frame(controls, seconds, clock, paused);
    const { body } = walker.player;
    scene.keepClose([body.x, body.y], closeSource, () => undefined);
    const hands = walker.inFirstPerson
      ? (encoder: GPUCommandEncoder, view: GPUTextureView) => firstPerson.draw(encoder, view, size.width, size.height)
      : undefined;
    scene.draw(shown.shot, size, clock, seconds, standing([], shown.figures), { after: hands });
    showStanding(shown.standing);
    hud.place(here.node.name, placeWords(here.node));
    through = paused ? null : gateWay(landmass, here.node.id, [body.x, body.y]);
    hud.passageOffer(through?.offer ?? null);
    hud.hints(shown.standing.kind === 'dead' ? HINTS.dead : HINTS.foot);
    hud.marks([]);
    hud.seaBar(null);
    hud.note(here.roomNote);
    return scene.closeReady(body.x, body.y);
  };

  const showStanding = (shown: Standing) => {
    hud.reach(shown);
    const dead = shown.kind === 'dead';
    if (dead && !wasDead) document.exitPointerLock();
    if (dead !== wasDead) canvas.classList.toggle('dead', dead);
    wasDead = dead;
  };

  const seaFrame = (here: Sea, controls: InputFrame, seconds: number, size: { width: number; height: number }) => {
    const held = (action: Action) => (controls.held(action) ? 1 : 0);
    const viewport = { width: canvas.clientWidth, height: canvas.clientHeight };
    const paused = flow.mode !== 'sea' || flow.menu;
    const swell = scene.land?.swell;
    // The helm's keys, as in a fight, while the sea's own view is up: the map's and the deck's keys are their own.
    if (!paused && !mapUp())
      here.helm(held('right') - held('left'), controls.pressed('forward'), controls.pressed('back'), seconds);
    const shown = here.frame({
      seconds,
      time: clock,
      viewport,
      turn: held('turnRight') - held('turnLeft'),
      tilt: held('lookDown') - held('lookUp'),
      swell,
      controls,
      paused,
    });
    for (const stir of shown.stirs) scene.stir(stir);
    // Back at the helm, or called to it, the pointer is the player's again.
    if (wasWalking && !here.aboard.walking && input.locked) document.exitPointerLock();
    wasWalking = here.aboard.walking;
    // What a lookout sees is discovered as the ship sails.
    if (flow.mode === 'sea') discovered.lookout(here.position);
    if (mapWanted && here.atHelm && flow.mode === 'sea' && !flow.menu) {
      mapWanted = false;
      mapOf().open(viewport, here.position, dress.outfit.armour.gauntlets ?? null, discovered.discovery.charted);
    }
    // The map's scene is gathered only while the map is up.
    const mapFrame = heldMap?.shown
      ? heldMap.frame(seconds, viewport, canvas.width / Math.max(1, canvas.clientWidth), {
          ship: here.position,
          heading: here.heading,
          places: discovered.places,
          knownIslands: discovered.knownIslands,
          course: here.course,
        })
      : null;
    // The map at the helm, or the player's own hands walking her deck in first person, over the finished picture.
    const after = mapFrame
      ? (encoder: GPUCommandEncoder, view: GPUTextureView) => heldMap?.draw(encoder, view, mapFrame)
      : shown.firstPerson
        ? (encoder: GPUCommandEncoder, view: GPUTextureView) => firstPerson.draw(encoder, view, size.width, size.height)
        : undefined;
    const more = { hulls: shown.hulls, after, focus: shown.focus };
    scene.draw(shown.shot, size, clock, seconds, standing(shown.ships, shown.figures), more);
    showStanding({ kind: 'inside' });
    showSeaHud(hud, here, shown, {
      landing: flow.mode === 'landing',
      onSea: flow.mode === 'sea' && !flow.menu,
      island: ISLANDS[landmass.id],
      region: REGION,
      clock,
      build: builtSloop,
      waterline: sloop.waterline,
      charting: charting !== null,
    });
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
    openLandmass(land, world, landTexts, other)
      .then((opened: Landmass) => {
        landmass = opened;
        drawers.release();
        drawers = drawersOn(opened);
        scene.setLand(opened.view, terrainFor(opened), biomeOf(opened.id));
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

  /** The GPU's work for the frame drawn last. */
  let inFlight = Promise.resolve();
  const frame = (now: number) => {
    const elapsed = (now - last) / 1000;
    const seconds = Math.min(0.1, elapsed);
    last = now;
    clock += seconds;
    const controls = input.frame();
    const size = { width: canvas.width, height: canvas.height };
    const shown = flow.mode === 'loading' ? (ready ? flow.then : null) : flow;
    let settled = true;
    if (shown?.mode === 'foot' && foot) settled = footFrame(foot, controls, seconds, size);
    else if ((shown?.mode === 'sea' || shown?.mode === 'landing') && sea) seaFrame(sea, controls, seconds, size);
    if (flow.mode === 'loading' && ready) {
      // Wall time, not the world's: a slow machine waits no longer for the ground than a quick one.
      waited += elapsed;
      if (settled || waited > GROUND_WAIT_S) {
        flow = next(flow, { kind: 'loaded' });
        hud.veil(null);
        syncMenu();
      }
    }
    // At most one frame waits on the GPU while the next is drawn: a GPU that falls behind slows the frames instead of
    // queueing work without end, which stalls every tab and the browser itself.
    const previous = inFlight;
    inFlight = gpu.device.queue.onSubmittedWorkDone();
    void previous.then(() => requestAnimationFrame(frame));
  };
  requestAnimationFrame(frame);
}
