import type { Gpu } from '../gpu.ts';
import { coastField } from '../heldmap/coastField.ts';
import { HeldMap } from '../heldmap/heldMap.ts';
import { castOf } from '../nature/cast.ts';
import { woodsOf } from '../nature/woods.ts';
import { CHART_CELL_M, CHART_COLUMNS, CHART_ROWS } from '../overworld/discovery.ts';
import type { CardAt } from '../player/cards.ts';
import type { Placed } from '../player/figures.ts';
import { type Action, Input, type InputFrame } from '../player/input.ts';
import { newPlayer } from '../player/player.ts';
import { Walker } from '../player/walker.ts';
import { startLandWorker } from '../terrain/landClient.ts';
import { LocalRoom, sloopBuildText } from '../network/localRoom.ts';
import { RoomConnection } from '../network/roomConnection.ts';
import { MarkView } from '../ships/markView.ts';
import { FigureView } from './figureView.ts';
import { MusicDirector } from './audio/music/director.ts';
import { arriving, type Flow, type Happening, next } from './flow.ts';
import { Ambience } from './audio/ambience/ambience.ts';
import { Foot, type FootContext } from './foot.ts';
import { foesAsked } from './foesAsked.ts';
import { FootView } from './footView.ts';
import { keptDiscovered } from './discovered.ts';
import { Hud } from './hud.ts';
import { ISLANDS, placeWords, type Standing } from './hudLaw.ts';
import { type Landmass, openLandmass, terrainOf } from './landmass.ts';
import { landDrawers, loadCityAssets } from './landDrawers.ts';
import { arrivalFacing, bearingTo } from './nodes.ts';
import { gearScreenOpen, startGearWindow } from './gearWindow.ts';
import { accountOf, nodeOfRoom, roomsFrom } from './rooms.ts';
import { type Drawer, GameScene, type Overlay } from './scene.ts';
import { Sea } from './sea.ts';
import { seaPointer } from './seaPointer.ts';
import type { SeaShip } from './seaShips.ts';
import { shipPanelOnceBuilt, type SloopBuild, sloopBuildOf } from './shipPanel.ts';
import { showSeaHud } from './seaHud.ts';
import { continentToOpen, offshore } from './seaLaw.ts';
import { arrivalAt, type NodeInfo } from './worldData.ts';
import { loadParts } from './loading.ts';
import { standingDrawers } from './standing.ts';
import { afterStoryOn } from './welcome/afterStory.ts';
import { StoryHost } from './prologue/host.ts';
import { FIRST_LOOK, keptLook, plainDressOf } from './prologue/look.ts';
import { installInterfaceSounds } from './uiSounds.ts';

/** Where every player arrives: Overlook's social space, on Saltmere; `?at=<node id>` arrives at any node instead, to
 *  look round the world. */
const FIRST_NODE = 'overlook-social';
/** The region every island lies in. */
const REGION = 'The Pale Expanse';
/** The veil stays down until the exact ground round the player has come, or this long. */
const GROUND_WAIT_S = 20;
/** How often the sea looks for another continent's coast nearby, seconds. */
const CHART_EVERY_S = 1;

/**
 * The game: the player arrives in Overlook's social space, plays on foot, returns to their ship, sails the sea, views
 * an island's side and lands at a node, each through a veil while the place loads. This wires the pieces and keeps
 * the flow; each mode is its own module.
 */
export async function startGame(gpu: Gpu, canvas: HTMLCanvasElement, hudRoot: HTMLElement): Promise<void> {
  const hud = new Hud(hudRoot);
  // The first tap or key wakes the sound, so the story's intro begins heard.
  installInterfaceSounds(hudRoot);
  const asked = new URLSearchParams(location.search).get('at');
  // With `?at=` the page goes straight to a node; otherwise the story opens the game behind a tap to start.
  let flow: Flow = asked === null ? { mode: 'story' } : arriving(FIRST_NODE, 'Overlook');
  // The HUD starts veiled for loading; the story's tap to start stands in front of its loading instead.
  hud.veil(flow.mode === 'loading' ? flow.words : null);
  const story = flow.mode === 'story' ? new StoryHost(hudRoot, canvas) : null;
  const base = import.meta.env.BASE_URL;
  const rooms = roomsFrom(new URLSearchParams(location.search).get('room'));
  const { link, session } = accountOf(location, localStorage, sessionStorage);
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
  const { world, rmbText, movement, forge, firstPerson, store, sloop } = await loadParts(gpu, base, figureView);
  const after = afterStoryOn(hudRoot, forge, (x, y) => scene.groundAt(x, y));
  const { continents } = world;
  const ambience = new Ambience(world);
  const cityAssets = loadCityAssets(base);
  const biomeOf = (id: string) => continents.find((continent) => continent.id === id)?.climate ?? null;
  const drawersOn = (opened: Landmass) => landDrawers(gpu, opened, scene, biomeOf(opened.id), base, cityAssets);
  const start = (asked === null ? null : arrivalAt(world, asked)) ?? arrivalAt(world, FIRST_NODE);
  if (!start) throw new Error('the world has no Overlook to arrive at');
  if (start.node !== FIRST_NODE) {
    flow = arriving(start.node, start.name);
    if (flow.mode === 'loading') hud.veil(flow.words);
  }
  const discovered = keptDiscovered(world);
  discovered.arrived(start.continent, start.node);

  let landmass = await openLandmass(land, world, rmbText, start.continent);
  let drawers = drawersOn(landmass);
  /** A landmass's land as the scene draws it, its biome's woods coloured on it past the reach of its drawn trees. */
  const terrainFor = (opened: Landmass) => {
    const biome = biomeOf(opened.id);
    return terrainOf(opened.view, biome ? woodsOf(castOf(biome)) : undefined);
  };
  scene.setLand(landmass.view, terrainFor(landmass));

  const input = new Input(canvas);
  const dress = plainDressOf(keptLook(localStorage) ?? FIRST_LOOK);
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
    roomModule,
    groundAt: (x, y) => scene.groundAt(x, y),
    // Under `npm run dev` only, `?spawn=` asks a room in the page for foes to fight.
    foesAsked: import.meta.env.DEV ? foesAsked(location.search) : [],
    session,
  };
  const footView = new FootView(gpu, hudRoot, forge, [hud.hintList]);
  const music = new MusicDirector();
  const closeSource = (left: number, top: number, step: number, samples: number) =>
    land.ground(left, top, step, samples, samples);
  /** The held map, made when it is first asked for, since its coasts are worked out then. */
  let heldMap: HeldMap | null = null;
  let foot: Foot | null = null;
  let sea: Sea | null = null;
  let [ready, waited] = [false, 0];
  let wasDead = false;
  let wasWalking = false;
  let charting: string | null = null;
  let sinceChart = 0;
  /** Continents that would not open: not tried again this visit. */
  const unchartable = new Set<string>();
  let [last, clock] = [performance.now(), 0];

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

  /** Leaves wherever the player was: death's grey and the story's last moment go with them. */
  const leaveHere = () => {
    canvas.classList.remove('dead');
    wasDead = false;
    after.leave();
  };

  const goFoot = async (node: NodeInfo, facing: number, seas = heldMap?.difficulty) => {
    leaveHere();
    foot?.leave();
    foot = null;
    sea?.leaveRoom();
    foot = await Foot.enter(footContext, node, facing, seas);
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
        ? async (snapshot) => RoomConnection.open(rooms('sea'), snapshot, undefined, await session())
        : async (snapshot) => LocalRoom.openSea(await roomModule, world.layoutText, snapshot),
    );
  };

  const firstNode = landmass.nodes.find((node) => node.id === start.node) ?? landmass.nodes[0];
  if (!firstNode) throw new Error(`${start.name} has no place to arrive at`);
  const arrive = () =>
    behindVeil(flow.mode === 'loading' ? flow.words : '', () =>
      goFoot(firstNode, arrivalFacing(firstNode, landmass.plan, null)),
    );
  if (flow.mode === 'loading') arrive();
  if (story) {
    const game = { gpu, canvas, hudRoot, hud, scene, figures: figureView, footView, forge, firstPerson, land, world };
    const more = { rmbText, movement, walker, input, roomModule, marks: new MarkView(gpu), link, sloop, music };
    const lands = { drawersOn, terrainFor, home: { landmass, drawers }, closeSource };
    story.begin({ ...game, ...more, ...lands }, () => ((flow = arriving(FIRST_NODE, 'Overlook')), arrive()));
  }

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

  /** Joins a company member where they play: a node of this landmass at their seas, the ship left where she lies. */
  const joinAt = (place: string): string | null => {
    // Only on foot or on deck with nothing else under way: never under the map, on the way to the helm, walking the
    // deck, landing, or while another landmass opens.
    const free = (flow.mode === 'foot' || flow.mode === 'sea') && !flow.menu;
    if (!free || heldMap?.shown || mapWanted || sea?.aboard.active || charting)
      return 'You are in their company. Choose Go to them once nothing else is under way.';
    // As other games keep travel out of a fight, and the fallen respawn before they go anywhere.
    if (flow.mode === 'sea' && sea?.fight) return 'You are in their company. Go to them once the fight is over.';
    if (flow.mode === 'foot' && foot?.fallen) return 'You are in their company. Go to them once you respawn.';
    const where = nodeOfRoom(place);
    const node = where && landmass.nodes.find((each) => each.id === where.id);
    if (!where || !node)
      return place === 'sea' ? 'They are at sea: meet them where they land.' : 'They are across the sea.';
    const facing = arrivalFacing(node, landmass.plan, null);
    discovered.nodes([node.id]);
    travel({ kind: 'join', node: node.id, name: node.name }, () => goFoot(node, facing, where.seas));
    return null;
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

  const respawn = () => void (foot?.standing.kind === 'dead' && foot.standing.canRespawn && foot.respawn());

  hud.onMark(choose);
  hud.onRespawn(respawn);
  hud.onPace((direction) => sea?.stepPace(direction));
  hud.onVoyage(stopOrResume);
  hud.onMap(openMap);
  hud.onLandfall(goAshore);
  hud.onManage(manage);
  hud.onLeaveHelm(leaveHelm);
  hud.onTakeHelm(takeHelm);
  // The Ship tab's papers: her voyage only while she is at sea.
  const shipNow = () => shipPanelOnceBuilt(builtSloop(), sloop.waterline, flow.mode === 'sea' ? sea : null);
  const gearHere = () => (flow.mode === 'foot' ? (foot?.gear ?? null) : null);
  startGearWindow(hudRoot, link, gearHere, shipNow, joinAt, () => flow.mode === 'story');
  addEventListener('keyup', (event) => void (flow.mode === 'story' && story?.key(event.key.toLowerCase(), false)));
  addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if (event.repeat) return;
    if (flow.mode === 'story') return void story?.key(key, true);
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
    else if (key === 'e' && flow.mode === 'foot') foot?.use();
    else if (key === 'enter' && flow.mode === 'landing' && flow.chosen) landAt(flow.chosen);
    else if (key === 'enter' && flow.mode === 'foot') respawn();
    else if ((key === '[' || key === ']') && flow.mode === 'sea') sea?.stepPace(key === ']' ? 1 : -1);
  });
  canvas.addEventListener('click', () => {
    if (flow.mode === 'story' && story?.wantsPointer && !input.locked) input.lock();
    if (flow.mode === 'foot' && !flow.menu && foot?.standing.kind !== 'dead' && !input.locked) input.lock();
    if (flow.mode === 'sea' && !flow.menu && sea?.aboard.walking && !input.locked) input.lock();
  });
  seaPointer(canvas, input, {
    atSea: () => flow.mode === 'sea' && !flow.menu,
    sea: () => sea,
    map: () => heldMap,
  });

  /** The drawers that stand on the open landmass, its city and its nature, and the meshes and figures besides; on foot
   *  the fight's blood under the figures and its marks over them. */
  const standing = (ships: readonly SeaShip[], figures: readonly CardAt[], fight?: { under: Drawer; over: Drawer }) =>
    standingDrawers(
      drawers,
      (pass, camera, time) => {
        ships.forEach((ship, slot) => sloop.drawInto(pass, ship.place, camera, slot, ship.shade, ship.rig));
        sea?.fight?.draw(pass, camera, time);
      },
      figureView,
      figures,
      fight,
    );

  const footFrame = (here: Foot, controls: InputFrame, seconds: number, size: { width: number; height: number }) => {
    const paused = flow.mode !== 'foot' || flow.menu || gearScreenOpen();
    const aspect = size.width / Math.max(1, size.height);
    const shown = here.frame(controls, seconds, clock, { paused, hands: controls.locked, aspect });
    music.onFoot(world, here.node, shown.fight, seconds);
    ambience.onFoot(here.node, landmass, shown.shot, here.folk);
    const { body } = walker.player;
    scene.keepClose([body.x, body.y], closeSource, () => undefined);
    const hands = walker.inFirstPerson
      ? (encoder: GPUCommandEncoder, view: GPUTextureView, over: Overlay) => firstPerson.draw(encoder, view, over)
      : undefined;
    const viewport = { width: canvas.clientWidth, height: canvas.clientHeight };
    const fight = footView.frame(here, shown, seconds, { size, viewport, groundAt: (x, y) => scene.groundAt(x, y) });
    // The story's last moment, on foot once the veil is gone: the stranger before the player, then the elder's welcome.
    const met = after.frame(shown.shot, viewport, seconds, clock, walker.you, flow.mode !== 'foot', here.node);
    const carried = { left: walker.you.dress.outfit.left, feet: [body.x, body.y, body.z] as const };
    scene.draw(shown.shot, size, clock, seconds, standing([], [...shown.figures, ...met], fight), {
      after: hands,
      carried,
    });
    showStanding(shown.standing);
    hud.place(here.node.name, placeWords(here.node));
    hud.hints(shown.hints);
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
    const paused = flow.mode !== 'sea' || flow.menu || gearScreenOpen();
    const swell = scene.land?.swell;
    footView.hide();
    // The helm's keys, as in a fight, while the sea's own view is up: the map's and the deck's keys are their own.
    if (!paused && !heldMap?.shown)
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
    music.atSea(here, seconds);
    const voyage = { ...shown, deck: here.helmView || here.aboard.active, feet: walker.player.body };
    ambience.atSea(landmass, here.position, shown.shot, voyage, seconds);
    // Back at the helm, or called to it, the pointer is the player's again.
    if (wasWalking && !here.aboard.walking && input.locked) document.exitPointerLock();
    wasWalking = here.aboard.walking;
    // What a lookout sees is discovered as the ship sails.
    if (flow.mode === 'sea') discovered.lookout(here.position);
    if (mapWanted && here.atHelm && flow.mode === 'sea' && !flow.menu) {
      mapWanted = false;
      const hands = walker.you.dress.outfit.armour.gauntlets ?? null;
      mapOf().open(viewport, here.position, hands, discovered.discovery.charted);
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
        ? (encoder: GPUCommandEncoder, view: GPUTextureView, over: Overlay) => firstPerson.draw(encoder, view, over)
        : undefined;
    const more = { hulls: shown.hulls, after, focus: shown.focus, atSea: true };
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
    openLandmass(land, world, rmbText, other)
      .then((opened: Landmass) => {
        landmass = opened;
        drawers.release();
        drawers = drawersOn(opened);
        scene.setLand(opened.view, terrainFor(opened));
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

  /** A frame of the story; once it ends, the player arrives at Overlook's social space in their own dress, the stranger
   *  with them if they played it through. */
  const storyFrame = (
    host: StoryHost,
    controls: InputFrame,
    seconds: number,
    size: { width: number; height: number },
  ) => {
    const left = host.frame(controls, seconds, size);
    if (!left) return;
    [after.epilogue, walker.you.dress] = [left.epilogue, left.dress];
    flow = next(flow, { kind: 'story-ended', node: FIRST_NODE, name: 'Overlook' });
    arrive();
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
    if (shown?.mode === 'story' && story) storyFrame(story, controls, seconds, size);
    else if (shown?.mode === 'foot' && foot) settled = footFrame(foot, controls, seconds, size);
    else if ((shown?.mode === 'sea' || shown?.mode === 'landing') && sea) seaFrame(sea, controls, seconds, size);
    ambience.frame(seconds);
    if (flow.mode === 'loading' && ready) {
      // Wall time, not the world's: a slow machine waits no longer for the ground than a quick one.
      waited += elapsed;
      if (settled || waited > GROUND_WAIT_S) {
        flow = next(flow, { kind: 'loaded' });
        hud.veil(null);
        syncMenu();
      }
    }
    // At most one frame waits on the GPU while the next is drawn, so a GPU that falls behind slows the frames.
    const previous = inFlight;
    inFlight = gpu.device.queue.onSubmittedWorkDone();
    void previous.then(() => requestAnimationFrame(frame));
  };
  requestAnimationFrame(frame);
}
