// The game's frames: each one steps and draws the mode the flow is in, on foot or at sea, with the friendly ships round
// the eye, the held map over the sea while it is up, and the veil lifted once a place has loaded. `game.ts` boots the
// pieces and keeps the travel; this draws what they hold, as `Playing` has it this frame.
import type { FirstPerson } from '../firstperson/firstPerson.ts';
import type { Gpu } from '../gpu.ts';
import type { CardAt } from '../player/cards.ts';
import type { Action, Input, InputFrame } from '../player/input.ts';
import type { Walker } from '../player/walker.ts';
import type { ShipModels } from '../ships/shipModels.ts';
import type { seaWeatherOn } from '../water/seaWeather.ts';
import type { Ambience } from './audio/ambience/ambience.ts';
import type { HelmMap } from './helmMap.ts';
import { musiciansOf } from './audio/music/band.ts';
import type { MusicDirector } from './audio/music/director.ts';
import type { Charting } from './charting.ts';
import type { Discovered } from './discovered.ts';
import type { DungeonDrawers } from './dungeonDrawers.ts';
import type { FigureView } from './figureView.ts';
import { type Flow, type Happening, next } from './flow.ts';
import type { Foot } from './foot.ts';
import type { FootView } from './footView.ts';
import type { FriendlyTraffic, FriendlyWater } from './friendlyShips.ts';
import { gearScreenOpen } from './gearWindow.ts';
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
import type { AfterStory } from './welcome/afterStory.ts';
import type { StoryHost } from './prologue/host.ts';
import { FIRST_NODE } from './gameBoot.ts';
import { type GateWay, gateWay } from './gates.ts';
import { mooredShips } from './moorings.ts';
import { HULLS } from '../water/hullMask.ts';

/** The region every island lies in. */
const REGION = 'The Pale Expanse';
/** The veil stays down until the exact ground round the player has come, or this long. */
const GROUND_WAIT_S = 20;

/** What the frames read and change as the game goes: the flow, the mode's own pieces, the open landmass and its
 *  drawers, whether the place behind the veil is ready and how long it has waited, whether the map is wanted, and the
 *  size ships are drawn at this frame. */
export interface Playing {
  flow: Flow;
  foot: Foot | null;
  sea: Sea | null;
  /** The held map at the helm, made when it is first asked for. */
  readonly helmMap: HelmMap;
  /** The story's last moment, played on foot once it has ended, and the elder's welcome after it. */
  readonly after: AfterStory;
  /** The way through the gate the player stands in, if any. */
  through: GateWay | null;
  seaWord: SeaWord | null;
  landmass: Landmass;
  drawers: LandDrawers;
  ready: boolean;
  waited: number;
  shipScale: number;
}

/** What the frames draw with: the page's views and pieces, made once, and the travel they may call on. */
export interface FrameParts {
  readonly gpu: Gpu;
  readonly canvas: HTMLCanvasElement;
  readonly hud: Hud;
  readonly input: Input;
  readonly scene: GameScene;
  readonly walker: Walker;
  readonly firstPerson: FirstPerson;
  readonly footView: FootView;
  readonly shipModels: ShipModels;
  readonly figureView: FigureView;
  readonly traffic: FriendlyTraffic;
  readonly discovered: Discovered;
  readonly charting: Charting<Landmass>;
  readonly seaWeather: ReturnType<typeof seaWeatherOn>;
  readonly seaView: { reachM: number };
  readonly waterline: Parameters<typeof showSeaHud>[3]['waterline'];
  readonly builtSloop: () => SloopBuild | null;
  readonly closeSource: Parameters<GameScene['keepClose']>[1];
  readonly waterHere: () => FriendlyWater;
  readonly syncMenu: () => void;
  readonly travel: (happening: Happening, work: () => Promise<void>) => void;
  readonly goFoot: (node: NodeInfo, facing: number) => Promise<void>;
  /** The story that opens the game, if it does, and the arrival at the first node it hands the player to. */
  readonly story: StoryHost | null;
  readonly arrive: () => void;
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
}

/** Starts the frames: one each animation frame, at most one waiting on the GPU while the next is drawn. */
export function startFrames(parts: FrameParts, playing: Playing): void {
  const { gpu, canvas, hud, input, scene, walker, firstPerson, footView, traffic, discovered, charting } = parts;
  let [last, clock] = [performance.now(), 0];
  let wasWalking = false;

  /** The drawers that stand on the open landmass this frame (`standingDrawers`). */
  const standing = (ships: readonly SeaShip[], figures: readonly CardAt[], fight?: { under: Drawer; over: Drawer }) => {
    const entrances = playing.foot && parts.dungeons.entrancesOf(playing.foot);
    const drawn = standingDrawers(
      {
        ...playing.drawers,
        isles: parts.isles,
        shipModels: parts.shipModels,
        figureView: parts.figureView,
        seaFight: playing.sea?.fight,
      },
      ships,
      figures,
      fight,
    );
    // A patrol's dungeon entrances stand with the land, before the fight's blood and the figures.
    return entrances ? [entrances, ...drawn] : drawn;
  };

  const showStanding = (shown: Standing) => {
    hud.reach(shown);
    // Death's grey on the canvas is the one mark of it, once death is told (a fall plays out in colour first):
    // leaving a place takes it off.
    const [dead, wasDead] = [greyed(shown), canvas.classList.contains('dead')];
    if (dead && !wasDead) document.exitPointerLock();
    if (dead !== wasDead) canvas.classList.toggle('dead', dead);
  };

  const footFrame = (here: Foot, controls: InputFrame, seconds: number, size: { width: number; height: number }) => {
    const { flow } = playing;
    const paused = flow.mode !== 'foot' || flow.menu || gearScreenOpen();
    const aspect = size.width / Math.max(1, size.height);
    const shown = here.frame(controls, seconds, clock, { paused, hands: controls.locked, aspect });
    const listener = [walker.player.body.x, walker.player.body.y] as const;
    parts.music.onFoot(parts.world, here.node, shown.fight, seconds, { musicians: musiciansOf(here.folk), listener });
    parts.ambience.onFoot(here.node, playing.landmass, shown.shot, here.folk);
    const { body } = walker.player;
    if (!here.dungeon) {
      scene.keepClose([body.x, body.y], parts.closeSource, () => undefined);
      scene.keepMiddle([body.x, body.y], parts.closeSource);
    }
    const hands = walker.inFirstPerson
      ? (encoder: GPUCommandEncoder, view: GPUTextureView, over: Overlay) => firstPerson.draw(encoder, view, over)
      : undefined;
    const viewport = { width: canvas.clientWidth, height: canvas.clientHeight };
    parts.isleFrame();
    const fight = footView.frame(here, shown, seconds, { size, viewport, groundAt: here.groundAt });
    const water = parts.waterHere();
    const fleet = traffic.onFoot(shown.shot.eye, water, seconds, clock);
    // The story's last moment, on foot once the veil is gone: the stranger before the player, then the elder's welcome.
    const met = playing.after.frame(
      shown.shot,
      viewport,
      seconds,
      clock,
      walker.you,
      flow.mode !== 'foot',
      here.node,
      paused,
    );
    const carried = { left: walker.you.dress.outfit.left, feet: [body.x, body.y, body.z] as const };
    const moorings = here.node.kind === 'social' ? (playing.landmass.plan?.social.moorings ?? []) : [];
    const moored = mooredShips(moorings, clock, water);
    const more = { after: hands, hulls: [...moored.hulls, ...fleet.hulls].slice(0, HULLS), carried };
    const ships = [...moored.ships, ...fleet.ships];
    if (here.dungeon) parts.dungeons.draw(here, shown, size, clock, fight, hands);
    else scene.draw(shown.shot, size, clock, seconds, standing(ships, [...shown.figures, ...met], fight), more);
    showStanding(shown.standing);
    hud.place(here.node.name, placeWords(here.node, here.roomName));
    // As E's other use, a gate takes no one while a menu is up, the player is down or in a dungeon.
    const gated = paused || here.fallen || here.dungeon;
    playing.through = gated ? null : gateWay(playing.landmass, here.node.id, [body.x, body.y]);
    hud.passageOffer(playing.through?.offer ?? null);
    hud.hints(shown.hints);
    hud.marks([]);
    hideSeaHud(hud);
    hud.note(here.roomNote);
    // A dungeon's floor is all there before the veil lifts; a node waits for the exact ground round the player.
    return !!here.dungeon || scene.closeReady(body.x, body.y);
  };

  const seaFrame = (here: Sea, controls: InputFrame, seconds: number, size: { width: number; height: number }) => {
    const { flow, helmMap } = playing;
    const held = (action: Action) => (controls.held(action) ? 1 : 0);
    const viewport = { width: canvas.clientWidth, height: canvas.clientHeight };
    const paused = flow.mode !== 'sea' || flow.menu || gearScreenOpen();
    // The sea by weather round the ship, reaching as far as the view last looked; the land's swell until it opens.
    const swell = parts.seaWeather()?.follow(here.position, parts.seaView.reachM, seconds) ?? scene.land?.swell;
    // The helm's keys, as in a fight, while the sea's own view is up: the map's and the deck's keys are their own.
    if (!paused && !helmMap.shown)
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
    playing.shipScale = shown.shipScale;
    const herDeck = here.boarding.drawn(footView, seconds, { size, viewport });
    for (const stir of shown.stirs) scene.stir(stir);
    parts.music.atSea(here, seconds);
    const voyage = { ...shown, deck: here.view.helmView || here.aboard.active, feet: walker.player.body };
    parts.ambience.atSea(playing.landmass, here.position, shown.shot, voyage, seconds);
    // Back at the helm, or called to it, the pointer is the player's again.
    const afoot = here.aboard.walking || here.boarding.onDeck;
    if (wasWalking && !afoot && input.locked) document.exitPointerLock();
    wasWalking = afoot;
    // What a lookout sees is discovered as the ship sails.
    if (flow.mode === 'sea') discovered.lookout(here.position);
    const free = flow.mode === 'sea' && !flow.menu;
    const dpr = canvas.width / Math.max(1, canvas.clientWidth);
    const hands = walker.you.dress.outfit.armour.gauntlets ?? null;
    const mapDraw = helmMap.frame(here, seconds, { free, viewport, dpr, hands }, discovered);
    // The map at the helm, or the player's own hands walking its deck in first person, over the finished picture.
    const after =
      mapDraw ??
      (shown.firstPerson
        ? (encoder: GPUCommandEncoder, view: GPUTextureView, over: Overlay) => firstPerson.draw(encoder, view, over)
        : undefined);
    parts.seaView.reachM = Math.max(0, shown.shot.eye[2]) * 6;
    const fleet = traffic.atSea(shown, parts.waterHere(), seconds, clock);
    // Walking its deck, what the player carries lights round them as it does ashore.
    const carried = shown.feet ? { left: walker.you.dress.outfit.left, feet: shown.feet } : undefined;
    const more = { hulls: fleet.hulls, after, focus: shown.focus, atSea: true, carried, ...(swell ? { swell } : {}) };
    const drawers = standing([...shown.ships, ...fleet.ships], shown.figures, herDeck);
    scene.draw(shown.shot, size, clock, seconds, drawers, more);
    showStanding(here.boarding.standing ?? { kind: 'inside' });
    const { landmass, seaWord } = playing;
    // The status chip keeps the state alone; the watch's and the sea's word are DFO's toasts. In a fight the fight's
    // own messages say who is sighted, so the watch's last line gives way.
    const watched = here.watchWords && !here.fight ? [here.watchWords] : [];
    const notices = [...watched, ...(seaWord?.notices(here.sighted, clock) ?? [])];
    showSeaHud(hud, here, shown, {
      landing: flow.mode === 'landing',
      onSea: flow.mode === 'sea' && !flow.menu,
      island: ISLANDS[landmass.id],
      region: REGION,
      clock,
      build: parts.builtSloop,
      waterline: parts.waterline,
      charting: charting.busy,
      friendly: fleet.marks,
      notices,
    });
    // Only while sailing: a landing chosen, or under way, stands on the landmass open now.
    charting.tick(here.position, landmass.id, seconds, flow.mode === 'sea');
    parts.isleFrame();
    const ashore = flow.mode === 'sea' ? seaWord?.ashore(landmass) : null;
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
    const left = host.frame(controls, seconds, size);
    if (!left) return;
    playing.after.storyEnded(left.epilogue);
    walker.you.dress = left.dress;
    playing.flow = next(playing.flow, { kind: 'story-ended', node: FIRST_NODE, name: 'Overlook' });
    parts.arrive();
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
    const { flow, foot, sea, ready } = playing;
    const shown = flow.mode === 'loading' ? (ready ? flow.then : null) : flow;
    let settled = true;
    playing.shipScale = 1;
    if (shown?.mode === 'story' && parts.story) storyFrame(parts.story, controls, seconds, size);
    else if (shown?.mode === 'foot' && foot) settled = footFrame(foot, controls, seconds, size);
    else if ((shown?.mode === 'sea' || shown?.mode === 'landing') && sea) seaFrame(sea, controls, seconds, size);
    parts.ambience.frame(seconds);
    if (playing.flow.mode === 'loading' && playing.ready) {
      // Wall time, not the world's: a slow machine waits no longer for the ground than a quick one.
      playing.waited += elapsed;
      if (settled || playing.waited > GROUND_WAIT_S) {
        playing.flow = next(playing.flow, { kind: 'loaded' });
        hud.veil(null);
        parts.syncMenu();
      }
    }
    // At most one frame waits on the GPU while the next is drawn, so a GPU that falls behind slows the frames.
    const previous = inFlight;
    inFlight = gpu.device.queue.onSubmittedWorkDone();
    void previous.then(() => requestAnimationFrame(frame));
  };
  requestAnimationFrame(frame);
}
