// The game's frames: each one steps and draws the mode the flow is in, on foot or at sea, with the friendly ships round
// the eye, the held map over the sea while it is up, and the veil lifted once a place has loaded. `game.ts` boots the
// pieces and keeps the travel; this draws what they hold, as `Playing` has it this frame.
import type { FirstPerson } from '../firstperson/firstPerson.ts';
import type { Gpu } from '../gpu.ts';
import type { HeldMap } from '../heldmap/heldMap.ts';
import type { CardAt } from '../player/cards.ts';
import type { Action, Input, InputFrame } from '../player/input.ts';
import type { Walker } from '../player/walker.ts';
import type { ShipModels } from '../ships/shipModels.ts';
import type { seaWeatherOn } from '../water/seaWeather.ts';
import type { Charting } from './charting.ts';
import type { Discovered } from './discovered.ts';
import type { FigureView } from './figureView.ts';
import { type Flow, type Happening, next } from './flow.ts';
import type { Foot } from './foot.ts';
import type { FootView } from './footView.ts';
import type { FriendlyTraffic, FriendlyWater } from './friendlyShips.ts';
import { gearScreenOpen } from './gearWindow.ts';
import type { Hud } from './hud.ts';
import { ISLANDS, placeWords, type Standing } from './hudLaw.ts';
import type { LandDrawers } from './landDrawers.ts';
import type { Landmass } from './landmass.ts';
import { arrivalFacing } from './nodes.ts';
import type { Drawer, GameScene } from './scene.ts';
import type { Sea } from './sea.ts';
import type { SeaWord } from './seaWord.ts';
import { showSeaHud } from './seaHud.ts';
import type { SeaShip } from './seaShips.ts';
import type { SloopBuild } from './shipPanel.ts';
import { standingDrawers } from './standingDrawers.ts';
import type { NodeInfo } from './worldData.ts';

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
  heldMap: HeldMap | null;
  seaWord: SeaWord | null;
  landmass: Landmass;
  drawers: LandDrawers;
  ready: boolean;
  waited: number;
  mapWanted: boolean;
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
  readonly mapOf: () => HeldMap;
}

/** Starts the frames: one each animation frame, at most one waiting on the GPU while the next is drawn. */
export function startFrames(parts: FrameParts, playing: Playing): void {
  const { gpu, canvas, hud, input, scene, walker, firstPerson, footView, traffic, discovered, charting } = parts;
  let [last, clock] = [performance.now(), 0];
  let wasWalking = false;

  /** The drawers that stand on the open landmass this frame (`standingDrawers`). */
  const standing = (ships: readonly SeaShip[], figures: readonly CardAt[], fight?: { under: Drawer; over: Drawer }) =>
    standingDrawers(
      { ...playing.drawers, shipModels: parts.shipModels, figureView: parts.figureView, seaFight: playing.sea?.fight },
      ships,
      figures,
      fight,
    );

  const showStanding = (shown: Standing) => {
    hud.reach(shown);
    // Death's grey on the canvas is the one mark of it: leaving a place takes it off.
    const [dead, wasDead] = [shown.kind === 'dead', canvas.classList.contains('dead')];
    if (dead && !wasDead) document.exitPointerLock();
    if (dead !== wasDead) canvas.classList.toggle('dead', dead);
  };

  const footFrame = (here: Foot, controls: InputFrame, seconds: number, size: { width: number; height: number }) => {
    const { flow } = playing;
    const paused = flow.mode !== 'foot' || flow.menu || gearScreenOpen();
    const aspect = size.width / Math.max(1, size.height);
    const shown = here.frame(controls, seconds, clock, { paused, hands: controls.locked, aspect });
    const { body } = walker.player;
    scene.keepClose([body.x, body.y], parts.closeSource, () => undefined);
    const hands = walker.inFirstPerson
      ? (encoder: GPUCommandEncoder, view: GPUTextureView) => firstPerson.draw(encoder, view, size.width, size.height)
      : undefined;
    const viewport = { width: canvas.clientWidth, height: canvas.clientHeight };
    const fight = footView.frame(here, shown, seconds, { size, viewport, groundAt: (x, y) => scene.groundAt(x, y) });
    const fleet = traffic.onFoot(shown.shot.eye, parts.waterHere(), seconds, clock);
    const more = { after: hands, hulls: fleet.hulls };
    scene.draw(shown.shot, size, clock, seconds, standing(fleet.ships, shown.figures, fight), more);
    showStanding(shown.standing);
    hud.place(here.node.name, placeWords(here.node));
    hud.hints(shown.hints);
    hud.marks([]);
    hud.seaBar(null);
    hud.note(here.roomNote);
    return scene.closeReady(body.x, body.y);
  };

  const seaFrame = (here: Sea, controls: InputFrame, seconds: number, size: { width: number; height: number }) => {
    const { flow, heldMap } = playing;
    const held = (action: Action) => (controls.held(action) ? 1 : 0);
    const viewport = { width: canvas.clientWidth, height: canvas.clientHeight };
    const paused = flow.mode !== 'sea' || flow.menu || gearScreenOpen();
    // The sea by weather round the ship, reaching as far as the view last looked; the land's swell until it opens.
    const swell = parts.seaWeather()?.follow(here.position, parts.seaView.reachM, seconds) ?? scene.land?.swell;
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
    playing.shipScale = shown.shipScale;
    const herDeck = here.boarding.drawn(footView, seconds, { size, viewport });
    for (const stir of shown.stirs) scene.stir(stir);
    // Back at the helm, or called to it, the pointer is the player's again.
    const afoot = here.aboard.walking || here.boarding.onDeck;
    if (wasWalking && !afoot && input.locked) document.exitPointerLock();
    wasWalking = afoot;
    // What a lookout sees is discovered as the ship sails.
    if (flow.mode === 'sea') discovered.lookout(here.position);
    if (playing.mapWanted && here.atHelm && flow.mode === 'sea' && !flow.menu) {
      playing.mapWanted = false;
      const hands = walker.you.dress.outfit.armour.gauntlets ?? null;
      parts.mapOf().open(viewport, here.position, hands, discovered.discovery.charted);
    }
    // The map's scene is gathered only while the map is up.
    const map = playing.heldMap;
    const mapFrame = map?.shown
      ? map.frame(seconds, viewport, canvas.width / Math.max(1, canvas.clientWidth), {
          ship: here.position,
          heading: here.heading,
          places: discovered.places,
          knownIslands: discovered.knownIslands,
          course: here.course,
        })
      : null;
    // The map at the helm, or the player's own hands walking her deck in first person, over the finished picture.
    const after = mapFrame
      ? (encoder: GPUCommandEncoder, view: GPUTextureView) => map?.draw(encoder, view, mapFrame)
      : shown.firstPerson
        ? (encoder: GPUCommandEncoder, view: GPUTextureView) => firstPerson.draw(encoder, view, size.width, size.height)
        : undefined;
    parts.seaView.reachM = Math.max(0, shown.shot.eye[2]) * 6;
    const fleet = traffic.atSea(shown, parts.waterHere(), seconds, clock);
    const more = { hulls: fleet.hulls, after, focus: shown.focus, ...(swell ? { swell } : {}) };
    const drawers = standing([...shown.ships, ...fleet.ships], shown.figures, herDeck);
    scene.draw(shown.shot, size, clock, seconds, drawers, more);
    showStanding(here.boarding.standing ?? { kind: 'inside' });
    const { landmass, seaWord } = playing;
    showSeaHud(
      hud,
      here,
      { ...shown, note: seaWord?.note(shown.note, here.sighted, clock) ?? shown.note },
      {
        landing: flow.mode === 'landing',
        onSea: flow.mode === 'sea' && !flow.menu,
        island: ISLANDS[landmass.id],
        region: REGION,
        clock,
        build: parts.builtSloop,
        waterline: parts.waterline,
        charting: charting.busy,
        friendly: fleet.marks,
      },
    );
    // Only while sailing: a landing chosen, or under way, stands on the landmass open now.
    charting.tick(here.position, landmass.id, seconds, flow.mode === 'sea');
    const ashore = flow.mode === 'sea' ? seaWord?.ashore(landmass) : null;
    if (ashore)
      parts.travel(ashore.washUp, () =>
        parts.goFoot(ashore.node, arrivalFacing(ashore.node, playing.landmass.plan, null)),
      );
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
    if (shown?.mode === 'foot' && foot) settled = footFrame(foot, controls, seconds, size);
    else if ((shown?.mode === 'sea' || shown?.mode === 'landing') && sea) seaFrame(sea, controls, seconds, size);
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
