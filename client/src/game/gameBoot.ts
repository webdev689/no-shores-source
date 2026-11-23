// The game's boot: the interface's layers and the interface drawn over them, the rooms and the account, the sea room's
// module, the land's worker, the scene and its views, the world, the movement rules and the forge, then the place the
// player arrives at and its landmass, opened. `game.ts` keeps the travel and actions on what this has made, and
// `gameFrame.ts` draws it.
import type { Gpu } from '../gpu.ts';
import { castOf } from '../nature/cast.ts';
import { woodsOf } from '../nature/woods.ts';
import { startMovementRules } from '../rules/movementRules.ts';
import { mainPortsOf } from '../rules/roster.ts';
import { SLOOP_HULL } from '../ships/hulls.ts';
import { openHull, ShipModels } from '../ships/shipModels.ts';
import { startLandWorker } from '../terrain/landClient.ts';
import { loadLandTexts } from '../terrain/landTexts.ts';
import { seaWeatherOn } from '../water/seaWeather.ts';
import { keptDiscovered } from './discovered.ts';
import { EventPropsDraw } from './eventPropsDraw.ts';
import { FigureView } from './figureView.ts';
import { gearScreenOpen } from './gearScreen.ts';
import { arriving, type Flow } from './flow.ts';
import { StoryHost } from './prologue/host.ts';
import { wakeOnGesture } from './uiSounds.ts';
import { openForge } from './forge.ts';
import { Hud } from './hud.ts';
import { landDrawers, loadCityAssets } from './landDrawers.ts';
import { type Landmass, openLandmass, terrainOf } from './landmass.ts';
import { accountOf, roomsFrom } from './rooms.ts';
import { keepBinds } from './bindsKept.ts';
import { keepGuild } from './guild/guildHeld.ts';
import { GameScene } from './scene.ts';
import { roomModuleFrom } from './shipPanel.ts';
import { arrivalAt, loadWorld } from './worldData.ts';
import { Stack } from '../ui/stack.ts';
import { DrawnInterface } from './drawnInterface.ts';
import { startSocial } from './social/social.ts';

/** Where every player arrives: Overlook's social space, on Saltmere; `?at=<node id>` arrives at any node instead, to
 *  look round the world. */
export const FIRST_NODE = 'overlook-social';
/** The most ships of one hull drawn at sea in a frame: the player's, the room's and the friendly ships near it. */
export const SEA_SHIPS = 16;

/** Boots the game behind the first veil, `shipScale` the size ships are drawn at each frame (a ruin's wrecks too). */
export async function bootGame(gpu: Gpu, canvas: HTMLCanvasElement, shipScale: () => number) {
  /** The interface's layers, each part of it drawn over the whole view. */
  const stack = new Stack();
  const hud = new Hud();
  stack.add((ui) => hud.node(ui));
  // K opens every control wherever the key strip offers it, except over the menu's gear screen, which has the keys.
  hud.controls.listen(() => hud.keysOffered && !gearScreenOpen());
  // The first tap or key wakes the sound, so the story's intro begins heard.
  wakeOnGesture();
  const asked = new URLSearchParams(location.search).get('at');
  // With `?at=` the page goes straight to a node; otherwise the story opens the game behind a tap to start.
  let flow: Flow = asked === null ? { mode: 'story' } : arriving(FIRST_NODE, 'Overlook');
  // The HUD starts veiled for loading; the story's tap to start stands in front of its loading instead.
  hud.veil(flow.mode === 'loading' ? flow.words : null);
  const story = flow.mode === 'story' ? new StoryHost(stack, canvas, () => hud.controls.open) : null;
  const base = import.meta.env.BASE_URL;
  const rooms = roomsFrom(new URLSearchParams(location.search).get('room'));
  const { link, session } = accountOf(location, localStorage, sessionStorage);
  if (link) void keepBinds(link);
  if (link) keepGuild(link);
  // The sea room's own module, for playing alone, fetched now; and the Sloop's build from it, for Manage's panel.
  const { module: roomModule, sloop: builtSloop } = roomModuleFrom(base);
  const land = startLandWorker();
  const scene = new GameScene(gpu);
  // The interface the game draws itself, once its face is read, alone until the game's frames begin.
  const ui = new DrawnInterface(gpu, canvas, stack);
  const figureView = new FigureView(gpu);
  /** The public events' props, drawn from the list the event's view sets each frame. */
  const eventProps = new EventPropsDraw(gpu);
  const shipModels = new ShipModels(openHull(gpu, SEA_SHIPS));
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
    shipModels.load(SLOOP_HULL),
  ]);
  // The chat, and the menu and Inspect holding Use on another player opens, over the HUD; after the interface, whose
  // keys it hears after them.
  startSocial(stack, link, session, () => forge);
  const { continents } = world;
  // The sea by weather, the swell the sea is drawn with, and how far the view last reached.
  const [seaWeather, seaView] = [seaWeatherOn(roomModule, world.layoutText, world.cities), { reachM: 0 }];
  const cityAssets = loadCityAssets(base);
  const biomeOf = (id: string) => continents.find((continent) => continent.id === id)?.climate ?? null;
  const drawersOn = (opened: Landmass) =>
    landDrawers(gpu, opened, scene, biomeOf(opened.id), base, cityAssets, shipScale);
  // Only arriving at another city's social space waits for the rules' module, to learn whether it is a ruin.
  const another = asked !== FIRST_NODE && asked?.endsWith('-social');
  const mainPorts = another ? await roomModule.then(mainPortsOf).catch(() => null) : null;
  const start = (asked === null ? null : arrivalAt(world, asked, mainPorts)) ?? arrivalAt(world, FIRST_NODE);
  if (!start) throw new Error('the world has no Overlook to arrive at');
  if (start.node !== FIRST_NODE) {
    flow = arriving(start.node, start.name);
    if (flow.mode === 'loading') hud.veil(flow.words);
  }
  const discovered = keptDiscovered(world);
  discovered.arrived(start.continent, start.node);
  const landmass = await openLandmass(land, world, landTexts, start.continent);
  /** A landmass's land as the scene draws it, its biome's woods coloured on it past the reach of its drawn trees. */
  const terrainFor = (opened: Landmass) => {
    const biome = biomeOf(opened.id);
    return terrainOf(opened.view, biome ? woodsOf(castOf(biome)) : undefined);
  };
  scene.setLand(landmass.view, terrainFor(landmass), biomeOf(landmass.id));
  const views = { scene, figureView, eventProps, shipModels, forge, firstPerson, store, sloop };
  const modules = {
    roomModule,
    builtSloop,
    land,
    movement,
    seaWeather,
    seaView,
    drawersOn,
    terrainFor,
    biomeOf,
    cityAssets,
  };
  return {
    hud,
    stack,
    ui,
    flow,
    story,
    rooms,
    link,
    session,
    world,
    landTexts,
    start,
    discovered,
    landmass,
    ...views,
    ...modules,
  };
}
