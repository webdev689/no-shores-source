import '../keptNames.ts';
import { FirstPerson } from '../firstperson/firstPerson.ts';
import { type Gpu, TEXTURE_USAGE, startGpu, stopWhenLost } from '../gpu.ts';
import type { ForgeLooks } from '../forge/looks.ts';
import type { HairColours } from '../forge/skins.ts';
import { crosshairOf } from '../combat/reticle.ts';
import { type FighterView, fighterView } from '../rules/fighters.ts';
import { rosterOf } from '../rules/roster.ts';
import type { Vector } from '../combat/swingArcs.ts';
import { Glides } from '../player/glide.ts';
import { pushedIn, showAnimaEdge } from '../combat/animaMoment.ts';
import { AttackFeel, type DrawnFigure } from '../combat/attackFeel.ts';
import { Fighting } from '../combat/fighting.ts';
import { DropsShown } from '../combat/drops.ts';
import { FightEffects } from '../combat/fightEffects.ts';
import { FoeFigures } from '../combat/foeFigures.ts';
import { PlayerFight } from '../combat/playerFight.ts';
import { castLookOf, hastedIn, veiledIn } from '../combat/spellLooks.ts';
import { crosshairPoint } from '../player/crosshair.ts';
import { figureMuzzle, screenMuzzle } from '../combat/tracers.ts';
import { Hud } from '../combat/hud.ts';
import { readFace } from '../ui/faceReader.ts';
import { stopped } from '../ui/page.ts';
import { Interface } from '../ui/ui.ts';
import { UiRenderer, uiScale } from '../ui/uiRenderer.ts';
import { abilityPictures } from '../player/artGlyphs.ts';
import { LocalRoom } from '../network/localRoom.ts';
import { roomAddress } from '../network/roomAddress.ts';
import { type GearMessage, RoomConnection, type Snapshot } from '../network/roomConnection.ts';
import type { ArtState } from '../network/artMessages.ts';
import { ASKS, type GearAsk, type GearStanding, type GearState } from '../network/gearMessages.ts';
import { fetchRoomWasm, startCombatRules } from '../rules/combatRules.ts';
import { startMovementRules } from '../rules/movementRules.ts';
import { FightBlood, surfacesOf } from '../combat/fightBlood.ts';
import { type WorldOutput, WorldSounds } from '../combat/worldSounds.ts';
import { loadSamples } from '../soundSamples.ts';
import { type CardAt, type Cards, openCards } from '../player/cards.ts';
import { loadForgedBirds } from '../combat/forgedBirds.ts';
import { COURSE, RESOURCE_NODES, ROCKS_SHOWN, STALL, START, STOOD, WOODEN } from './course.ts';
import { rockTriangles } from './rockRow.ts';
import { STALL_REACH, gearMarked, nodesInReach } from './gearGround.ts';
import { marksSeen } from '../combat/marksOver.ts';
import { GearPanel, type GearView } from './gearPanel.ts';
import { PanelAsks } from './panelAsks.ts';
import { SLOTS, heldElements, worn } from '../player/gear.ts';
import { gearOutfit, otherLoadout, spareOutfit } from '../player/gearLooks.ts';
import { type Dress, plainDress, wardrobeOf } from '../player/dressing.ts';
import { CARD_NEAREST_M, type Placed, cardStand, eyeOf, frameAt, viewOf } from '../player/figures.ts';
import { type Orbit, cameraOf, viewProjection } from '../editor/orbit.ts';
import { Input } from '../player/input.ts';
import { type Player, newPlayer, playerCamera, shownBody } from '../player/player.ts';
import { AIM, type AimPlace, handsZoom } from '../player/playerCamera.ts';
import { OtherPlayers } from '../player/others.ts';
import { Walker } from '../player/walker.ts';
import { AimPanel } from './aimPanel.ts';
import { withLight } from './dressPanel.ts';
import { Panel, type PanelState, roomLine } from './panel.ts';
import { panels, sides } from './panelKit.ts';
import { statusNodes } from './statusPanel.ts';
import { artsNodes } from './artsPanel.ts';
import { SceneView } from './sceneView.ts';
import { ViewTexture } from './viewTexture.ts';
import { PagePanels } from './pagePanels.ts';
import { FeelPanel } from './feelPanel.ts';

/** How fast a figure set turning round turns, in radians a second: a full turn in 8 seconds. */
const SPIN = (2 * Math.PI) / 8;
/** The player's own figure, listed first in the panel. */
const PLAYER_ID = 1;
/** How long each frame of a move chosen in the panel plays on the player. */
const ACT_FRAME = 0.2;

/** The Test Ground's ground is flat at 0, and its camera keeps this far over it (metres): an aiming view looking up
 *  from behind the shoulder stays above the ground. */
const GROUND_CLEARANCE_M = 0.25;
function aboveGround(orbit: Orbit): Orbit {
  const eyeZ = orbit.targetZ + Math.sin(orbit.pitch) * orbit.distance;
  return eyeZ >= GROUND_CLEARANCE_M ? orbit : { ...orbit, targetZ: orbit.targetZ + GROUND_CLEARANCE_M - eyeZ };
}

function element<T extends Element>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`the page has no ${selector}`);
  return found;
}

/** The blood's camera for an orbit: the Test Ground's world is near its origin, so the blood keeps it as it is. */
function bloodCamera(orbit: Orbit, aspect: number) {
  const { eye, right } = cameraOf(orbit);
  const focus = [orbit.targetX, orbit.targetY, orbit.targetZ] as const;
  return { viewProjection: viewProjection(orbit, aspect), focus, eye, right };
}

async function start(): Promise<void> {
  const canvas = element<HTMLCanvasElement>('#ground');
  const gpu = await startGpu(canvas);
  stopWhenLost(gpu.device, stopped);
  // The view between the panels is drawn into a texture of its own, its display over it, then copied into its place on
  // the canvas, under the panels drawn either side of it.
  gpu.context.configure({
    device: gpu.device,
    format: gpu.format,
    alphaMode: 'opaque',
    usage: TEXTURE_USAGE.renderAttachment | TEXTURE_USAGE.copySource | TEXTURE_USAGE.copyDestination,
  });
  const viewTexture = new ViewTexture(gpu);
  const viewGpu = { device: gpu.device, format: gpu.format, context: { getCurrentTexture: () => viewTexture.texture } };
  const scene = new SceneView(viewGpu as unknown as Gpu);
  scene.setBlocks(COURSE, ROCKS_SHOWN ? rockTriangles() : []);
  const blood = new FightBlood(gpu, surfacesOf(COURSE), location.search);
  scene.underCards = (pass) => blood.draw(pass);
  // The body moves by the Rust movement rules, run in WebAssembly.
  const movement = await startMovementRules(
    await (await fetch(`${import.meta.env.BASE_URL}movement.wasm`)).arrayBuffer(),
  );
  movement.setCourse(STOOD);
  // The fight's rules and a room in the page are the room crate itself, in WebAssembly.
  const roomModule = await WebAssembly.compile(await (await fetchRoomWasm(import.meta.env.BASE_URL)).arrayBuffer());
  const combatRules = startCombatRules(roomModule);
  combatRules.setCourse(STOOD);
  // Each foe's name and hands are the rules' roster's; its type's dress is made once.
  const roster = rosterOf(roomModule);
  // The fight's display is drawn by the game over the view, in an interface of its own the view's size; it hears
  // nothing. The panels either side hear the canvas.
  let ui: Interface | null = null;
  const face = readFace();
  face
    .then((read) => (ui = new Interface(new UiRenderer(viewGpu as unknown as Gpu, read))))
    .catch((error: unknown) => console.error('the face could not be read:', error));
  const page = new PagePanels(gpu, canvas, face, () => input.locked);
  const input: Input = new Input(canvas, () => page.takesKeys);
  let status = 'Reading the forge…';
  let fps = 6;
  // The player before the forge has come; then the walker's.
  const started = newPlayer(movement, START.x, START.y);
  const standing = { ...started, yaw: START.yaw ?? started.yaw, pitch: START.pitch ?? started.pitch };
  let walker: Walker | null = null;
  const playerNow = (): Player => walker?.player ?? standing;
  let nextId = PLAYER_ID;
  const figures: Placed[] = [];
  const place = (dress: Dress, x: number, y: number, facing: number): Placed => {
    const placed: Placed = { id: nextId++, x, y, z: 0, facing, dress, anim: 'idle', frame: null, spin: false };
    figures.push(placed);
    return placed;
  };
  const you = place(plainDress('human', 0.3), START.x, START.y, 0);
  let chosen: Placed = you;
  // Every other player in the room; one the panel already took away is not taken again.
  const otherPlayers = new OtherPlayers({
    place,
    remove: (placed) => {
      const index = figures.indexOf(placed);
      if (index >= 0) figures.splice(index, 1);
      if (chosen === placed) chosen = you;
    },
  });
  const others = otherPlayers.placed;
  let cards: Cards | null = null;
  // Declared before the panel: a foe asked for while the forge loads is not asked for.
  let fight: Fighting | null = null;
  const asks = new PanelAsks();
  // The light the player's left carries, where the loadout drawn lets it: the dress panel's pick.
  let light: string | null = null;
  const panel = new Panel(roster, {
    add: () => {
      const ahead = 3;
      const { body, yaw } = playerNow();
      const x = body.x + Math.sin(yaw) * ahead;
      const y = body.y - Math.cos(yaw) * ahead;
      chosen = place(plainDress('human', 0.6), x, y, yaw + Math.PI);
    },
    remove: () => {
      const index = figures.findIndex((each) => each === chosen && each !== you);
      if (index >= 0) figures.splice(index, 1);
      chosen = you;
    },
    choose: (id) => {
      chosen = figures.find((each) => each.id === id) ?? chosen;
    },
    change: () => undefined,
    fps: (value) => {
      fps = Math.min(30, Math.max(1, value));
    },
    act: (anim) => {
      if (!walker) return;
      const seconds = (cards?.frames(you.dress.body, anim) ?? 1) * ACT_FRAME;
      walker.player = { ...walker.player, act: { anim, elapsed: 0, seconds } };
    },
    fight: (foe, level) => fight?.ask(foe, level),
    wear: (kind) => asks.ask(fight, { kind: ASKS.grantWorn, itemKind: kind }),
    carry: (layer) => {
      light = layer;
    },
  });
  // The player's gear, as the room last sent it, and the panel that shows it and asks of it.
  let gear: GearState | null = null;
  const gearPanel = new GearPanel((ask) => asks.ask(fight, ask));
  // Third person's aiming view where the panel places it; held there while the box is ticked, to place it by eye.
  let aimPlace: AimPlace = AIM;
  let aimHeld = false;
  const aimPanel = new AimPanel((place, held) => {
    [aimPlace, aimHeld] = [place, held];
  });
  const askGear = (ask: GearAsk) => asks.ask(fight, ask);
  const feel = new AttackFeel(combatRules, movement.tickSeconds);
  const feelPanel = new FeelPanel((set) => {
    feel.set(set);
    scene.light = set.light;
  });
  // The camera the player's frame is drawn from, and an aimed shot laid on its crosshair.
  const aimView = (shown: Player) =>
    aboveGround(playerCamera(aimHeld ? { ...shown, aim: 1 } : shown, movement, STOOD, aimPlace));
  const panelState = (looks: ForgeLooks, hair: HairColours, line: string): PanelState => ({
    looks,
    hair,
    figures,
    remote: new Set(others.values()),
    chosen,
    fps,
    playerId: PLAYER_ID,
    worn: gear && { melee: worn(gear, 0)?.kind ?? 0, ranged: worn(gear, 1)?.kind ?? 0 },
    light,
    playing: input.locked,
    status: line,
  });
  // What the panels show, as the page last knew it; drawn each frame from the first.
  let shownPanel = panelState({ bodies: {} }, { bodies: {} }, status);
  let shownGear: GearView = { gear: null, atStall: false, nodesInReach: [] };
  let shownArts: { state: ArtState | null; standing?: GearStanding } = { state: null };
  page.stack.add((drawn) =>
    panels(
      drawn,
      [
        ...panel.node(drawn, shownPanel),
        ...aimPanel.node(drawn),
        ...statusNodes(drawn, askGear),
        ...artsNodes(drawn, askGear, shownArts.state, shownArts.standing),
        ...feelPanel.node(drawn),
      ],
      gearPanel.node(drawn, shownGear, page.seconds),
    ),
  );
  // Until the forge and the room are ready, the panels are drawn alone.
  let ready = false;
  const waiting = () => {
    if (ready) return;
    shownPanel = panelState({ bodies: {} }, { bodies: {} }, status);
    page.hear();
    page.draw();
    requestAnimationFrame(waiting);
  };
  requestAnimationFrame(waiting);
  const { forge, store, looks, hair } = await openCards(scene);
  loadForgedBirds((path) => store.strip(path));
  cards = forge;
  const firstPerson = await FirstPerson.open(gpu, store);
  const player = new Walker(standing, you, firstPerson, forge);
  walker = player;
  status = 'Click the view to play.';
  // The world's sounds wake with the first click into the view, as a browser lets sound start only after a press.
  let output: WorldOutput | null = null;
  canvas.addEventListener('click', (event) => {
    if (input.locked || !page.onView(event)) return;
    input.lock();
    if (output || typeof AudioContext === 'undefined') return;
    const audio = new AudioContext();
    loadSamples(audio);
    output = { audio, out: audio.destination };
  });
  const sounds = new WorldSounds(() => output);

  // With ?room=<name> (or a whole ws:// address), the Test Ground joins that room on a server; without one it plays in
  // a room in the page. Either way the player's fighter is predicted here and set by the room's word, each tick's
  // intent goes to the room, and every other player and foe stands where the room last saw them.
  const given = new URLSearchParams(location.search).get('room');
  const roomUrl = given === null ? null : roomAddress(given);
  if (given !== null && !roomUrl)
    throw new Error(`"${given}" is not a room: a room's name is letters, digits and hyphens`);
  // A link that joined the room again brings every dress there with its welcome.
  let joins = 1;
  const received = (snapshot: Snapshot) => {
    if (link.joins !== joins) {
      joins = link.joins;
      otherPlayers.take(link);
    }
    otherPlayers.take(snapshot);
    fight?.receive(snapshot);
    otherPlayers.seen(snapshot.players, fight?.player ?? null, forge);
  };
  const gearReceived = (message: GearMessage) => {
    gear = message;
    walker?.ridesIn(message);
  };
  const link = roomUrl
    ? await RoomConnection.open(roomUrl, received, gearReceived)
    : LocalRoom.open(roomModule, START, STOOD, received, gearReceived, { stall: STALL, nodes: RESOURCE_NODES });
  const fighting = new Fighting(combatRules, link);
  fight = fighting;
  // The room in the page runs one tick at once, so the player's fighter and gear are known before they first play.
  if (!roomUrl) link.pump(movement.tickSeconds);
  otherPlayers.take(link);
  const steps = fighting.steps(movement);
  const playerFight = new PlayerFight(fighting, combatRules, player);
  const hud = new Hud(abilityPictures, forge);
  const effects = new FightEffects();
  const dropsShown = new DropsShown();
  // The foes' figures, apart from the panel's figures; they and other players are drawn gliding between the room's
  // snapshots.
  const foes = new FoeFigures(roster);
  const otherGlides = new Glides();
  let gearWornKey = '';

  let last = performance.now();
  let clock = 0;
  const frame = (now: number) => {
    const seconds = Math.min(0.1, (now - last) / 1000);
    last = now;
    clock += seconds;
    // The panels hear the page before the game's input is read: what they take is not the world's.
    const tookWheel = page.hear();
    // The pad is the panels' while they hold the player, as the game's is a window's.
    input.window(page.takesKeys ? 'panels' : null);
    const heardControls = input.frame();
    const controls = tookWheel ? { ...heardControls, wheel: 0 } : heardControls;
    // The figure wears what the gear wears, and the hands hold it: the room takes no other arms. The left carries the
    // panel's light only where the room's arms allow it.
    const ownGear = gear;
    const gearWorn =
      ownGear &&
      JSON.stringify([
        you.dress.body,
        player.player.loadout,
        light,
        ...SLOTS.map((unused, slot) => worn(ownGear, slot) ?? 0),
      ]);
    const bodyLayers = looks.bodies[you.dress.body]?.layers;
    if (ownGear && gearWorn && gearWorn !== gearWornKey && bodyLayers) {
      gearWornKey = gearWorn;
      const wardrobe = wardrobeOf(you.dress.body, bodyLayers);
      const outfit = gearOutfit(ownGear, wardrobe, you.dress.outfit, player.player.loadout);
      const lit = withLight(outfit, light, ownGear.arms, (right, left) => combatRules.armsCode(right, left, true));
      you.dress = { ...you.dress, outfit: lit };
      player.spare = spareOutfit(ownGear, wardrobe, outfit, player.player.loadout);
    }
    player.glow = feel.glow(heldElements(ownGear, player.player.loadout));
    player.spareGlow = feel.glow(heldElements(ownGear, otherLoadout(player.player.loadout)))[0];
    const bodies = [...foes.placed.values(), ...others.values()].map(
      (placed) => [placed.x, placed.y, placed.z] as const,
    );
    // The view between the panels, device pixels.
    const scale = uiScale(devicePixelRatio);
    const side = sides(canvas.width / scale);
    const [viewWidth, viewHeight] = [Math.max(1, canvas.width - (side.left + side.right) * scale), canvas.height];
    viewTexture.fit(viewWidth, viewHeight);
    const aspect = viewWidth / viewHeight;
    // Alone, the room in the page waits while the pointer is free: Escape pauses the fight.
    const running = roomUrl !== null || controls.locked;
    // An ask made from a panel while the pointer is free still goes, carried by a tick of the player standing still;
    // alone, the room in the page runs on so until it has answered.
    if (!controls.locked && fighting.asking) {
      const { yaw, mounted } = player.player;
      const still = { forward: 0, sideways: 0, yaw, run: false, jump: false, crouch: false, mounted };
      const tick = () => {
        player.player = { ...player.player, body: steps.step(player.player.body, still) };
        if (!roomUrl) fighting.pump(movement.tickSeconds);
      };
      if (roomUrl) tick();
      else asks.carry(fighting, () => gear?.answered ?? 0, tick);
    }
    const shown = playerFight.frame(controls, steps, seconds, clock, {
      running,
      hands: controls.locked,
      markOf: () => crosshairPoint(aimView(player.player), aspect, STOOD, bodies),
      zoomOf: () => handsZoom(aimView(player.player), player.player.view),
      handsSeconds: feel.shownSeconds(fighting.player, seconds),
    });
    const own = fighting.own;
    effects.ownLook = player.glowing[0];
    const events = effects.events(fighting, seconds, (id, look) => foes.dissolveFoe(id, look, clock));
    const ownFought = effects.flashes.ownOf(own);
    player.fought(ownFought.surge, ownFought.contact);
    feel.frame(events, own, fighting.player, seconds, new Set(fighting.others.keys()));
    const frameTicks = seconds / movement.tickSeconds;
    const body = shownBody(player.player);
    const inFirstPerson = player.inFirstPerson;
    const sights = shown.aiming || aimHeld || (shown.rangedDrawn && inFirstPerson);
    const feltCamera = feel.camera(aimView(player.player), fighting.player, own, inFirstPerson, sights);
    const camera = pushedIn(feltCamera, effects.anima.push);
    // Through the player's own eyes no other figure stands so near that it fills the view, as in the game.
    const eye = { ...eyeOf(camera), nearest: inFirstPerson ? CARD_NEAREST_M : 0 };
    // Each figure drawn off where it stands by the attack feel; each fighter's figure as drawn, which its arc follows.
    const shift = (id: number, view: FighterView | null): Vector => feel.shift(id, view, camera.yaw);
    const figuresDrawn = new Map<number, DrawnFigure>();
    const right = [Math.cos(camera.yaw), Math.sin(camera.yaw)] as const;
    const smear = (id: number) => feel.smearOf(id, right);

    const drawn: CardAt[] = [];
    const ownShift = shift(fighting.player, own);
    const ownCard = player.figure(eye.x, eye.y, effects.flashes.flashOf(fighting.player), ownShift);
    if (ownCard) {
      const statuses = own?.statuses;
      const [charged, exposed] = [(statuses?.charge ?? 0) > 0, (statuses?.expose ?? 0) > 0];
      const [veiled, hasted] = [veiledIn(fighting, fighting.player), hastedIn(fighting, fighting.player)];
      drawn.push({ ...ownCard, veiled, charged, exposed, hasted, smear: smear(fighting.player) });
      const feet: Vector = [body.x + ownShift[0], body.y + ownShift[1], body.z + ownShift[2]];
      figuresDrawn.set(fighting.player, { feet, anim: player.look.anim, flip: ownCard.flip });
    }
    for (const [number, placed] of others) {
      const seen = fighting.others.get(number)?.body;
      if (seen)
        [placed.x, placed.y, placed.z] = otherGlides.follow(
          number,
          [seen.x, seen.y, seen.z],
          fighting.roomTick,
          frameTicks,
        );
    }
    otherGlides.keep(new Set(others.keys()));
    const numberOf = new Map([...others].map(([number, placed]) => [placed, number]));
    const otherViews = new Map<number, FighterView>();
    for (const [number, seen] of fighting.others) if (seen.fighter) otherViews.set(number, fighterView(seen.fighter));
    for (const placed of figures) {
      if (placed === you) continue;
      if (placed.spin) placed.facing = (placed.facing + SPIN * seconds) % (2 * Math.PI);
      const { view, flip } = viewOf(placed.facing, placed.x, placed.y, eye.x, eye.y);
      const moveFrames = forge.frames(placed.dress.body, placed.anim);
      const shownFrame =
        placed.frame === null ? frameAt(clock, moveFrames, fps) : Math.min(placed.frame, moveFrames - 1);
      const number = numberOf.get(placed);
      // Another player's cast's spark glows in their Art, as the player's own does.
      const glow = number !== undefined && placed.anim === 'cast' ? castLookOf(fighting, number) : 0;
      const card = forge.card(placed.id, placed.dress, placed.anim, view, shownFrame, flip, glow);
      const flash = effects.flashes.flashOf(number ?? -1);
      const moved: Vector = number === undefined ? [0, 0, 0] : shift(number, otherViews.get(number) ?? null);
      const drawnAt: Vector = [placed.x + moved[0], placed.y + moved[1], placed.z + moved[2]];
      if (number !== undefined) figuresDrawn.set(number, { feet: drawnAt, anim: placed.anim, flip });
      const veiled = number !== undefined && veiledIn(fighting, number);
      const hasted = number !== undefined && hastedIn(fighting, number);
      const stand = cardStand(drawnAt[0], drawnAt[1], eye.x, eye.y, eye.nearest);
      if (card) drawn.push({ card, ...stand, z: drawnAt[2], flip, flash, veiled, hasted });
    }
    const foeFeel = { held: (id: number, view: FighterView) => feel.held(id, view), shift, drawn: figuresDrawn, smear };
    const { tickSeconds } = movement;
    drawn.push(...foes.cards(fighting, forge, eye, clock, frameTicks, tickSeconds, effects.flashes, foeFeel));
    // The player's own shots leave the weapon as drawn: the first person's muzzle, or the figure's gun as it faces.
    const fpMuzzle = inFirstPerson ? firstPerson.muzzle : null;
    const dropped = dropsShown.frame(gear?.drops ?? [], clock, cameraOf(camera).eye);
    const marks = effects.marks(fighting, running ? seconds : 0, {
      eye: cameraOf(camera).eye,
      blocks: STOOD,
      bodies,
      muzzleOf: () =>
        fpMuzzle ? screenMuzzle(camera, aspect, fpMuzzle) : figureMuzzle([body.x, body.y, body.z], you.facing),
      more: [
        ...marksSeen(gearMarked(STALL, gear), cameraOf(camera).eye, clock),
        ...dropped.marks,
        ...foes.overheads(cameraOf(camera).eye, clock),
      ],
      drawn: { foes: foes.placed, others },
    });
    sounds.frame({
      seconds,
      quiet: false,
      fight: fighting,
      events,
      shots: effects.shotsHeard,
      eye: cameraOf(camera).eye,
      yaw: camera.yaw,
      walker: {
        feet: [body.x, body.y, body.z],
        walked: player.walked,
        drawn: you.dress.outfit.drawn,
        mounted: player.player.mounted,
        boosting: player.player.body.boosting ?? 0,
        look: effects.ownLook,
        pulled: shown.pulled,
      },
      others,
      foes: foes.placed,
      ground: { blocks: STOOD, wooden: WOODEN },
      landed: dropped.landed,
      crates: gear?.crates ?? null,
    });
    showAnimaEdge(effects.anima);
    scene.setMarks(marks);
    // Every blow being struck, its arc following its striker's figure as drawn; none through the eyes.
    const handsOf = (dress: Dress | null | undefined) => ({
      right: dress?.outfit.right ?? null,
      left: dress?.outfit.left ?? null,
    });
    const strikers = [
      { id: fighting.player, player: true, view: own, ...handsOf(player.shownDress), looks: player.glowing },
      ...[...fighting.foes.values()].map((kept) => ({ id: kept.id, view: kept.view, ...handsOf(foes.dressOf(kept)) })),
      ...[...otherViews].map(([number, view]) => ({
        id: number,
        player: true,
        view,
        ...handsOf(others.get(number)?.dress),
      })),
    ];
    scene.setSwings(feel.arcsMesh(clock, strikers, figuresDrawn, cameraOf(camera).eye, inFirstPerson));
    blood.frame(seconds, events, fighting, bloodCamera(camera, aspect));
    scene.draw(camera, viewWidth, viewHeight, drawn, chosen === you ? null : chosen, (encoder, view) => {
      // The Test Ground keeps a clear afternoon: its hands are drawn as made.
      if (inFirstPerson) firstPerson.draw(encoder, view, { width: viewWidth, height: viewHeight, light: [1, 1, 1] });
    });
    const where = (id: number): [number, number, number] | null => {
      if (id === fighting.player && own) return [own.x, own.y, own.z];
      const figure = foes.placed.get(id) ?? others.get(id);
      return figure ? [figure.x, figure.y, figure.z] : null;
    };
    hud.update(
      {
        own,
        foes: foes.marked(fighting),
        where,
        matrix: viewProjection(camera, aspect),
        // In the drawn interface's own pixels, where it lays the display out.
        width: viewWidth / scale,
        height: viewHeight / scale,
        events,
        blocks: STOOD,
        // The course's flat ground hides nothing.
        groundAt: null,
        player: fighting.player,
        firstPerson: inFirstPerson,
        pressed: shown.pressed,
        lost: link.lost,
        rejoining: link.rejoining,
        parryOpen: fighting.parryOpen,
        parryWindow: fighting.parryWindow,
        abilities: fighting.abilities,
        // The shots left stand beside the crosshair while the Ranged loadout is drawn.
        ammo: sights && shown.rangedDrawn ? (own?.ammo ?? null) : null,
        ammoMost: gear?.ammoMost ?? null,
        ammoFull: !!own && dropsShown.ammoFull(gear?.drops ?? [], [own.x, own.y, own.z], (gear?.ammoShare ?? 1) >= 1),
        crosshair: crosshairOf(shown.reticle, sights, own, fighting.reach),
        arms: { gear, loadout: player.player.loadout, drawn: you.dress.outfit.drawn, dress: you.dress },
      },
      seconds,
    );
    if (ui) {
      ui.frame({ width: viewWidth, height: viewHeight, scale }, [], seconds, false, false);
      ui.draw(hud.node(ui));
      ui.renderer.present(viewWidth, viewHeight);
    }
    viewTexture.show(side.left * scale);
    const composing = forge.pending > 0 ? ` Composing ${forge.pending} frame${forge.pending === 1 ? '' : 's'}…` : '';
    const failure = forge.failure ? ` A strip did not load: ${forge.failure}` : '';
    const line = controls.locked ? 'Playing: Escape frees the mouse.' : status;
    const room =
      given !== null && link instanceof RoomConnection ? ` ${roomLine(given, link.player, link.measured)}` : '';
    shownPanel = panelState(looks, hair, line + composing + failure + room);
    const atStall = Math.hypot(player.player.body.x - STALL.x, player.player.body.y - STALL.y) <= STALL_REACH;
    shownGear = { gear, atStall, nodesInReach: nodesInReach(player.player.body, RESOURCE_NODES, gear) };
    shownArts = { state: fighting.arts, standing: gear?.standing };
    page.draw();
    requestAnimationFrame(frame);
  };
  ready = true;
  requestAnimationFrame(frame);
}

start().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  stopped(message);
});
