import type { Gpu } from '../gpu.ts';
import { coastField } from '../heldmap/coastField.ts';
import { type Difficulty, HeldMap } from '../heldmap/heldMap.ts';
import { CHART_CELL_M, CHART_COLUMNS, CHART_ROWS } from '../overworld/discovery.ts';
import { plainDress } from '../player/dressing.ts';
import type { Placed } from '../player/figures.ts';
import { Input } from '../player/input.ts';
import { newPlayer } from '../player/player.ts';
import { Walker } from '../player/walker.ts';
import { LocalRoom } from '../network/localRoom.ts';
import { RoomConnection } from '../network/roomConnection.ts';
import { MarkView } from '../ships/markView.ts';
import { HULL_NAMES } from '../ships/hulls.ts';
import { Charting } from './charting.ts';
import { type Happening, next } from './flow.ts';
import { Foot, type FootContext } from './foot.ts';
import { foesAsked } from './foesAsked.ts';
import { FriendlyTraffic, waterOf } from './friendlyShips.ts';
import { FootView } from './footView.ts';
import { bootGame, SEA_SHIPS } from './gameBoot.ts';
import { type Playing, startFrames } from './gameFrame.ts';
import { type Landmass, openLandmass } from './landmass.ts';
import { arrivalFacing, bearingTo } from './nodes.ts';
import { startGearWindow } from './gearWindow.ts';
import { type OpenWaters, seaWatersOf, watersOnce } from './pageWaters.ts';
import { nodeOfRoom, seaRoomName } from './rooms.ts';
import { Sea } from './sea.ts';
import { SeaWord, deckKey, fightAsk } from './seaWord.ts';
import { seaPointer } from './seaPointer.ts';
import { shipPanelOnceBuilt } from './shipPanel.ts';
import { offshore } from './seaLaw.ts';
import { type NodeInfo, portsOf } from './worldData.ts';

/**
 * The game: the player arrives in Overlook's social space, plays on foot, returns to their ship, sails the sea, views
 * an island's side and lands at a node, each through a veil while the place loads. This boots the pieces
 * (`gameBoot.ts`), keeps the travel and the player's actions, and starts the frames (`gameFrame.ts`); each mode is
 * its own module.
 */
export async function startGame(gpu: Gpu, canvas: HTMLCanvasElement, hudRoot: HTMLElement): Promise<void> {
  // The size ships are drawn at this frame, which a ruin's wrecks are drawn at too: the sea's, true size on foot.
  let shipScale = 1;
  const boot = await bootGame(gpu, hudRoot, () => shipScale);
  const { hud, rooms, link, session, world, rmbText, start, discovered, roomModule, land, scene } = boot;
  const { shipModels, figureView, forge, firstPerson, store, sloop, movement, drawersOn, terrainFor, builtSloop } =
    boot;
  const { continents } = world;
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
    roomModule,
    groundAt: (x, y) => scene.groundAt(x, y),
    // Under `npm run dev` only, `?spawn=` asks a room in the page for foes to fight.
    foesAsked: import.meta.env.DEV ? foesAsked(location.search) : [],
    session,
  };
  const footView = new FootView(gpu, hudRoot);
  const closeSource = (left: number, top: number, step: number, samples: number) =>
    land.ground(left, top, step, samples, samples);
  const landmass = boot.landmass;
  const playing: Playing = {
    flow: boot.flow,
    foot: null,
    sea: null,
    // The held map, made when it is first asked for, since its coasts are worked out then.
    heldMap: null,
    seaWord: null,
    landmass,
    drawers: drawersOn(landmass),
    ready: false,
    waited: 0,
    // The map is wanted: it is raised once the view stands at the helm.
    mapWanted: false,
    get shipScale() {
      return shipScale;
    },
    set shipScale(scale: number) {
      shipScale = scale;
    },
  };
  /** The waters, opened once off the first frame: the held map's tint, the friendly ships and the sea's water names. */
  const waters = watersOnce(roomModule, world);
  let opened: OpenWaters | null = null;
  waters.then(
    (open) => {
      opened = open;
      playing.heldMap?.setWaters(open.map);
    },
    (error: unknown) => console.error('the waters could not be opened:', error),
  );
  const traffic = new FriendlyTraffic(waters, SEA_SHIPS);
  const waterHere = () => waterOf(scene.land?.swell, playing.landmass.heightAt);
  const charting = new Charting(
    continents,
    (id) => openLandmass(land, world, rmbText, id),
    (opened: Landmass) => {
      playing.landmass = opened;
      playing.drawers.release();
      playing.drawers = drawersOn(opened);
      scene.setLand(opened.view, terrainFor(opened));
      playing.sea?.setLandmass(opened);
    },
  );

  /** A way that failed, tried again with Enter. */
  let retry: (() => void) | null = null;
  /** Runs `work` behind the veil showing `words`; the veil lifts once it is done and the ground has come. A failure
   *  stays on the veil, and Enter tries it again. */
  const behindVeil = (words: string, work: () => Promise<void>) => {
    retry = null;
    [playing.ready, playing.waited] = [false, 0];
    hud.veil(words);
    work()
      .then(() => {
        playing.ready = true;
      })
      .catch((error: unknown) => {
        const why = error instanceof Error ? error.message : String(error);
        hud.veil(`${words} failed: ${why}. Press Enter to try again.`);
        retry = () => behindVeil(words, work);
      });
  };

  const travel = (happening: Happening, work: () => Promise<void>) => {
    const after = next(playing.flow, happening);
    if (after === playing.flow || after.mode !== 'loading') return;
    playing.flow = after;
    hud.menu(null);
    document.exitPointerLock();
    behindVeil(after.words, work);
  };

  /** Leaves wherever the player was: death's grey goes with them. */
  const leaveHere = () => {
    canvas.classList.remove('dead');
  };

  const goFoot = async (node: NodeInfo, facing: number, seas = playing.heldMap?.difficulty) => {
    leaveHere();
    playing.foot?.leave();
    playing.foot = null;
    playing.sea?.leaveRoom();
    playing.foot = await Foot.enter(footContext, node, facing, seas);
  };

  const goSea = async () => {
    leaveHere();
    playing.foot?.leave();
    playing.foot = null;
    if (!playing.sea) {
      const plan = playing.landmass.plan;
      const social = playing.landmass.nodes[0]?.centre ?? [0, 0];
      const [from, through] = plan ? [plan.centre, plan.harbour ?? social] : [social, social];
      const anchorage = offshore(playing.landmass.heightAt, from, through);
      // The ship first lies facing the city, so the view over it looks at the island.
      const heading = bearingTo(anchorage, from);
      playing.sea = new Sea(
        playing.landmass,
        continents.map((each) => each.outline),
        {
          waterline: sloop.waterline,
          marks: new MarkView(gpu),
          shown: (hull) => shipModels.shown(hull),
          warm: () => Promise.all(HULL_NAMES.map((name) => shipModels.load(HULL_NAMES.indexOf(name)))),
        },
        anchorage,
        heading,
        footContext,
      );
      const { waterAt, ports, facts } = seaWatersOf(await waters, world);
      playing.sea.waterAt = waterAt;
      playing.sea.facts = facts;
      playing.seaWord = new SeaWord(ports, facts);
    }
    playing.sea.cameAboard();
    // The held map's coasts are worked out behind the veil, not on its first raising.
    mapOf();
    await enterSea(playing.heldMap?.difficulty ?? 'normal');
  };

  /** The sea room a voyage at `seas` sails in, joined: online the server's at that difficulty; playing alone, the same
   *  room in the page. */
  let seaSeas: Difficulty = 'normal';
  const enterSea = async (seas: Difficulty) => {
    seaSeas = seas;
    const level = (['normal', 'elite', 'abyss'] as const).indexOf(seas);
    await playing.sea?.enterRoom(
      rooms
        ? async (snapshot) => RoomConnection.open(rooms(seaRoomName(seas)), snapshot, undefined, await session)
        : async (snapshot) =>
            LocalRoom.openSea(await roomModule, world.layoutText, snapshot, undefined, portsOf(world.cities), level),
    );
  };

  const firstNode = playing.landmass.nodes.find((node) => node.id === start.node) ?? playing.landmass.nodes[0];
  if (!firstNode) throw new Error(`${start.name} has no place to arrive at`);
  if (playing.flow.mode === 'loading')
    behindVeil(playing.flow.words, () => goFoot(firstNode, arrivalFacing(firstNode, playing.landmass.plan, null)));

  const landAt = (id: string) => {
    discovered.nodes([id]);
    const landing = playing.sea?.landingOf(id);
    const node = playing.landmass.nodes.find((each) => each.id === id);
    if (!landing || !node || !playing.sea) return;
    const from = playing.sea.position;
    travel({ kind: 'land', node: id, name: landing.name }, () =>
      goFoot(node, arrivalFacing(node, playing.landmass.plan, from)),
    );
  };

  /** Joins a company member where they play: a node of this landmass at their seas, the ship left where she lies. */
  const joinAt = (place: string): string | null => {
    // Only on foot or on deck with nothing else under way: never under the map, on the way to the helm, walking the
    // deck, landing, or while another landmass opens.
    const free = (playing.flow.mode === 'foot' || playing.flow.mode === 'sea') && !playing.flow.menu;
    if (!free || playing.heldMap?.shown || playing.mapWanted || playing.sea?.aboard.active || charting.busy)
      return 'You are in their company. Choose Go to them once nothing else is under way.';
    // As other games keep travel out of a fight, and the fallen respawn before they go anywhere.
    if (playing.flow.mode === 'sea' && playing.sea?.fight)
      return 'You are in their company. Go to them once the fight is over.';
    if (playing.flow.mode === 'foot' && playing.foot?.fallen)
      return 'You are in their company. Go to them once you respawn.';
    const where = nodeOfRoom(place);
    const node = where && playing.landmass.nodes.find((each) => each.id === where.id);
    if (!where || !node)
      return place === 'sea' ? 'They are at sea: meet them where they land.' : 'They are across the sea.';
    const facing = arrivalFacing(node, playing.landmass.plan, null);
    discovered.nodes([node.id]);
    travel({ kind: 'join', node: node.id, name: node.name }, () => goFoot(node, facing, where.seas));
    return null;
  };

  const syncMenu = () => {
    const resume = { label: 'Resume', run: () => change({ kind: 'back' }) };
    if (playing.flow.mode === 'foot' && playing.flow.menu && playing.foot) {
      const home = { label: 'Return to ship', run: () => travel({ kind: 'return-to-ship' }, goSea) };
      hud.menu({ title: playing.foot.node.name, choices: [resume, home] });
    } else if (playing.flow.mode === 'sea' && playing.flow.menu) {
      const landfall = playing.sea?.landfall;
      const label = landfall?.kind === 'dock' ? `Dock at ${landfall.port}` : 'Go ashore';
      hud.menu({ title: 'At sea', choices: landfall ? [resume, { label, run: () => goAshore() }] : [resume] });
    } else hud.menu(null);
  };

  /** Moves the flow on for something that needs no veil, and shows its menu. */
  const change = (happening: Happening) => {
    playing.flow = next(playing.flow, happening);
    if ((playing.flow.mode === 'foot' || playing.flow.mode === 'sea') && playing.flow.menu) document.exitPointerLock();
    syncMenu();
  };

  /** Docks or goes ashore as the sea offers: the view flies up over the island's side to choose a landing. */
  const goAshore = () => {
    // While another landmass opens, the worker's landmass is not the one the landings would be on.
    if (playing.flow.mode !== 'sea' || !playing.sea || charting.busy) return;
    if (playing.flow.menu) change({ kind: 'back' });
    if (!playing.sea.goAshore()) return;
    change({ kind: 'view-landings' });
    discovered.nodes(playing.sea.landings);
  };

  /** The map is wanted: it is raised once the view stands at the helm. */
  const mapOf = (): HeldMap => {
    if (playing.heldMap) return playing.heldMap;
    const field = coastField(
      continents.map((each) => each.outline),
      CHART_COLUMNS,
      CHART_ROWS,
      CHART_CELL_M,
    );
    const made = new HeldMap(
      gpu,
      field,
      store,
      (to) => playing.sea?.planTo(to) ?? { ok: false, why: 'No ship.' },
      hudRoot,
    );
    // Lowered, the view goes back up; a destination set, the ship sets sail as it does.
    // A voyage set at another difficulty sails in that difficulty's sea room.
    made.onLowered((sail) => {
      playing.sea?.fromHelm();
      if (!sail) return;
      const sea = playing.sea;
      if (!sea || made.difficulty === seaSeas) sea?.sailTo(sail);
      else {
        sea.leaveRoom();
        void enterSea(made.difficulty).then(() => sea.sailTo(sail));
      }
    });
    if (opened) made.setWaters(opened.map);
    playing.heldMap = made;
    return made;
  };

  /** Takes the view down to the ship's helm, where the map is raised. */
  const openMap = () => {
    if (playing.flow.mode !== 'sea' || playing.flow.menu || !playing.sea || playing.heldMap?.shown) return;
    playing.mapWanted = playing.sea.toHelm();
  };

  /** Opens Manage over her deck, or closes it. */
  const manage = () => {
    if (playing.flow.mode === 'sea' && !playing.flow.menu && !playing.sea?.aboard.walking) playing.sea?.manage();
  };

  /** The player leaves the helm to walk her deck, the pointer held to look round as on foot. */
  const leaveHelm = () => {
    if (playing.flow.mode === 'sea' && !playing.flow.menu && playing.sea?.leaveHelm()) input.lock();
  };

  /** Takes the helm again, at her wheel. */
  const takeHelm = () => {
    if (playing.flow.mode === 'sea' && !playing.flow.menu) playing.sea?.takeHelm();
  };

  /** Stops the voyage under way, or resumes the one stopped. */
  const stopOrResume = () => {
    if (playing.flow.mode !== 'sea' || playing.flow.menu || !playing.sea || playing.sea.aboard.active) return;
    if (playing.sea.resumable) playing.sea.resume();
    else playing.sea.stop();
  };

  const choose = (id: string) => {
    if (playing.flow.mode === 'sea' && !playing.flow.menu) playing.sea?.sailToMark(id);
    if (playing.flow.mode !== 'landing' || !playing.sea) return;
    if (playing.flow.chosen === id) landAt(id);
    else if (playing.sea.landingOf(id)) {
      change({ kind: 'choose', node: id });
      playing.sea.chosen = id;
    }
  };

  const respawn = () => (playing.foot ?? playing.sea?.boarding.foot)?.respawn();

  hud.onMark(choose);
  hud.onRespawn(respawn);
  hud.onPace((direction) => playing.sea?.stepPace(direction));
  hud.onVoyage(stopOrResume);
  hud.onMap(openMap);
  hud.onLandfall(goAshore);
  hud.onManage(manage);
  hud.onLeaveHelm(leaveHelm);
  hud.onTakeHelm(takeHelm);
  // The Ship tab's papers: her voyage only while she is at sea.
  const shipNow = () =>
    shipPanelOnceBuilt(
      builtSloop(),
      sloop.waterline,
      playing.flow.mode === 'sea' ? playing.sea : null,
      playing.seaWord?.keptOf(playing.sea?.sighted ?? null) ?? null,
    );
  const gearHere = () => (playing.flow.mode === 'foot' ? (playing.foot?.gear ?? null) : null);
  startGearWindow(hudRoot, link, gearHere, shipNow, joinAt);
  addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if (event.repeat) return;
    if (playing.heldMap?.shown) {
      if (key === 'escape') playing.heldMap.escape();
      else if (key === 'enter') playing.heldMap.setSail();
      return;
    }
    // On the way down to the helm, Escape turns back before the map is raised.
    if (key === 'escape' && playing.mapWanted && playing.sea?.helmView) {
      playing.mapWanted = false;
      playing.sea.fromHelm();
      return;
    }
    if (deckKey(key, playing.flow.mode === 'sea' && !playing.flow.menu ? playing.sea : null, respawn)) return;
    if (key === 'enter' && retry) retry();
    else if (key === 'm') change({ kind: 'menu' });
    else if (key === 'escape' && playing.flow.mode === 'landing') {
      playing.sea?.backToSea();
      change({ kind: 'back' });
    } else if (key === 'escape') change({ kind: 'back' });
    else if (key === 'enter' && playing.flow.mode === 'sea' && !playing.flow.menu && playing.sea?.chaseChosen()) return;
    else if (key === 'l' || (key === 'enter' && playing.flow.mode === 'sea' && !playing.flow.menu)) goAshore();
    else if (key === ' ' && playing.flow.mode === 'sea') stopOrResume();
    else if (key === 'n') openMap();
    else if (key === 'b') manage();
    else if (key === 'h') leaveHelm();
    else if (key === 'r' && playing.flow.mode === 'sea' && playing.sea?.aboard.active)
      playing.sea.sighted?.ask('repair');
    else if (key === 'e' && playing.flow.mode === 'sea' && playing.sea?.fight && fightAsk(playing.sea) === 'board')
      input.lock();
    else if (key === 'e' && playing.sea?.aboard.walking) takeHelm();
    else if (key === 'e' && playing.flow.mode === 'foot') playing.foot?.use();
    else if (key === 'enter' && playing.flow.mode === 'landing' && playing.flow.chosen) landAt(playing.flow.chosen);
    else if (key === 'enter' && playing.flow.mode === 'foot') respawn();
    else if ((key === '[' || key === ']') && playing.flow.mode === 'sea') playing.sea?.stepPace(key === ']' ? 1 : -1);
  });
  canvas.addEventListener('click', () => {
    if (playing.flow.mode === 'foot' && !playing.flow.menu && playing.foot?.standing.kind !== 'dead' && !input.locked)
      input.lock();
    if (
      playing.flow.mode === 'sea' &&
      !playing.flow.menu &&
      !input.locked &&
      (playing.sea?.aboard.walking || playing.sea?.boarding.onDeck)
    )
      input.lock();
  });
  seaPointer(canvas, input, {
    // On a struck ship's deck the pointer and the wheel are the fight's on foot.
    atSea: () => playing.flow.mode === 'sea' && !playing.flow.menu && !playing.sea?.boarding.onDeck,
    sea: () => playing.sea,
    map: () => playing.heldMap,
  });
  startFrames(
    {
      ...{ gpu, canvas, hud, input, scene, walker, firstPerson, footView, shipModels, figureView, traffic },
      ...{ discovered, charting, seaWeather: boot.seaWeather, seaView: boot.seaView, waterline: sloop.waterline },
      ...{ builtSloop, closeSource, waterHere, syncMenu, travel, goFoot, mapOf },
    },
    playing,
  );
}
