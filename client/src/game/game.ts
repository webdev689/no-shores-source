import type { Gpu } from '../gpu.ts';
import type { Difficulty } from '../heldmap/heldMap.ts';
import type { Point2 } from '../overworld/ground.ts';
import type { Placed } from '../player/figures.ts';
import { Input } from '../player/input.ts';
import { newPlayer } from '../player/player.ts';
import { askedView } from '../player/playerCamera.ts';
import { Walker } from '../player/walker.ts';
import { LocalRoom } from '../network/localRoom.ts';
import { RoomConnection } from '../network/roomConnection.ts';
import { MarkView } from '../ships/markView.ts';
import { HULL_NAMES } from '../ships/hulls.ts';
import { Ambience } from './audio/ambience/ambience.ts';
import { MusicDirector } from './audio/music/director.ts';
import { Charting } from './charting.ts';
import { arriving, type Happening, next } from './flow.ts';
import { Foot, type FootContext } from './foot.ts';
import { HelmMap } from './helmMap.ts';
import { foesAsked } from './foesAsked.ts';
import { FriendlyTraffic, waterOf } from './friendlyShips.ts';
import { Isles } from './isles.ts';
import { islePlanWorker } from '../network/islePlans.ts';
import { ISLE_MANIFEST, islePacksPrefix } from '../islands/isleManifest.ts';
import { GROWTH_ROLES, IslesView } from '../islands/isleView.ts';
import { IslesNature } from './isleNature.ts';
import type { Drawer } from './scene.ts';
import type { DungeonDoor } from './isleLaw.ts';
import { IsleLanding, ashoreOn, ashoreWords } from './isleVisit.ts';
import type { IsleHeld } from './isles.ts';
import { FootView } from './footView.ts';
import { bootGame, FIRST_NODE, SEA_SHIPS } from './gameBoot.ts';
import { afterStoryOn } from './welcome/afterStory.ts';
import { FIRST_LOOK, keptLook, plainDressOf } from './prologue/look.ts';
import { askedArrival } from './gates.ts';
import { installQaViews } from './qaViews.ts';
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
import { landfallWords, offshore } from './seaLaw.ts';
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
  const boot = await bootGame(gpu, canvas, hudRoot, () => shipScale);
  const { hud, story, rooms, link, session, world, landTexts, start, discovered, roomModule, land, scene } = boot;
  const { shipModels, figureView, forge, firstPerson, store, sloop, movement, drawersOn, terrainFor, builtSloop } =
    boot;
  const { continents } = world;
  const input = new Input(canvas);
  const dress = plainDressOf(keptLook(localStorage) ?? FIRST_LOOK);
  const you: Placed = { id: 1, x: 0, y: 0, z: 0, facing: 0, dress, anim: 'idle', frame: null, spin: false };
  // Arriving, the camera stands far enough back to show the whole figure against the view it arrives to.
  // The address may ask for another (`&view=`), to picture a place from first person or nearer.
  const arrivalView = askedView(location.search) ?? { firstPerson: false, distance: 4.5, shown: 4.5 };
  const walker = new Walker({ ...newPlayer(movement, 0, 0), view: arrivalView }, you, firstPerson, forge);
  /** The ground the camera keeps over: an island's where one stands higher than the land's. */
  const groundAt = (x: number, y: number): number | null => {
    const [isle, land] = [islesView.groundAt(x, y), scene.groundAt(x, y)];
    return isle === null ? land : land === null ? isle : Math.max(isle, land);
  };
  const footContext: FootContext = {
    movement,
    land,
    walker,
    forge,
    rooms,
    roomModule,
    groundAt: (x, y) => groundAt(x, y),
    // Under `npm run dev` only, `?spawn=` asks a room in the page for foes to fight.
    foesAsked: import.meta.env.DEV ? foesAsked(location.search) : [],
    session,
  };
  const footView = new FootView(gpu, hudRoot, forge, [hud.hintList]);
  const music = new MusicDirector();
  const closeSource = (left: number, top: number, step: number, samples: number) =>
    land.ground(left, top, step, samples, samples);
  const landmass = boot.landmass;
  const playing: Playing = {
    flow: boot.flow,
    foot: null,
    sea: null,
    after: afterStoryOn(hudRoot, forge, (x, y) => scene.groundAt(x, y)),
    through: null,
    helmMap: new HelmMap({
      ...{ gpu, store, root: hudRoot, outlines: continents.map((each) => each.outline) },
      sea: () => playing.sea,
      sail: (to, seas) => sailFor(to, seas),
      made: (map) => {
        if (opened) map.setWaters(opened.map);
      },
    }),
    seaWord: null,
    landmass,
    drawers: drawersOn(landmass),
    ready: false,
    waited: 0,
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
      playing.helmMap.held?.setWaters(open.map);
    },
    (error: unknown) => console.error('the waters could not be opened:', error),
  );
  const traffic = new FriendlyTraffic(waters, SEA_SHIPS);
  /** The sea's islands the room tells of, and a landing at one under way. */
  const isles = new Isles(
    islePlanWorker(roomModule),
    continents.map((each) => each.climate),
  );
  const isleLanding = new IsleLanding();
  // The islands' trees, shrubs and grass are the land's own plants (`isleNature.ts`), not the islands' modules.
  const islesView = new IslesView(gpu, ISLE_MANIFEST, islePacksPrefix(location.search), undefined, GROWTH_ROLES);
  const islesNature = new IslesNature(gpu);
  const islesDrawer: Drawer = {
    castInto: (pass, fromEye, shot, time, shadow) => {
      islesView.castInto(pass, fromEye, shot, time, shadow);
      islesNature.castInto(pass, fromEye, shot, time, shadow);
    },
    drawInto: (pass, fromEye, shot, time, shadow) => {
      islesView.drawInto(pass, fromEye, shot, time, shadow);
      islesNature.drawInto(pass, fromEye, shot, time, shadow);
    },
  };
  /** The island the player stands on, drawn though the sea no longer tells of it. */
  let ashore: IsleHeld | null = null;
  const waterHere = () => waterOf(scene.land?.swell, playing.landmass.heightAt);
  const charting = new Charting(
    continents,
    (id) => openLandmass(land, world, landTexts, id),
    (opened: Landmass) => {
      playing.landmass = opened;
      playing.drawers.release();
      playing.drawers = drawersOn(opened);
      scene.setLand(opened.view, terrainFor(opened), boot.biomeOf(opened.id));
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

  /** Leaves wherever the player was: death's grey and the story's last moment go with them. */
  const leaveHere = () => {
    canvas.classList.remove('dead');
    playing.after.leave();
  };

  const goFoot = async (node: NodeInfo, facing: number, seas = playing.helmMap.difficulty) => {
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
      playing.sea.isles = isles;
      playing.sea.facts = facts;
      playing.seaWord = new SeaWord(ports, facts);
    }
    playing.sea.cameAboard();
    // The held map's coasts are worked out behind the veil, not on its first raising.
    void playing.helmMap.made;
    await enterSea(playing.helmMap.difficulty ?? 'normal');
  };

  /** The sea room a voyage at `seas` sails in, joined: online the server's at that difficulty; playing alone, the same
   *  room in the page. */
  let seaSeas: Difficulty = 'normal';
  let switching = Promise.resolve();
  const enterSea = async (seas: Difficulty) => {
    seaSeas = seas;
    const level = (['normal', 'elite', 'abyss'] as const).indexOf(seas);
    await playing.sea?.enterRoom(
      rooms
        ? async (snapshot) => RoomConnection.open(rooms(seaRoomName(seas)), snapshot, undefined, await session())
        : async (snapshot) =>
            LocalRoom.openSea(await roomModule, world.layoutText, snapshot, undefined, portsOf(world.cities), level),
    );
  };

  const arrived = playing.landmass.nodes.find((node) => node.id === start.node) ?? playing.landmass.nodes[0];
  if (!arrived) throw new Error(`${start.name} has no place to arrive at`);
  const { node: firstNode, facing: firstFacing } = askedArrival(arrived, location.search);
  const arrive = () =>
    behindVeil(playing.flow.mode === 'loading' ? playing.flow.words : '', () =>
      goFoot(firstNode, firstFacing ?? arrivalFacing(firstNode, playing.landmass.plan, null)),
    );
  if (playing.flow.mode === 'loading') arrive();

  installQaViews(window, location.search, !rooms, { node: () => playing.foot?.node ?? null, arrive: goFoot, walker });
  const landAt = (id: string) => {
    discovered.nodes([id]);
    const landing = playing.sea?.view.landingOf(id);
    const node = playing.landmass.nodes.find((each) => each.id === id);
    if (!landing || !node || !playing.sea) return;
    const from = playing.sea.position;
    travel({ kind: 'land', node: id, name: landing.name }, () =>
      goFoot(node, arrivalFacing(node, playing.landmass.plan, from)),
    );
  };

  /** Whether the player may be taken elsewhere: on foot or on deck with nothing else under way, never under the map,
   *  on the way to the helm, walking the deck, landing, or while another landmass opens. */
  const free = () =>
    (playing.flow.mode === 'foot' || playing.flow.mode === 'sea') &&
    !playing.flow.menu &&
    !playing.helmMap.busy &&
    !playing.sea?.aboard.active &&
    !charting.busy;

  /** Joins a company member where they play: a node of this landmass at their seas, the ship left where it lies. */
  const joinAt = (place: string): string | null => {
    if (!free()) return 'You are in their company. Choose Go to them once nothing else is under way.';
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
      const choices = landfall ? [resume, { label: landfallWords(landfall), run: () => goAshore() }] : [resume];
      hud.menu({ title: 'At sea', choices });
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
    const landfall = playing.sea.landfall;
    if (landfall?.kind === 'isle') {
      isleLanding.begin(playing.sea, isles, landfall.id);
      return;
    }
    if (!playing.sea.goAshore()) return;
    change({ kind: 'view-landings' });
    discovered.nodes(playing.sea.view.landings);
  };

  /** The dungeon behind an island's door: the dungeons' trip takes its room and door from here. */
  // shortcut: the second stack's trip takes it (`trips.enterSeaDungeon(door.room, { x, y, facing })`); until then, said.
  const enterDungeon = (_door: DungeonDoor) => hud.note('The way down is not open yet.');

  /** The player walks ashore on an island, the veil saying why: anchored off it, or washed up on its beach. The sea
   *  is left only once the island's room has opened: one that does not (it faded, or the sea no longer holds it)
   *  leaves the player aboard, told so. */
  const goIsle = (held: IsleHeld, words: string) => {
    const continent = continents[held.seen.continent]?.id ?? '';
    travel({ kind: 'isle', node: held.seen.id.toString(), words }, async () => {
      const word = playing.sea?.sighted?.isleWord(held.seen.id) ?? null;
      let foot: Foot;
      try {
        foot = await ashoreOn(footContext, held, { word, continent, seas: seaSeas }, enterDungeon);
      } catch (error) {
        // Still aboard, at sea: the veil lifts on the ship, as no load is under way.
        playing.flow = { mode: 'sea', menu: false };
        hud.veil(null);
        hud.note(`You could not go ashore: ${error instanceof Error ? error.message : String(error)}.`);
        return;
      }
      leaveHere();
      playing.foot?.leave();
      playing.sea?.leaveRoom();
      ashore = held;
      playing.foot = foot;
    });
  };

  /** Each frame at sea: the islands the room tells of kept and built, and a landing walked ashore once the ship anchors or
   *  a beaten player washed up on a found island's beach. */
  const isleFrame = () => {
    // Off the island's beach, at sea or in a node, the island is the sea's again; under the veil ashore it is kept.
    if (playing.flow.mode === 'sea' || (playing.foot && !playing.foot.node.id.startsWith('isle-'))) ashore = null;
    const shown = isles.shown(ashore);
    islesView.show(shown);
    islesNature.show(shown);
    const sea = playing.sea;
    if (!sea || playing.flow.mode !== 'sea') return;
    // An island new in sight bends the voyage ahead round it.
    if (isles.update(sea.sighted?.islands ?? [])) sea.bendRound();
    const found = isles.all().filter((each) => each.seen.found);
    playing.helmMap.held?.setIsles(
      found.map(({ seen }) => ({ at: seen.at, kind: seen.kind, isle: seen.kind !== 'cove' })),
    );
    // Ashore only once nothing else is under way: the map put away, the deck left, the fight's view panned home.
    if (!free() || sea.fight) return;
    const washed = playing.seaWord?.washedIsle ?? null;
    if (washed !== null) {
      // Washed up on a found island: ashore once the page has built it, or never if the room no longer tells of it.
      const held = isles.byId(washed);
      const told = isles.all().some((each) => each.seen.id === washed);
      if (held || !told) playing.seaWord?.takeWashedIsle();
      if (held) {
        isleLanding.cancel();
        goIsle(held, ashoreWords(held, true));
      }
      return;
    }
    const anchored = isleLanding.arrived(sea, isles);
    if (anchored) goIsle(anchored, ashoreWords(anchored));
  };

  /** A destination set on the map: the ship sails for it. A voyage set at another difficulty sails in that
   *  difficulty's sea room; mid-fight the ship stays in the room it fights in; one switch at a time, each waiting for
   *  the last. */
  const sailFor = (sail: Point2, seas: Difficulty) => {
    const sea = playing.sea;
    if (!sea || sea.fight || seas === seaSeas) sea?.sailTo(sail);
    else {
      seaSeas = seas;
      switching = switching
        .then(() => {
          sea.leaveRoom();
          return enterSea(seas);
        })
        .then(() => sea.sailTo(sail))
        // A room that will not open leaves the ship sailing alone, as a link lost does.
        .catch(() => sea.sailTo(sail));
    }
  };

  /** Takes the view down to the ship's helm, where the map is raised. */
  const openMap = () => {
    if (playing.flow.mode === 'sea' && !playing.flow.menu && playing.sea) playing.helmMap.open(playing.sea);
  };

  /** Opens Manage over its deck, or closes it. */
  const manage = () => {
    if (playing.flow.mode === 'sea' && !playing.flow.menu && !playing.sea?.aboard.walking) playing.sea?.manage();
  };

  /** The player leaves the helm to walk its deck, the pointer held to look round as on foot. */
  const leaveHelm = () => {
    if (playing.flow.mode === 'sea' && !playing.flow.menu && playing.sea?.leaveHelm()) input.lock();
  };

  /** Takes the helm again, at its wheel. */
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
    const choice = playing.sea.view.choose(id, playing.flow.chosen);
    if (choice === 'land') landAt(id);
    else if (choice === 'choose') change({ kind: 'choose', node: id });
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
  // The Ship tab's papers: its voyage only while it is at sea.
  const shipNow = () =>
    shipPanelOnceBuilt(
      builtSloop(),
      sloop.waterline,
      playing.flow.mode === 'sea' ? playing.sea : null,
      playing.seaWord?.keptOf(playing.sea?.sighted ?? null) ?? null,
    );
  /** Going through the gate the player stands in to the node it leads to. */
  const goThrough = () => {
    const way = playing.through;
    // A gate shut on a locked node takes no one: its offer only says so.
    if (way?.happening && playing.flow.mode === 'foot') travel(way.happening, () => goFoot(way.node, way.facing));
  };
  hud.onPassage(goThrough);
  const gearHere = () => (playing.flow.mode === 'foot' ? (playing.foot?.gear ?? null) : null);
  startGearWindow(hudRoot, link, gearHere, shipNow, joinAt, () => playing.flow.mode === 'story');
  addEventListener(
    'keyup',
    (event) => void (playing.flow.mode === 'story' && story?.key(event.key.toLowerCase(), false)),
  );
  addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if (event.repeat) return;
    if (playing.flow.mode === 'story') return void story?.key(key, true);
    if (playing.helmMap.key(key)) return;
    if (deckKey(key, playing.flow.mode === 'sea' && !playing.flow.menu ? playing.sea : null, respawn)) return;
    if (key === 'enter' && retry) retry();
    else if (key === 'm') change({ kind: 'menu' });
    else if (key === 'escape' && playing.flow.mode === 'landing') {
      playing.sea?.view.backToSea();
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
    else if (key === 'e' && playing.flow.mode === 'foot' && !playing.flow.menu && playing.through) goThrough();
    else if (key === 'e' && playing.flow.mode === 'foot') playing.foot?.use();
    else if (key === 'enter' && playing.flow.mode === 'landing' && playing.flow.chosen) landAt(playing.flow.chosen);
    else if (key === 'enter' && playing.flow.mode === 'foot') respawn();
    else if ((key === '[' || key === ']') && playing.flow.mode === 'sea') playing.sea?.stepPace(key === ']' ? 1 : -1);
  });
  canvas.addEventListener('click', () => {
    if (playing.flow.mode === 'story' && story?.wantsPointer && !input.locked) input.lock();
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
    map: () => playing.helmMap.held,
  });
  const ambience = new Ambience(world);
  if (story) {
    const game = { gpu, canvas, hudRoot, hud, scene, figures: figureView, footView, forge, firstPerson, land };
    const more = { movement, walker, input, roomModule, marks: new MarkView(gpu), link, sloop, music };
    const lands = { home: { landmass, drawers: playing.drawers }, closeSource, ambience };
    story.begin({ ...game, ...more, ...lands }, () => {
      playing.flow = arriving(FIRST_NODE, 'Overlook');
      arrive();
    });
  }
  startFrames(
    {
      ...{ gpu, canvas, hud, input, scene, walker, firstPerson, footView, shipModels, figureView, traffic },
      ...{ discovered, charting, seaWeather: boot.seaWeather, seaView: boot.seaView, waterline: sloop.waterline },
      ...{ builtSloop, closeSource, waterHere, syncMenu, travel, goFoot, isleFrame, groundAt, story, arrive },
      isles: islesDrawer,
      ...{ world, music, ambience },
    },
    playing,
  );
}
