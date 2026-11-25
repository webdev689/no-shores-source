import type { Gpu } from '../gpu.ts';
import type { Difficulty } from '../heldmap/heldMap.ts';
import type { MapWater } from '../heldmap/watersWash.ts';
import { warmFlora } from '../nature/flora.ts';
import type { Point2 } from '../overworld/ground.ts';
import type { Placed } from '../player/figures.ts';
import { Input, keyUpNameOf } from '../player/input.ts';
import { newPlayer } from '../player/player.ts';
import { askedView } from '../player/playerCamera.ts';
import { Walker } from '../player/walker.ts';
import { RoomThread } from '../network/roomThread.ts';
import { RoomConnection } from '../network/roomConnection.ts';
import { MarkView } from '../ships/markView.ts';
import { HULL_NAMES } from '../ships/hulls.ts';
import { sailedShip } from './sailedShip.ts';
import { Ambience } from './audio/ambience/ambience.ts';
import { MusicDirector } from './audio/music/director.ts';
import { Charting } from './charting.ts';
import { arriving, type Flow, type Happening, next, onTheSea } from './flow.ts';
import { keepPlace, placeKept, placeNow, resume } from './relog.ts';
import { Foot, type FootContext } from './foot.ts';
import { enterBreachRun, enterDungeon } from './footEntries.ts';
import type { TripGame } from './dungeonTrips.ts';
import type { InBreach } from './breachView.ts';
import { DungeonDrawers } from './dungeonDrawers.ts';
import { startActivities } from './activityScreens.ts';
import { HelmMap } from './helmMap.ts';
import { foesAsked } from './foesAsked.ts';
import { FriendlyTraffic, waterOf } from './friendlyShips.ts';
import { shipPeopleOf } from './shipPeople.ts';
import { type IsleHeld, Isles } from './isles.ts';
import { islePlanWorker } from '../network/islePlans.ts';
import { ISLE_MANIFEST, islePacksPrefix } from '../islands/isleManifest.ts';
import { GROWTH_ROLES, IslesView } from '../islands/isleView.ts';
import { IslesNature } from './isleNature.ts';
import type { Drawer } from './scene.ts';
import { IsleLanding, ashoreOn, ashoreWords } from './isleVisit.ts';
import { FootView } from './footView.ts';
import { bootGame, SEA_SHIPS } from './gameBoot.ts';
import { AfterStory } from './welcome/afterStory.ts';
import { questsOn } from './quests/quests.ts';
import { Lore } from './compendium/lore.ts';
import { FIRST_LOOK, keptLook, plainDressOf } from './prologue/look.ts';
import { askedArrival } from './gates.ts';
import { installQaViews } from './qaViews.ts';
import { type Playing, startFrames } from './gameFrame.ts';
import { type Landmass, openLandmass } from './landmass.ts';
import { roomNow } from '../sky/worldClock.ts';
import { helmControls } from './helmControls.ts';
import { arrivalFacing, FIRST_NODE } from './nodes.ts';
import { gearScreenOpen, startGearWindow } from './gearWindow.ts';
import { inspectAgainst } from './social/social.ts';
import { rejoinOnGuild } from './footPlace.ts';
import { listenForControls } from './gameKeys.ts';
import { type OpenWaters, seaWatersOf, watersOnce } from './pageWaters.ts';
import { companyPlaces, nodeOfRoom, seaRoomName, startedAtSea } from './rooms.ts';
import { notYet } from './companyJoin.ts';
import { PassageGame } from './passages/passageGame.ts';
import { piecesDrawer } from './passages/pieceView.ts';
import { Sea } from './sea.ts';
import { sailOrTravel } from './seaTravel.ts';
import { SeaWord } from './seaWord.ts';
import { seaPointer } from './seaPointer.ts';
import { firstAnchorage } from './seaLaw.ts';
import { arrivalAt, type NodeInfo, portsOf } from './worldData.ts';
import { startTravel } from './travel.ts';
import { Drain } from './drain.ts';
import { returnToShip } from './toShip.ts';
import { speaking } from '../speech/dialogue.ts';

/**
 * The game: the player arrives in Overlook's social space, plays on foot, returns to their ship, sails the sea, views
 * an island's side and lands at a node, each through a veil while the place loads. This boots the pieces
 * (`gameBoot.ts`), keeps the travel and the player's actions, and starts the frames (`gameFrame.ts`); each mode is
 * its own module.
 */
export async function startGame(gpu: Gpu, canvas: HTMLCanvasElement): Promise<void> {
  // The size ships are drawn at this frame, which a ruin's wrecks are drawn at too: the sea's, true size on foot.
  let shipScale = 1;
  const boot = await bootGame(gpu, canvas, () => shipScale);
  const { hud, stack, ui, story, rooms, link, session, world, landTexts, start, shown, roomModule, land } = boot;
  const { scene, shipModels, figureView, forge, firstPerson, store, sloop, movement, drawersOn, terrainFor } = boot;
  const { builtHulls: hulls } = boot;
  const dungeons = new DungeonDrawers(gpu, figureView, boot.cityAssets, boot.biomeOf);
  const { continents } = world;
  const input = new Input(canvas, () => ui.typing);
  const dress = plainDressOf(keptLook(localStorage) ?? FIRST_LOOK);
  const you: Placed = { id: 1, x: 0, y: 0, z: 0, facing: 0, dress, anim: 'idle', frame: null, spin: false };
  // Arriving, the camera stands back to show the whole figure; the address may ask for another view (`&view=`).
  const arrivalView = askedView(location.search) ?? { firstPerson: false, distance: 4.5, shown: 4.5 };
  const walker = new Walker({ ...newPlayer(movement, 0, 0), view: arrivalView }, you, firstPerson, forge);
  /** The ground the camera keeps over: an island's where one stands higher than the land's. */
  const groundAt = (x: number, y: number): number | null => {
    const [isle, land] = [islesView.groundAt(x, y), scene.groundAt(x, y)];
    return isle === null ? land : land === null ? isle : Math.max(isle, land);
  };
  // The ways onto foot into a dungeon, a Breach's run and a patrol zone, each as `goInto` goes.
  const intoDungeon: TripGame['intoDungeon'] = (...into) => goInto(() => enterDungeon(footContext, ...into));
  const intoBreach = (into: InBreach) => goInto(() => enterBreachRun(footContext, into));
  const ontoPatrol: TripGame['ontoPatrol'] = (...onto) => goInto(() => Foot.enter(footContext, ...onto));
  // The activities: the dungeons' ways in and out, their screens, and the sea's word of gear.
  const { trips, screens, onFoot, heed } = startActivities(world.nodes, link, {
    foot: () => playing.foot,
    atSea: () => (onTheSea(playing.flow) ? (playing.sea?.gear?.gear ?? null) : undefined),
    travel: (happening, work) => travel(happening, work),
    tell: (words) => tell(words),
    module: roomModule,
    ...{ intoDungeon, intoBreach, ontoPatrol },
    ontoSea: () => goSea(), // out of a sea island's dungeon, back at the ship, not before the island's door
    drawers: dungeons,
  });
  /** The houses' roads: their tracker, lines, marks and offers at the keepers' counters. */
  const quests = questsOn(stack, () => link?.account?.id ?? null, forge, roomModule);
  const footContext: FootContext = {
    movement,
    land,
    walker,
    forge,
    rooms,
    roomModule,
    groundAt: (x, y) => groundAt(x, y),
    // Under `npm run dev` only, `?spawn=` asks a room playing alone for foes to fight.
    foesAsked: import.meta.env.DEV ? foesAsked(location.search) : [],
    session,
    trips: onFoot,
    usePrompt: hud.usePrompt,
    speak: (counter, ask) => quests.speak(counter, ask),
    passageUses: () => passages.uses(),
  };
  // The fight's display keeps clear of the HUD's hints, where the interface last laid them.
  const footView = new FootView(gpu, stack, forge, (drawn) => [hud.hintsBox(drawn)].filter((box) => box !== null));
  hud.onBesides(() => ({ ...footView.shown, speaking: speaking(), map: playing.helmMap.shown }));
  /** Death's grey over the world, drawn under the interface, and the music. */
  const [drain, music] = [new Drain(), new MusicDirector()];
  const closeSource = (left: number, top: number, step: number, samples: number) =>
    land.ground(left, top, step, samples, samples);
  const landmass = boot.landmass;
  const playing: Playing = {
    flow: boot.flow,
    foot: null,
    sea: null,
    after: new AfterStory(),
    quests,
    lore: new Lore(localStorage, () => link?.account?.id ?? null),
    through: null,
    helmMap: new HelmMap({
      ...{ gpu, store, stack, outlines: continents.map((each) => each.outline) },
      sea: () => playing.sea,
      sail: (to, seas, travel) => sailFor(to, seas, travel),
      shut: () => screens.seasShut(),
      made: (map) => {
        if (opened) map.setWaters(opened);
        map.regions.all = world.regions ?? [];
      },
      quest: () => quests.nodes,
    }),
    seaWord: null,
    landmass,
    zones: world.nodes,
    drawers: drawersOn(landmass),
    ready: false,
    waited: 0,
    told: null,
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
      playing.helmMap.held?.setWaters(open);
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
  /** The island the player stands on, drawn though the sea no longer tells of it, and the sea's word it opened on. */
  let [ashore, ashoreWord]: [IsleHeld | null, string | null] = [null, null];
  const waterHere = () => waterOf(scene.land?.swell, playing.landmass.heightAt);
  /** Draws the landmass `opened` in place of the one left, at sea and on land. */
  const showLandmass = (opened: Landmass) => {
    playing.landmass = opened;
    playing.drawers.release();
    playing.drawers = drawersOn(opened);
    scene.setLand(opened.view, terrainFor(opened), boot.biomeOf(opened.id));
    playing.sea?.setLandmass(opened);
  };
  const charting = new Charting(
    continents,
    (id) => openLandmass(land, world, landTexts, id),
    showLandmass,
    // Its flora fetched ahead, so its land opens without waiting on the network.
    (id) => {
      const biome = boot.biomeOf(id);
      if (biome) void warmFlora(biome);
    },
  );

  /** Leaves wherever the player was: death's grey and the story's last moment go with them. */
  const leaveHere = () => {
    drain.toward(false);
    playing.after.leave();
  };
  /** Leaves wherever the player was for the place `entering` stands them in. */
  const goInto = async (entering: () => Promise<Foot>) => {
    leaveHere();
    playing.foot?.leave();
    playing.foot = null;
    playing.sea?.leaveRoom();
    // The held map's coasts are worked out behind the veil, not on its first raising on land.
    void playing.helmMap.made;
    playing.foot = await entering();
    if (!playing.foot.dungeon) dungeons.forget();
    // The rain stops under whatever a body meets overhead there: a roof, a ceiling, an arch.
    scene.sky.shelterUnder(playing.foot.boxes);
  };
  const goFoot = (node: NodeInfo, facing: number, seas = playing.helmMap.difficulty, guild?: string | null) =>
    goInto(() => Foot.enter(footContext, node, facing, seas, undefined, guild));

  const goSea = async (start?: { readonly anchorage: Point2; readonly heading: number }) => {
    leaveHere();
    playing.foot?.leave();
    playing.foot = null;
    scene.sky.shelterUnder([]);
    if (!playing.sea) {
      // The ship first lies facing the city, so the view over it looks at the island.
      const { anchorage, heading } = start ?? firstAnchorage(playing.landmass);
      playing.sea = new Sea(
        playing.landmass,
        continents.map((each) => each.outline),
        {
          waterline: sloop.waterline,
          marks: new MarkView(gpu),
          shown: (hull) => shipModels.shown(hull),
          way: (hull) => hulls()?.[hull]?.way ?? 1,
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
    dungeons.forget(); // once aboard, as `goInto` once arrived: a failed return's way back finds the dungeon drawn
  };

  /** The sea room a voyage at `seas` sails in, joined: online the server's at that difficulty; playing alone, the same
   *  room in the rooms' worker. */
  let seaSeas: Difficulty = 'normal';
  let switching = Promise.resolve();
  const enterSea = async (seas: Difficulty) => {
    seaSeas = seas;
    const [level, ports] = [(['normal', 'elite', 'abyss'] as const).indexOf(seas), portsOf(world.cities)];
    await playing.sea?.enterRoom(
      rooms
        ? async (snapshot, gear) =>
            RoomConnection.open(
              rooms(seaRoomName(seas)),
              snapshot,
              (said) => {
                gear(said);
                quests.hear(said);
              },
              await session(),
            )
        : async (snapshot, gear) =>
            RoomThread.openSea(await roomModule, world.layoutText, snapshot, undefined, ports, level, gear),
    );
  };

  /** Walks ashore on `held` on the sea's `word` for it; online its room is joined by its name alone. */
  const isleFoot = (held: IsleHeld, word: string | null) =>
    ashoreOn(
      footContext,
      held,
      { word, continent: continents[held.seen.continent]?.id ?? '', seas: seaSeas },
      trips.enterSeaDungeon,
    );
  const { travel, behindVeil, retry, tell, wayOut } = startTravel({
    ...{ playing, hud, goFoot, goSea, showLandmass, intoDungeon, intoBreach, ontoPatrol },
    ashore: () => ashore,
    backAshore: async (held) => {
      await goInto(() => isleFoot(held, ashoreWord));
      ashore = held;
    },
    // Overlook's landmass, opened where the player was on another.
    hubLand: async () => {
      const continent = arrivalAt(world, FIRST_NODE)?.continent;
      if (continent && continent !== playing.landmass.id)
        showLandmass(await openLandmass(land, world, landTexts, continent));
    },
  });
  const passages: PassageGame = new PassageGame({
    ...{ module: roomModule, context: footContext, goInto, tell, now: roomNow },
    ...{ foot: () => playing.foot, flow: () => playing.flow, land: () => playing.landmass },
    setFlow: (flow) => void (playing.flow = flow),
    setReady: (ready) => void ([playing.ready, playing.waited] = [ready, 0]),
    showDungeon: (layout, node) => dungeons.show(layout, node, undefined, () => passages.pieces()),
    companyPlaces: () => companyPlaces(link),
    ...{ fallback: wayOut, isles: islesView },
    modelled: (hollow, module) => (hollow ? islesView.hasModule('passage', module) : dungeons.hasPassageModule(module)),
  });
  const pieces = piecesDrawer(gpu, () => passages.pieces());
  const arrived = playing.landmass.nodes.find((node) => node.id === start.node) ?? playing.landmass.nodes[0];
  if (!arrived) throw new Error(`${start.name} has no place to arrive at`);
  const { node: firstNode, facing: firstFacing } = askedArrival(arrived, location.search);
  /** Arrives at Overlook behind the veil; or, `resuming` after the title, back where the player last left the
   *  overworld or a social space (`relog.ts`). */
  const arrive = (resuming = false) => {
    const overlook = () => goFoot(firstNode, firstFacing ?? arrivalFacing(firstNode, playing.landmass.plan, null));
    // Into the social space logging back in: its room stands the player where they left it (`?relog=1`).
    const ashore = (node: NodeInfo, facing: number | null) =>
      goInto(() =>
        Foot.enter(footContext, node, facing ?? arrivalFacing(node, playing.landmass.plan, null), 'normal', 'relog'),
      );
    const flow = (next: Flow) => void ((playing.flow = next), next.mode === 'loading' && hud.veil(next.words));
    const heard = () => session().then(() => link?.place);
    behindVeil(playing.flow.mode === 'loading' ? playing.flow.words : '', () =>
      resuming
        ? resume({
            ...{ online: rooms !== null, heard, kept: placeKept, nodes: playing.landmass.nodes, aboard: goSea },
            ...{ ashore, overlook, flow, passage: (room: string) => passages.resumeIn(room) },
          })
        : overlook(),
    );
  };
  // Where the player is, kept as they play, so a page playing alone comes back there (`relog.ts`).
  keepPlace(() => placeNow(playing, walker.player.body));
  if (playing.flow.mode === 'loading') arrive();

  const dead = () => playing.foot?.standing.kind === 'dead';
  installQaViews(window, location.search, !rooms, {
    node: () => playing.foot?.node ?? null,
    arrive: goFoot,
    sea: () => travel({ kind: 'return-to-ship' }, goSea),
    ...{ walker, dead, game: playing },
  });
  const landAt = (id: string) => {
    const landing = playing.sea?.view.landingOf(id);
    const node = playing.landmass.nodes.find((each) => each.id === id);
    if (!landing || !node || !playing.sea) return;
    const from = playing.sea.position;
    travel({ kind: 'land', node: id, name: landing.name }, () =>
      goFoot(node, arrivalFacing(node, playing.landmass.plan, from)),
    );
  };

  /** Whether the player may be taken elsewhere: on foot or on deck with nothing else under way, never under the map,
   *  on the way to the helm, walking the deck, sailing away to other waters, landing, or while another landmass opens. */
  const free = () =>
    (playing.flow.mode === 'foot' || playing.flow.mode === 'sea') &&
    !playing.helmMap.busy &&
    !playing.sea?.busy &&
    !charting.busy;

  /** Joins a company member where they play, a node of this landmass or its dungeon, at their seas; the ship stays. */
  const joinAt = (place: string): string | null => {
    const { flow, sea, foot } = playing;
    const fighting = flow.mode === 'sea' && !!sea?.fight;
    const yet = notYet(place, { free: free(), fighting, fallen: flow.mode === 'foot' && !!foot?.fallen });
    if (yet) return yet;
    const where = nodeOfRoom(place);
    const node = where && (startedAtSea(place) ? world : playing.landmass).nodes.find((each) => each.id === where.id);
    if (!where || !node)
      return place === 'sea' ? 'They are at sea: meet them where they land.' : 'They are across the sea.';
    const facing = arrivalFacing(node, playing.landmass.plan, null);
    if (where.dungeon !== null || where.run !== null) trips.join(node, place);
    else travel({ kind: 'join', node: node.id, name: node.name }, () => goFoot(node, facing, where.seas, where.guild));
    return null;
  };

  /** The leave held through: back to the ship on the room's yes, or told why not; a yes that comes once the player is
   *  on foot elsewhere (through a gate while the room answered) takes them nowhere. */
  const leave = () => {
    const from = playing.foot;
    returnToShip(from, () => void (playing.foot === from && travel({ kind: 'return-to-ship' }, goSea)), tell);
  };

  /** Moves the flow on for something that needs no veil. */
  const change = (happening: Happening) => void (playing.flow = next(playing.flow, happening));

  /** Docks or goes ashore as the sea offers: the view flies up over the island's side to choose a landing. */
  const goAshore = () => {
    // While another landmass opens, the worker's landmass is not the one the landings would be on.
    if (playing.flow.mode !== 'sea' || !playing.sea || charting.busy) return;
    const landfall = playing.sea.landfall;
    if (landfall?.kind === 'isle') {
      isleLanding.begin(playing.sea, isles, landfall.id);
      return;
    }
    if (!playing.sea.goAshore()) return;
    change({ kind: 'view-landings' });
  };

  /** The player walks ashore on an island, the veil saying why: anchored off it, or washed up on its beach. The sea
   *  is left once the island's room opens; if it does not, they stay aboard, told so, and join the sea room again. */
  const goIsle = (held: IsleHeld, words: string) => {
    travel({ kind: 'isle', node: held.seen.id.toString(), words }, async () => {
      const word = (await playing.sea?.sighted?.isleWord(held.seen.id)) ?? null;
      let foot: Foot;
      try {
        foot = await isleFoot(held, word);
      } catch (error) {
        // Still aboard, at sea: the veil lifts on the ship, as no load is under way.
        playing.flow = { mode: 'sea' };
        hud.veil(null);
        tell(`You could not go ashore: ${error instanceof Error ? error.message : String(error)}.`);
        if (rooms) await enterSea(seaSeas).catch(() => undefined); // the island's room may have taken the character
        return;
      }
      leaveHere();
      playing.foot?.leave();
      playing.sea?.leaveRoom();
      [ashore, ashoreWord] = [held, word];
      playing.foot = foot;
      scene.sky.shelterUnder(foot.boxes);
    });
  };

  /** Each frame at sea: the islands the room tells of kept and built, and a landing walked ashore once the ship anchors or
   *  a beaten player washed up on a found island's beach. */
  const isleFrame = () => {
    // Off the island's beach, at sea or in a node, the island is the sea's again; under the veil ashore it is kept.
    if (playing.flow.mode === 'sea' || (playing.foot && !playing.foot.node.id.startsWith('isle-'))) ashore = null;
    // A passage's hollow stands alone: the sea's islands, as the sea last told of them, are not drawn round it.
    const hollow = passages.isles();
    const shown = hollow.length > 0 ? hollow : isles.shown(ashore);
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

  /** A destination set on the map: the ship sails for it or travels there, in its difficulty's sea room (mid-fight the
   *  one it fights in), one switch at a time; a travel's cinematic asks whichever room holds the ship by its fade. */
  const sailFor = (sail: Point2, seas: Difficulty, travel: MapWater | null) => {
    const sea = playing.sea;
    if (sea) sailOrTravel(sea, sail, travel, () => !charting.waiting(sea.position, playing.landmass.id));
    if (!sea || sea.fight || seas === seaSeas) return;
    seaSeas = seas;
    switching = switching
      .then(() => {
        sea.leaveRoom();
        return enterSea(seas);
      })
      .then(() => void (sea.travelling ?? sea.sailTo(sail)))
      // A room that will not open leaves the ship sailing alone, and says so, as a link lost does.
      .catch(() => sea.sailAlone(sail));
  };

  const helm = { landAt, change, groundAt, passageMap: passages.map };
  const { openMap, manage, leaveHelm, takeHelm, stopOrResume, choose } = helmControls(playing, input, helm);

  const respawn = () => (playing.foot ?? playing.sea?.boarding.foot)?.respawn();

  hud.onMark((id) => (screens.playlist(id) ? undefined : choose(id))); // a Playlist's mark opens its screen
  hud.onRespawn(respawn);
  hud.onPace((direction) => playing.sea?.stepPace(direction));
  hud.onVoyage(stopOrResume);
  hud.onMap(openMap);
  hud.onLandfall(goAshore);
  hud.onManage(manage);
  hud.onLeaveHelm(leaveHelm);
  hud.onTakeHelm(takeHelm);
  const sailed = sailedShip(() => fed()?.gear, hulls);
  const hurtsKept = () => playing.seaWord?.keptOf(playing.sea?.sighted ?? null) ?? null;
  const shipNow = () => sailed.papers(playing.flow.mode === 'sea' ? playing.sea : null, hurtsKept());
  /** Going through the gate the player stands in to the node it leads to. */
  const goThrough = () => {
    const [way, here] = [playing.through, playing.foot?.node];
    // A gate shut on a locked node takes no one; an open one keeps the seas, as rooms judge where players come from.
    if (!way?.happening || playing.flow.mode !== 'foot' || !here) return;
    const join = () => goFoot(way.node, way.facing, playing.foot?.seas);
    if (!passages.ways.cross(way.happening, here.centre, way.node.centre, join)) travel(way.happening, join);
  };
  hud.onPassage(goThrough);
  rejoinOnGuild(
    () => (free() ? playing.foot : null),
    ({ node, seas }) => {
      const facing = arrivalFacing(node, playing.landmass.plan, null);
      travel({ kind: 'pass', node: node.id, name: node.name, into: true }, () => goFoot(node, facing, seas));
    },
  );
  // The story keeps gear only on the wreck, where it teaches the menu; elsewhere in it the menu rests.
  const storyMode = () => playing.flow.mode === 'story';
  const gearHere = () =>
    playing.flow.mode === 'foot' ? (playing.foot?.gear ?? null) : storyMode() ? (story?.gear ?? null) : null;
  const fed = () => sailed.heard(playing.flow.mode === 'sea' ? (playing.sea?.gear ?? null) : gearHere());
  /** A gate shut sends the player back to their ship; one who keeps none yet, to Overlook, where the Harbourmaster is. */
  const shutOut = (why: string) => {
    const home = sailed.shipless() ? playing.landmass.nodes.find((node) => node.id === FIRST_NODE) : undefined;
    if (!home || playing.foot?.node.id === FIRST_NODE) return travel({ kind: 'shut', why }, goSea);
    const ashore = { node: home.id, name: home.name };
    travel({ kind: 'shut', why, ashore }, () => goFoot(home, arrivalFacing(home, playing.landmass.plan, null)));
  };
  const fighting = () => footView.shown.fight;
  const resting = () => (storyMode() && !story?.gear) || Boolean(playing.sea?.travelling);
  stack.add(startGearWindow(fighting, link, gearHere, shipNow, joinAt, resting, fed, screens, playing.lore, hulls));
  inspectAgainst({ roomModule }, () => fed()?.gear ?? null); // at sea the sea's word on the player's own pieces
  stack.add(screens.layer); // the card E opens at a dungeon's entrance, over the menu's layer
  stack.add(passages.layer);
  addEventListener('keyup', (event) => void (playing.flow.mode === 'story' && story?.key(keyUpNameOf(event), false)));
  listenForControls({
    ...{ playing, input, ui, hud, story, retry, change, respawn, goAshore, stopOrResume, openMap },
    ...{ manage, leaveHelm, takeHelm, goThrough, landAt },
  });
  canvas.addEventListener('click', () => {
    // A click on what the game draws of its interface is the interface's, not a look round; while the menu is open
    // the pointer stays free, though the click comes before the interface has heard where it is.
    if (ui.takesPointer || gearScreenOpen()) return;
    if (playing.flow.mode === 'story' && story?.wantsPointer && !input.locked) input.lock();
    const { flow, foot, sea, helmMap } = playing;
    const onFoot = flow.mode === 'foot' && !helmMap.looking && foot?.standing.kind !== 'dead';
    const onDeck = flow.mode === 'sea' && (sea?.aboard.walking || sea?.boarding.onDeck);
    if (!input.locked && (onFoot || onDeck)) input.lock();
  });
  seaPointer(canvas, input, {
    // On a struck ship's deck the pointer and the wheel are the fight's on foot.
    atSea: () => playing.flow.mode === 'sea' && !playing.sea?.boarding.onDeck,
    overInterface: () => ui.takesPointer,
    sea: () => playing.sea,
    map: () => playing.helmMap.held,
  });
  const ambience = new Ambience(world);
  if (story) {
    const game = { gpu, canvas, stack, hud, scene, figures: figureView, footView, forge, firstPerson, land };
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
      ...{ ui, stack, drain, crews: shipPeopleOf(roomModule, forge) },
      ...{ shown, charting, seaWeather: boot.seaWeather, seaView: boot.seaView, waterline: sailed.waterline },
      ...{ builtShip: sailed.build, closeSource, waterHere, leave, travel, goFoot, isleFrame, groundAt, story, arrive },
      ...{ isles: islesDrawer, eventProps: boot.eventProps },
      ...{ world, music, ambience, dungeons, passages, pieces },
      heed: (here) => heed(here, shutOut, playing.flow.mode === 'foot'),
    },
    playing,
  );
}
