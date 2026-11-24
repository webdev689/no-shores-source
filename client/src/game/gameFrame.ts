// The game's frames: each one steps and draws the mode the flow is in, on foot or at sea, with the friendly ships round
// the eye, the held map over the sea while it is up, and the veil lifted once a place has loaded. `game.ts` boots the
// pieces and keeps the travel; this draws what they hold, as `Playing` has it this frame.
import { placingStrip } from './guild/decorPlacing.ts';
import type { FirstPerson } from '../firstperson/firstPerson.ts';
import type { Gpu } from '../gpu.ts';
import type { CardAt } from '../player/cards.ts';
import { IDLE, type Input, type InputFrame, axis, handsFree } from '../player/input.ts';
import type { Walker } from '../player/walker.ts';
import type { ShipModels } from '../ships/shipModels.ts';
import type { seaWeatherOn } from '../water/seaWeather.ts';
import type { Ambience } from './audio/ambience/ambience.ts';
import type { HelmMap } from './helmMap.ts';
import { musiciansOf } from './audio/music/band.ts';
import type { MusicDirector } from './audio/music/director.ts';
import type { Charting } from './charting.ts';
import type { WorldShown } from './worldShown.ts';
import type { EventPropsDraw } from './eventPropsDraw.ts';
import type { DungeonDrawers } from './dungeonDrawers.ts';
import type { FigureView } from './figureView.ts';
import { type Flow, type Happening, next } from './flow.ts';
import { FrameGuard } from '../frameGuard.ts';
import { PERF, perfOn, PerfMeter } from '../perfMeter.ts';
import { autoChosen, heardFrame } from './renderScale.ts';
import type { Foot } from './foot.ts';
import { type Fallen, ReviveNotices } from './footRevive.ts';
import type { FootView } from './footView.ts';
import type { FriendlyTraffic, FriendlyWater } from './friendlyShips.ts';
import { contextOf, withoutTaken } from './gameKeys.ts';
import { gearScreenOpen } from './gearWindow.ts';
import { stripOf, withFollow, withMapKey } from './hints.ts';
import { runPlaceWords } from './breachWords.ts';
import { ofRun, releaseRunModules } from '../city/modules.ts';
import { FALLEN, refusedWords } from './toShip.ts';
import { binding } from './rebinding.ts';
import { leaveOffered } from './leaveHold.ts';
import { gearTakesKeys } from './gearScreen.ts';
import type { Drain } from './drain.ts';
import type { DrawnInterface } from './drawnInterface.ts';
import { creationOpen } from './prologue/creation.ts';
import type { Stack } from '../ui/stack.ts';
import type { Hud } from './hud.ts';
import { greyed, ISLANDS, placeWords, type Standing } from './hudLaw.ts';
import type { LandDrawers } from './landDrawers.ts';
import type { Landmass } from './landmass.ts';
import { arrivalFacing } from './nodes.ts';
import type { Drawer, GameScene, Overlay } from './scene.ts';
import type { Sea } from './sea.ts';
import type { SeaWord } from './seaWord.ts';
import { hideSeaHud, showSeaHud } from './seaHud.ts';
import type { SeaShip } from './seaShips.ts';
import type { SloopBuild } from './shipPanel.ts';
import { standingDrawers } from './standingDrawers.ts';
import type { NodeInfo } from './worldData.ts';
import { type AfterStory, clearOfEye, heldHud } from './welcome/afterStory.ts';
import type { Quests } from './quests/quests.ts';
import type { Lore } from './compendium/lore.ts';
import type { StoryHost } from './prologue/host.ts';
import { FIRST_NODE } from './gameBoot.ts';
import { TOLD_MS } from './tripBack.ts';
import { type GateWay, gateWay } from './gates.ts';
import { mooredShips } from './moorings.ts';
import type { ShipPeople } from './shipPeople.ts';
import { nodeCardsAt } from './nodeCards.ts';
import { keeperLit } from './overheadMarks.ts';
import { HULLS } from '../water/hullMask.ts';
import { chatAtSea, chatOpen, holdOnPlayer, platedPlayers, socialUp } from './social/social.ts';
import { uiScale } from '../ui/uiRenderer.ts';
import { drawnWhole, frameDrawn, setBehindVeil, standIns } from '../standIns.ts';

/** The region every island lies in. */
const REGION = 'The Pale Expanse';
/** The veil stays down until everything round the player is ready, or this long; and once it is, for this many frames
 *  more drawn whole under it, so the first frames' own work (pipelines made, pictures sent) is done unseen
 *  ([[One Loading Screen Covers Every Trip Until the Place Is Ready]]). */
const READY_WAIT_S = 20;

/** What the frames read and change as the game goes: the flow, the mode's own pieces, the open landmass and its
 *  drawers, whether the place behind the veil is ready and how long it has waited, whether the map is wanted, and the
 *  size ships are drawn at this frame. */
export interface Playing {
  flow: Flow;
  foot: Foot | null;
  sea: Sea | null;
  /** The held map at the helm, made when it is first asked for. */
  readonly helmMap: HelmMap;
  /** The story's last moment, played on foot once it has ended: the stranger's welcome to Overlook. */
  readonly after: AfterStory;
  /** The houses' roads, shown once the story and the welcome are past. */
  readonly quests: Quests;
  /** The lore found, toasted as each chapter is. */
  readonly lore: Lore;
  /** The way through the gate the player stands in, if any. */
  through: GateWay | null;
  seaWord: SeaWord | null;
  landmass: Landmass;
  /** Every zone of the world, the open landmass's and the rest, which the roads' waypoint is found over. */
  readonly zones: readonly NodeInfo[];
  drawers: LandDrawers;
  ready: boolean;
  waited: number;
  /** Why the player is not where their last trip went, shown until `until` (ms, `performance.now`). */
  told: { readonly words: string; readonly until: number } | null;
  shipScale: number;
}

/** What the frames draw with: the page's views and pieces, made once, and the travel they may call on. */
export interface FrameParts {
  readonly gpu: Gpu;
  readonly canvas: HTMLCanvasElement;
  readonly hud: Hud;
  /** The interface the game draws, its layers, and death's grey drawn under it. */
  readonly ui: DrawnInterface;
  readonly stack: Stack;
  readonly drain: Drain;
  readonly input: Input;
  readonly scene: GameScene;
  readonly walker: Walker;
  readonly firstPerson: FirstPerson;
  readonly footView: FootView;
  readonly shipModels: ShipModels;
  readonly figureView: FigureView;
  /** The public events' props, set from the event's view each frame on foot and emptied at sea. */
  readonly eventProps: EventPropsDraw;
  readonly traffic: FriendlyTraffic;
  /** The people aboard every other ship drawn, at sea and seen from land. */
  readonly crews: ShipPeople;
  readonly shown: WorldShown;
  readonly charting: Charting<Landmass>;
  readonly seaWeather: ReturnType<typeof seaWeatherOn>;
  readonly seaView: { reachM: number };
  readonly waterline: Parameters<typeof showSeaHud>[3]['waterline'];
  readonly builtSloop: () => SloopBuild | null;
  readonly closeSource: Parameters<GameScene['keepClose']>[1];
  readonly waterHere: () => FriendlyWater;
  /** The leave held through: back to the ship on the room's yes, or told why not. */
  readonly leave: () => void;
  readonly travel: (happening: Happening, work: () => Promise<void>) => void;
  readonly goFoot: (node: NodeInfo, facing: number) => Promise<void>;
  /** The story that opens the game, if it does, and the arrival at the first node it hands the player to: `resuming`,
   *  where they last left the overworld or a social space (`relog.ts`). */
  readonly story: StoryHost | null;
  readonly arrive: (resuming?: boolean) => void;
  /** The sea's islands kept, shown and walked ashore on, each frame; their drawer; and the ground the camera keeps
   *  over, the islands' with the land's. */
  readonly isleFrame: () => void;
  readonly isles: Drawer;
  readonly groundAt: (x: number, y: number) => number | null;
  /** The world the music hears a node of, the music and the ambience that play as the game goes. */
  readonly world: Parameters<MusicDirector['onFoot']>[0];
  readonly music: MusicDirector;
  readonly ambience: Ambience;
  /** A patrol's dungeon entrances among the land's drawers, and a dungeon drawn as its own scene. */
  readonly dungeons: DungeonDrawers;
  /** What a frame on foot heeds first (`startActivities`): true when the room's gate sent the player away, and nothing
   *  more of the place is drawn. */
  readonly heed: (here: Foot) => boolean;
}

/** Starts the frames: one each animation frame, at most one waiting on the GPU while the next is drawn. */
export function startFrames(parts: FrameParts, playing: Playing): void {
  const { gpu, canvas, hud, input, scene, walker, firstPerson, footView, traffic, charting } = parts;
  const { ui, stack, drain } = parts;
  let [last, clock] = [performance.now(), 0];
  let wasWalking = false;
  /** Whether the view was in the player's eyes before the land's held map took it there; null while it has not. */
  let eyesBeforeMap: boolean | null = null;

  /** The drawers that stand on the open landmass this frame (`standingDrawers`). */
  const standing = (ships: readonly SeaShip[], figures: readonly CardAt[], fight?: { under: Drawer; over: Drawer }) => {
    const entrances = playing.foot && parts.dungeons.entrancesOf(playing.foot);
    const drawn = standingDrawers(
      {
        ...playing.drawers,
        isles: parts.isles,
        shipModels: parts.shipModels,
        figureView: parts.figureView,
        props: parts.eventProps,
        seaFight: playing.sea?.fight,
      },
      ships,
      figures,
      fight,
    );
    // A patrol's dungeon entrances stand with the land, before the fight's blood and the figures.
    return entrances ? [entrances, ...drawn] : drawn;
  };

  const showStanding = (shown: Standing, fallen: Fallen | null = null) => {
    hud.reach(shown, fallen);
    // Death's grey over the world is the one mark of it, once death is told (a fall plays out in colour first) or as
    // the player falls in the fight: standing again, or leaving the place, takes it off. A fall in a fight keeps the
    // pointer, to look round while an ally comes; Respawn's key works either way.
    const [dead, wasDead] = [greyed(shown) || fallen !== null, drain.dead];
    if (greyed(shown) && !wasDead) document.exitPointerLock();
    drain.toward(dead);
  };
  /** Out of a Breach's run by any way (to another place on foot, or to the ship), its modules are let go, drawn and
   *  read. */
  const outOfRun = () => {
    parts.eventProps.forget(ofRun);
    releaseRunModules();
  };
  /** What the mount key says with no horse worn in the Mount slot. */
  const NO_HORSE = 'You have no horse.';
  /** The words that tell why the player is not where they went, or that the mount key found no horse, while they
   *  stand: said by the frame the key was pressed in, ashore or at sea. */
  const toldNow = () => {
    if (walker.takeNoHorse()) playing.told = { words: NO_HORSE, until: performance.now() + TOLD_MS };
    return playing.told && performance.now() < playing.told.until ? [playing.told.words] : [];
  };
  /** An ally down, a revive given or taken, a checkpoint reached: told over the middle of the view on foot. */
  const reviveNotices = new ReviveNotices();

  const footFrame = (here: Foot, controls: InputFrame, seconds: number, size: { width: number; height: number }) => {
    if (parts.heed(here)) return true;
    const { flow, helmMap } = playing;
    const paused = flow.mode !== 'foot' || gearScreenOpen() || socialUp();
    // Others see three dots over a player in a menu.
    here.fight.menuOpen = gearScreenOpen() || socialUp();
    const aspect = size.width / Math.max(1, size.height);
    // The land's held map is raised from the player's own eyes, and the view goes back as it was once it is lowered.
    const looking = helmMap.looking;
    if (looking !== (eyesBeforeMap !== null)) {
      const firstPerson = eyesBeforeMap ?? true;
      eyesBeforeMap = looking ? walker.player.view.firstPerson : null;
      walker.player = { ...walker.player, view: { ...walker.player.view, firstPerson } };
    }
    // While the stranger speaks her welcome no key moves or acts (Space moves her words on, `gameKeys`), and the view
    // is hers.
    const told = playing.after.holding;
    const turned = playing.after.takeTurn();
    // The figure kept still keeps its facing, so it is turned with the view.
    if (turned !== null) walker.player = { ...walker.player, yaw: turned, facing: turned };
    const heard = playing.after.heard(controls);
    // While she speaks the figures are drawn for the tour's eye (last frame's), not the player's own camera.
    const eye = playing.after.seen?.eye ?? null;
    const own = here.frame(heard, seconds, clock, { paused, looking, hands: handsFree(heard, paused), aspect, eye });
    const shown = { ...own, shot: playing.after.shot(own.shot, seconds) };
    // A public event's beat is the music's moment, its props the drawer's, its steps the tracker's.
    if (shown.sting) parts.music.moment(shown.sting);
    const listener = [walker.player.body.x, walker.player.body.y] as const;
    parts.music.onFoot(parts.world, here.node, shown.fight, seconds, { musicians: musiciansOf(here.folk), listener });
    // An outpost's structures and decoration are drawn as the events' props are.
    parts.eventProps.set(here.outpost?.props(shown.props, listener) ?? shown.props ?? []);
    parts.eventProps.hang(here.outpost?.cloth() ?? null);
    if (!here.run) outOfRun();
    // A Breach's run is heard as a dungeon is, under the ground.
    parts.ambience.onFoot(here.node, playing.landmass, shown.shot, here.folk, !!here.dungeon || !!here.run);
    const { body } = walker.player;
    if (!here.mapless) {
      scene.keepClose([body.x, body.y], parts.closeSource, () => undefined);
      scene.keepMiddle([body.x, body.y], parts.closeSource);
    }
    const viewport = { width: canvas.clientWidth, height: canvas.clientHeight };
    const mapDraw = helmMap.footFrame(seconds, {
      free: !paused && !here.fallen,
      viewport,
      dpr: canvas.width / Math.max(1, canvas.clientWidth),
      hands: walker.you.dress.outfit.armour.gauntlets ?? null,
      eyes: walker.inFirstPerson,
      at: [body.x, body.y],
      heading: walker.player.yaw,
      lit: (glyph) => keeperLit(here.gear?.gear ?? null, glyph, (counter) => playing.quests.wants(counter)),
    });
    // The held map, or the player's own hands in first person, over the finished picture; while she speaks the view
    // is the tour's, never through the player's eyes.
    const hands =
      mapDraw ??
      (walker.inFirstPerson && !told
        ? (encoder: GPUCommandEncoder, view: GPUTextureView, over: Overlay) => firstPerson.draw(encoder, view, over)
        : undefined);
    parts.isleFrame();
    const { quests } = playing;
    quests.hear(here.gear?.gear);
    playing.lore.hear(here.gear?.gear);
    quests.frame(seconds, playing.after.past, paused);
    // The roads' waypoint on the compass, step by step from where the player stands, and the ward a step defends
    // among the plates, as a companion's.
    const named = new Map(quests.roster.map((type) => [type.type, type.name]));
    const seen = [...here.fight.foes.values()].map((foe) => ({
      name: named.get(foe.type) ?? '',
      rank: foe.rank,
      at: [foe.view.x, foe.view.y] as const,
    }));
    const afoot = {
      on: 'land',
      node: here.node,
      at: [body.x, body.y],
      marked: null,
      foes: seen,
      inside: here.dungeon !== null,
      spent: here.gear?.gear?.scavenged ?? [],
    } as const;
    const guided = quests.guide(afoot, { nodes: playing.zones, layouts: playing.landmass.layouts });
    const ward = quests.wardPlate(parts.groundAt);
    const foes = ward ? [...shown.fight.foes, ward] : shown.fight.foes;
    // A Breach's Rewritten are marked so on their plates.
    const marked = new Set(here.held.breach?.marked.map((each) => each.player));
    const plated = platedPlayers(here.otherPlayers, [body.x, body.y, body.z]);
    const players = plated.map((each) => (marked.has(each.id) ? { ...each, marked: true } : each));
    const questShown = { ...shown, fight: { ...shown.fight, foes, questAt: guided.at, players } };
    const fight = footView.frame(here, questShown, seconds, { size, viewport, groundAt: here.groundAt });
    // Use held on another player opens their menu, where it does nothing else (a deed or a gate) and no menu or map is up.
    const offered = !paused && !looking && !here.fallen && !hud.usePrompt.showing && !playing.through;
    holdOnPlayer(footView.playerPlates, offered, heard.held('use'), clock, {
      width: size.width / uiScale(devicePixelRatio),
    });
    // The fight's crosshair, plates and compass give way to the map while it is up.
    if (looking) footView.hideDisplay();
    const water = parts.waterHere();
    const fleet = traffic.onFoot(shown.shot.eye, water, seconds, clock);
    // The story's last moment, on foot once the veil is gone: the stranger before the player, her welcome, and her
    // gift asked of this room.
    const met = playing.after.frame(shown.shot, viewport, seconds, clock, walker.you, flow.mode !== 'foot', {
      node: here.node,
      floor: here.floor,
      blocks: here.boxes,
      held: paused,
      gear: here.gear?.gear ?? null,
      ask: (asked) => here.gear?.ask(asked),
    });
    const carried = { left: walker.you.dress.outfit.left, feet: [body.x, body.y, body.z] as const };
    const moorings = here.node.kind === 'social' ? (playing.landmass.plan?.social.moorings ?? []) : [];
    const moored = mooredShips(moorings, clock, water);
    const more = {
      after: hands,
      hulls: [...moored.hulls, ...fleet.hulls].slice(0, HULLS),
      carried,
      drain: drain.share,
      dark: shown.dark,
    };
    const ships = [...moored.ships, ...fleet.ships];
    // Each material node as the forge draws it, standing while the room stands it for the player, or gathered.
    const nodes = nodeCardsAt(
      here.node.resources ?? [],
      here.gear?.gear ?? null,
      (x, y) => parts.groundAt(x, y) ?? body.z,
    );
    const walking = quests.cards(shown.shot.eye, clock, parts.groundAt);
    const crews = parts.crews.cards(ships, shown.shot, viewport.height, seconds, clock);
    // While she speaks, none but her and the player stands within reach of the tour's eye.
    const near = [...shown.figures, ...nodes, ...walking, ...crews];
    const cards = [...(eye ? clearOfEye(near, eye, here.ownFigure) : near), ...met];
    if (here.dungeon) parts.dungeons.draw(here, shown, size, clock, fight, hands, more.drain);
    else if (here.run) parts.dungeons.drawRun(shown, size, clock, fight, parts.eventProps, hands, more.drain);
    else scene.draw(shown.shot, size, clock, seconds, standing(ships, cards, fight), more);
    showStanding(shown.standing, here.fell);
    const run = here.run && runPlaceWords(here.run.plan, here.held.breach, here.run.tier);
    hud.place(here.node.name, run || placeWords(here.node, here.roomName, here.held.revives, here.held.darkness));
    // As E's other use, a gate takes no one while a menu or the held map is up, the player is down or in a dungeon.
    const gated = paused || looking || here.fallen || here.mapless;
    playing.through = gated ? null : gateWay(playing.landmass, here.node.id, [body.x, body.y]);
    hud.passageOffer(playing.through?.offer ?? null);
    // N raises the map on foot unless a menu is up, the player has fallen or is in a dungeon, as `openMap` has it.
    const mapless = paused || here.fallen || here.mapless;
    const placing = placingStrip();
    // Fallen in a Breach, the camera follows the company: its key, naming whom, is shown while anyone may be followed.
    const strip = here.followable !== null ? withFollow(shown.hints, here.followable) : shown.hints;
    hud.strip(looking ? stripOf('landMap') : (placing ?? (mapless ? strip : withMapKey(strip))));
    // The leave held through takes the player to their ship: not under a window, the sheet, the held map or the chat,
    // nor while she speaks; fallen, it says why not.
    const refused = here.fallen ? refusedWords(FALLEN) : null;
    const leaving = leaveOffered({ paused, sheet: hud.controls.open, map: looking, chat: chatOpen(), speaking: told });
    if (hud.leaving.frame(controls.held('leave'), leaving, refused, seconds)) parts.leave();
    // The quest's mark gives way to the map, as the fight's display does.
    hud.marks(looking ? [] : quests.marks(shown.shot, viewport, [body.x, body.y], parts.groundAt));
    // The tracker is set once a frame, so a public event's steps stand in it unblinking, in the quest's place.
    hud.tasks.show(shown.quest ?? quests.tracked);
    const nameOf = (id: number) => (here.fight.others.has(id) ? (here.otherPlayers.plateOf(id)?.name ?? '') : null);
    reviveNotices.hear(shown.fight.events, here.fight.player, nameOf, performance.now());
    hud.toast(...toldNow(), ...reviveNotices.lines(performance.now()), ...quests.toasts, ...playing.lore.toasts);
    heldHud(hud, footView, told);
    hideSeaHud(hud);
    hud.note(here.roomNote);
    // A dungeon's floor and a Breach's run are all there before the veil lifts; a node waits for the exact ground round
    // the player and its city, built a few steps a frame, whole.
    return here.mapless || (scene.closeReady(body.x, body.y) && playing.drawers.ready());
  };

  const seaFrame = (here: Sea, controls: InputFrame, seconds: number, size: { width: number; height: number }) => {
    const { flow, helmMap } = playing;
    const viewport = { width: canvas.clientWidth, height: canvas.clientHeight };
    const paused = flow.mode !== 'sea' || gearScreenOpen() || socialUp();
    // Her welcome is ashore only: a place left mid-welcome leaves nothing of the HUD set aside at sea.
    hud.quiet = false;
    chatAtSea(here.waterAt?.(here.position)?.name ?? null);
    // The sea by weather round the ship, reaching as far as the view last looked; the land's swell until it opens.
    const swell = parts.seaWeather()?.follow(here.position, parts.seaView.reachM, seconds) ?? scene.land?.swell;
    parts.eventProps.set([]);
    parts.eventProps.hang(null);
    outOfRun();
    // The helm's controls while the sea's own view is up: the map's and the deck's are their own, and a fight's its.
    if (!paused && !helmMap.shown) {
      const steer = axis(controls, 'steerLeft', 'steerRight');
      here.helm(steer, controls.pressed('sailOn'), controls.pressed('heaveTo'), seconds);
    }
    // The fight's keys and pointer are heard as they come (`fightControls`); its pad, each frame, and while paused only
    // what the pad lets go, so nothing it held stays held.
    const pad = input.padAlone;
    if (!here.boarding.onDeck)
      here.fight?.padFrame(paused ? { ...IDLE, released: (id) => pad.released(id) } : pad, seconds);
    const shown = here.frame({
      seconds,
      time: clock,
      viewport,
      turn: axis(controls, 'turnLeft', 'turnRight'),
      tilt: axis(controls, 'lookUp', 'lookDown'),
      swell,
      controls,
      paused,
    });
    playing.shipScale = shown.shipScale;
    // Alone the sea's word on the gear comes only here; online the room's connection hears it too.
    playing.quests.hear(playing.sea?.gear?.gear);
    playing.quests.frame(seconds, playing.after.past, paused);
    playing.lore.hear(playing.sea?.gear?.gear);
    hud.toast(...toldNow(), ...playing.quests.toasts, ...playing.lore.toasts);
    const herDeck = here.boarding.drawn(footView, seconds, { size, viewport });
    for (const stir of shown.stirs) scene.stir(stir);
    parts.music.atSea(here, seconds);
    const voyage = { ...shown, deck: here.view.helmView || here.aboard.active, feet: walker.player.body };
    parts.ambience.atSea(playing.landmass, here.position, shown.shot, voyage, seconds);
    // Back at the helm, or called to it, the pointer is the player's again.
    const afoot = here.aboard.walking || here.boarding.onDeck;
    if (wasWalking && !afoot && input.locked) document.exitPointerLock();
    wasWalking = afoot;
    const free = flow.mode === 'sea';
    const dpr = canvas.width / Math.max(1, canvas.clientWidth);
    const hands = walker.you.dress.outfit.armour.gauntlets ?? null;
    const mapDraw = helmMap.frame(here, seconds, { free, viewport, dpr, hands }, parts.shown);
    // The map at the helm, or the player's own hands walking its deck in first person, over the finished picture.
    const after =
      mapDraw ??
      (shown.firstPerson
        ? (encoder: GPUCommandEncoder, view: GPUTextureView, over: Overlay) => firstPerson.draw(encoder, view, over)
        : undefined);
    parts.seaView.reachM = Math.max(0, shown.shot.eye[2]) * 6;
    const fleet = traffic.atSea(shown, parts.waterHere(), {
      seconds,
      time: clock,
      taken: here.sighted?.taken ?? new Set(),
    });
    // Walking its deck, what the player carries lights round them as it does ashore.
    const carried = shown.feet ? { left: walker.you.dress.outfit.left, feet: shown.feet } : undefined;
    const more = {
      ...{ hulls: fleet.hulls, after, focus: shown.focus, atSea: true, carried, drain: drain.share, dark: shown.dark },
      ...(swell ? { swell } : {}),
    };
    const ships = [...shown.ships, ...fleet.ships];
    const crews = parts.crews.cards(ships, shown.shot, viewport.height, seconds, clock);
    const drawers = standing(ships, [...shown.figures, ...crews], herDeck);
    scene.draw(shown.shot, size, clock, seconds, drawers, more);
    // A boarder fallen on its deck is told so as on foot, Respawn with it.
    showStanding(here.boarding.standing ?? { kind: 'inside' }, here.boarding.foot?.fell ?? null);
    const { landmass, seaWord } = playing;
    // The status chip keeps the state alone; the watch's and the sea's word are DFO's toasts. In a fight the fight's
    // own messages say who is sighted, so the watch's last line gives way.
    const watched = here.watchWords && !here.fight ? [here.watchWords] : [];
    const notices = [...watched, ...(seaWord?.notices(here.sighted, clock) ?? [])];
    showSeaHud(hud, here, shown, {
      landing: flow.mode === 'landing',
      onSea: flow.mode === 'sea',
      island: ISLANDS[landmass.id],
      region: REGION,
      clock,
      build: parts.builtSloop,
      waterline: parts.waterline,
      charting: charting.busy,
      friendly: fleet.marks,
      notices,
      free: !input.locked && !paused,
      quests: playing.quests,
      chart: { nodes: playing.zones, layouts: landmass.layouts },
      past: playing.after.past,
    });
    // Only while sailing: a landing chosen, or under way, stands on the landmass open now.
    charting.tick(here.position, landmass.id, seconds, flow.mode === 'sea');
    parts.isleFrame();
    // Washed up, ashore only once the fight's view has panned home and the ship lies where the room moored it.
    const ashore = flow.mode === 'sea' && !here.fight ? seaWord?.ashore(landmass) : null;
    if (ashore)
      parts.travel(ashore.washUp, () =>
        parts.goFoot(ashore.node, arrivalFacing(ashore.node, playing.landmass.plan, null)),
      );
  };

  /** A frame of the story; once it ends, the player arrives at Overlook's social space in their own dress, the stranger
   *  with them if they played it through. */
  const storyFrame = (
    host: StoryHost,
    controls: InputFrame,
    seconds: number,
    size: { width: number; height: number },
  ) => {
    host.padFrame(input.padAlone, seconds);
    const left = host.frame(controls, seconds, size);
    // The story's player rides no horse and is told nothing of one: a press there is dropped with nothing said.
    walker.takeNoHorse();
    if (!left) return;
    playing.after.storyEnded(left.epilogue);
    walker.you.dress = left.dress;
    playing.flow = next(playing.flow, { kind: 'story-ended', node: FIRST_NODE, name: 'Overlook' });
    // One who played the story through arrives at Overlook, where its welcome waits; one back from the title resumes.
    parts.arrive(left.epilogue === null);
  };

  /** The GPU's work for the frame drawn last. */
  let inFlight = Promise.resolve();
  const guard = new FrameGuard();
  const meter = new PerfMeter(gpu.device, perfOn(location.search));
  PERF.current = meter;
  const frame = (now: number) => {
    meter.start(now, autoChosen());
    guard.run(() => step(now));
    const taken = meter.end();
    heardFrame(taken.intervalMs, taken.gpuMs);
    // At most one frame waits on the GPU while the next is drawn, so a GPU that falls behind slows the frames.
    const previous = inFlight;
    inFlight = gpu.device.queue.onSubmittedWorkDone();
    const again = () => requestAnimationFrame(frame);
    void previous.then(again, again);
  };
  const step = (now: number) => {
    const elapsed = (now - last) / 1000;
    const seconds = Math.min(0.1, elapsed);
    last = now;
    clock += seconds;
    drain.step(seconds);
    const windowUp = gearTakesKeys() || creationOpen() || socialUp();
    // The open chat's field has the keys as a window's would, and the pad plays nothing of the game's under it.
    const covered = socialUp() || chatOpen();
    // The sheet takes the keys and the pad but while it waits for one to bind, as a window does; while a control waits
    // to be bound, from the sheet or Settings, the interface hears nothing that would press behind it.
    const bound = binding();
    const tookWheel = ui.hear(seconds, !input.locked && !bound, (windowUp && !bound) || hud.controls.takesKeys);
    const top = hud.controls.open
      ? 'sheet'
      : gearTakesKeys()
        ? 'gear'
        : creationOpen()
          ? 'creation'
          : covered && 'menu';
    input.window(top || null);
    input.context = playing.flow.mode === 'story' && parts.story ? parts.story.context : contextOf(playing);
    const heard = withoutTaken(input.frame());
    hud.controls.frame(seconds, input.padButtons);
    // The wheel turned over the interface scrolls it, not the camera.
    const controls = tookWheel ? { ...heard, wheel: 0 } : heard;
    const size = { width: canvas.width, height: canvas.height };
    const { flow, foot, sea, ready } = playing;
    const shown = flow.mode === 'loading' ? (ready ? flow.then : null) : flow;
    // A trip's veil, or the black of a travel by the held map, which waits on the new waters too.
    setBehindVeil(flow.mode === 'loading' || !!sea?.travelling?.away.veil);
    let settled = true;
    playing.shipScale = 1;
    // A place's frame that throws leaves the rest of this one running, the interface and the veil's lift among it; it
    // is not settled, so the veil waits READY_WAIT_S at most.
    const placed = guard.run(() => {
      if (shown?.mode === 'story' && parts.story) storyFrame(parts.story, controls, seconds, size);
      else if (shown?.mode === 'foot' && foot) settled = footFrame(foot, controls, seconds, size);
      else if ((shown?.mode === 'sea' || shown?.mode === 'landing') && sea) seaFrame(sea, controls, seconds, size);
    });
    settled &&= placed;
    // Only on foot is there a place to leave: a hold under way goes with the place it was begun in.
    if (shown?.mode !== 'foot') hud.leaving.frame(false, false, null, seconds);
    parts.ambience.frame(seconds);
    ui.present(stack);
    // What stood in for the place this frame, asked every frame so none is carried into the next.
    const stoodIn = standIns();
    frameDrawn(!!shown && settled && stoodIn.length === 0);
    if (playing.flow.mode === 'loading' && playing.ready) {
      // Wall time, not the world's: a slow machine waits no longer for the place than a quick one.
      playing.waited += elapsed;
      const whole = drawnWhole();
      if (whole || playing.waited > READY_WAIT_S) {
        if (!whole)
          console.warn(`The veil lifted after ${READY_WAIT_S} s, ${stoodIn.join(', ') || 'the ground'} not ready.`);
        playing.flow = next(playing.flow, { kind: 'loaded' });
        hud.veil(null);
        // Why the player is not where they went stays its whole time once the veil has lifted.
        if (playing.told) playing.told = { ...playing.told, until: performance.now() + TOLD_MS };
        // The player arrives on foot as the veil lifts, so their arrival is seen.
        if (playing.flow.mode === 'foot') playing.foot?.arrive(clock);
      }
    }
  };
  requestAnimationFrame(frame);
}
