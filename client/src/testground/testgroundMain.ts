import { canvasSize } from '../canvasSize.ts';
import { useMendedFace } from '../face.ts';
import { FirstPerson } from '../firstperson/firstPerson.ts';
import { GpuUnavailable, startGpu } from '../gpu.ts';
import type { ForgeLooks } from '../forge/looks.ts';
import type { HairColours } from '../forge/skins.ts';
import { FIGHT_TICKS } from '../player/fightMoves.ts';
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
import { castLookOf, veiledIn } from '../combat/spellLooks.ts';
import { crosshairPoint } from '../player/crosshair.ts';
import { figureMuzzle, screenMuzzle } from '../combat/tracers.ts';
import { Hud } from '../combat/hud.ts';
import { abilityPictures } from '../player/artGlyphs.ts';
import { LocalRoom } from '../network/localRoom.ts';
import { roomAddress } from '../network/roomAddress.ts';
import { type GearMessage, RoomConnection, type Snapshot } from '../network/roomConnection.ts';
import { ASKS, type GearState } from '../network/gearMessages.ts';
import { startCombatRules } from '../rules/combatRules.ts';
import { startMovementRules } from '../rules/movementRules.ts';
import { FightBlood, surfacesOf } from '../combat/fightBlood.ts';
import { type WorldOutput, WorldSounds } from '../combat/worldSounds.ts';
import { loadSamples } from '../soundSamples.ts';
import { type CardAt, type Cards, openCards } from '../player/cards.ts';
import { COURSE, RESOURCE_NODES, STALL, START, WOODEN } from './course.ts';
import { STALL_REACH, gearRings, nodesInReach } from './gearGround.ts';
import { startGearPanel } from './gearPanel.ts';
import { PanelAsks } from './panelAsks.ts';
import { SLOTS, heldElements, worn } from '../player/gear.ts';
import { gearOutfit, otherLoadout, spareOutfit } from '../player/gearLooks.ts';
import { type Dress, plainDress, wardrobeOf } from '../player/dressing.ts';
import { type Placed, cardStand, eyeOf, frameAt, viewOf } from '../player/figures.ts';
import { type Orbit, cameraOf, viewProjection } from '../editor/orbit.ts';
import { Input } from '../player/input.ts';
import { type Player, newPlayer, playerCamera, shownBody } from '../player/player.ts';
import { AIM, type AimPlace } from '../player/playerCamera.ts';
import { OtherPlayers } from '../player/others.ts';
import { Walker } from '../player/walker.ts';
import { startAimPanel } from './aimPanel.ts';
import { withLight } from './dressPanel.ts';
import { startPanel } from './panel.ts';
import { startStatusPanel } from './statusPanel.ts';
import { startArtsPanel } from './artsPanel.ts';
import { SceneView } from './sceneView.ts';
import { startFeelPanel } from './feelPanel.ts';

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
  useMendedFace();
  const canvas = element<HTMLCanvasElement>('#ground');
  const gpu = await startGpu(canvas);
  const scene = new SceneView(gpu);
  scene.setBlocks(COURSE);
  const blood = new FightBlood(gpu, surfacesOf(COURSE), location.search);
  scene.underCards = (pass) => blood.draw(pass);
  // The body moves by the Rust movement rules, run in WebAssembly.
  const movement = await startMovementRules(
    await (await fetch(`${import.meta.env.BASE_URL}movement.wasm`)).arrayBuffer(),
  );
  movement.setCourse(COURSE);
  // The fight's rules and a room in the page are the room crate itself, in WebAssembly.
  const roomModule = await WebAssembly.compile(
    await (await fetch(`${import.meta.env.BASE_URL}room.wasm`)).arrayBuffer(),
  );
  const combatRules = startCombatRules(roomModule);
  combatRules.setCourse(COURSE);
  // Each foe's name and hands are the rules' roster's; its type's dress is made once.
  const roster = rosterOf(roomModule);
  const input = new Input(canvas);
  let status = 'Reading the forge…';
  let fps = 6;
  // The player before the forge has come; then the walker's.
  const standing = newPlayer(movement, START.x, START.y);
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
  const showPanel = startPanel(element<HTMLElement>('#panel'), roster, {
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
  const showGear = startGearPanel(element<HTMLElement>('#gear-panel'), (ask) => asks.ask(fight, ask));
  // Third person's aiming view where the panel places it; held there while the box is ticked, to place it by eye.
  let aimPlace: AimPlace = AIM;
  let aimHeld = false;
  startAimPanel(element<HTMLElement>('#panel'), (place, held) => {
    [aimPlace, aimHeld] = [place, held];
  });
  startStatusPanel(element<HTMLElement>('#panel'), (ask) => asks.ask(fight, ask));
  const showArts = startArtsPanel(element<HTMLElement>('#panel'), (ask) => asks.ask(fight, ask));
  const feel = new AttackFeel(combatRules, movement.tickSeconds);
  startFeelPanel(element<HTMLElement>('#panel'), (set) => {
    feel.set(set);
    scene.light = set.light;
  });
  // The camera the player's frame is drawn from, and an aimed shot laid on its crosshair.
  const aimView = (shown: Player) =>
    aboveGround(playerCamera(aimHeld ? { ...shown, aim: 1 } : shown, movement, COURSE, aimPlace));
  const panelState = (looks: ForgeLooks, hair: HairColours, line: string) => ({
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
  showPanel(panelState({ bodies: {} }, { bodies: {} }, status));
  const { forge, store, looks, hair } = await openCards(scene);
  cards = forge;
  // The first person swings in the direction the fight's rules began the swing with.
  const strokeShare = () => {
    const action = fight?.own?.action;
    const stroke = action?.kind === 'attack' ? action.stroke : (fight?.stroke ?? 1);
    return (stroke - 0.5) / 6;
  };
  const firstPerson = await FirstPerson.open(gpu, store, strokeShare);
  const player = new Walker(standing, you, firstPerson, forge);
  walker = player;
  status = 'Click the view to play.';
  // The world's sounds wake with the first click into the view, as a browser lets sound start only after a press.
  let output: WorldOutput | null = null;
  canvas.addEventListener('click', () => {
    if (!input.locked) input.lock();
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
      otherPlayers.takeDresses(link.dressed);
    }
    otherPlayers.takeDresses(snapshot.dressed);
    fight?.receive(snapshot);
    otherPlayers.seen(snapshot.players, fight?.player ?? null, forge);
  };
  const gearReceived = (message: GearMessage) => {
    gear = message;
  };
  const link = roomUrl
    ? await RoomConnection.open(roomUrl, received, gearReceived)
    : LocalRoom.open(roomModule, START, COURSE, received, gearReceived, { stall: STALL, nodes: RESOURCE_NODES });
  const fighting = new Fighting(combatRules, link);
  fight = fighting;
  // The room in the page runs one tick at once, so the player's fighter and gear are known before they first play.
  if (!roomUrl) link.pump(movement.tickSeconds);
  otherPlayers.takeDresses(link.dressed);
  const steps = fighting.steps(movement);
  const playerFight = new PlayerFight(fighting, combatRules, player);
  const hud = new Hud(element<HTMLElement>('#hud'), abilityPictures, forge);
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
    const controls = input.frame();
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
    const aspect = canvas.width / Math.max(1, canvas.height);
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
      markOf: () => crosshairPoint(aimView(player.player), aspect, COURSE, bodies),
      zoomOf: () => aimView(player.player).zoom ?? 1,
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
    const size = canvasSize(canvas.clientWidth, canvas.clientHeight, window.devicePixelRatio);
    if (canvas.width !== size.width || canvas.height !== size.height) Object.assign(canvas, size);
    const inFirstPerson = player.inFirstPerson;
    const sights = shown.aiming || aimHeld || (shown.rangedDrawn && inFirstPerson);
    const feltCamera = feel.camera(aimView(player.player), fighting.player, own, inFirstPerson, sights);
    const camera = pushedIn(feltCamera, effects.anima.push);
    const eye = eyeOf(camera);
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
      const veiled = veiledIn(fighting, fighting.player);
      drawn.push({ ...ownCard, veiled, charged, exposed, smear: smear(fighting.player) });
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
      const stand = cardStand(drawnAt[0], drawnAt[1], eye.x, eye.y);
      if (card) drawn.push({ card, ...stand, z: drawnAt[2], flip, flash, veiled });
    }
    const foeFeel = { held: (id: number, view: FighterView) => feel.held(id, view), shift, drawn: figuresDrawn, smear };
    const { tickSeconds } = movement;
    drawn.push(...foes.cards(fighting, forge, eye, clock, frameTicks, tickSeconds, effects.flashes, foeFeel));
    // The player's own shots leave the weapon as drawn: the first person's muzzle, or the figure's along its shot.
    const fpMuzzle = inFirstPerson ? firstPerson.muzzle : null;
    const dropped = dropsShown.frame(gear?.drops ?? [], clock, cameraOf(camera).eye);
    const marks = effects.marks(fighting, running ? seconds : 0, {
      eye: cameraOf(camera).eye,
      blocks: COURSE,
      bodies,
      muzzleOf: (shot) =>
        fpMuzzle
          ? screenMuzzle(camera, aspect, fpMuzzle)
          : figureMuzzle([body.x, body.y, body.z], Math.atan2(shot.velocity[0], -shot.velocity[1])),
      more: [
        ...gearRings(STALL, RESOURCE_NODES, gear, clock),
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
        look: effects.ownLook,
        pulled: shown.pulled,
      },
      others,
      foes: foes.placed,
      ground: { blocks: COURSE, wooden: WOODEN },
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
      { id: fighting.player, view: own, ...handsOf(player.shownDress), looks: player.glowing },
      ...[...fighting.foes.values()].map((kept) => ({ id: kept.id, view: kept.view, ...handsOf(foes.dressOf(kept)) })),
      ...[...otherViews].map(([number, view]) => ({ id: number, view, ...handsOf(others.get(number)?.dress) })),
    ];
    scene.setSwings(feel.arcsMesh(clock, strikers, figuresDrawn, cameraOf(camera).eye, inFirstPerson));
    blood.frame(seconds, events, fighting, bloodCamera(camera, aspect));
    scene.draw(camera, canvas.width, canvas.height, drawn, chosen === you ? null : chosen, (encoder, view) => {
      if (inFirstPerson) firstPerson.draw(encoder, view, canvas.width, canvas.height);
    });
    const where = (id: number): [number, number, number] | null => {
      if (id === fighting.player && own) return [own.x, own.y, own.z];
      const figure = foes.placed.get(id) ?? others.get(id);
      return figure ? [figure.x, figure.y, figure.z] : null;
    };
    const bow = player.shownDress.outfit.right?.startsWith('bow') && own?.action.kind === 'draw';
    hud.update(
      {
        own,
        foes: foes.marked(fighting),
        where,
        matrix: viewProjection(camera, aspect),
        width: canvas.clientWidth,
        height: canvas.clientHeight,
        events,
        blocks: COURSE,
        player: fighting.player,
        firstPerson: inFirstPerson,
        pressed: shown.pressed,
        lost: link.lost,
        rejoining: link.rejoining,
        parryOpen: fighting.parryOpen,
        abilities: fighting.abilities,
        // The shots left stand beside the crosshair while the Ranged loadout is drawn.
        ammo: sights && shown.rangedDrawn ? (own?.ammo ?? null) : null,
        ammoMost: gear?.ammoMost ?? null,
        ammoFull: !!own && dropsShown.ammoFull(gear?.drops ?? [], [own.x, own.y, own.z], (gear?.ammoShare ?? 1) >= 1),
        crosshair: sights ? { charge: bow ? Math.min(1, own.action.elapsed / FIGHT_TICKS.drawFull) : null } : null,
        arms: { gear, loadout: player.player.loadout, drawn: you.dress.outfit.drawn, dress: you.dress },
      },
      seconds,
    );
    const composing = forge.pending > 0 ? ` Composing ${forge.pending} frame${forge.pending === 1 ? '' : 's'}…` : '';
    const failure = forge.failure ? ` A strip did not load: ${forge.failure}` : '';
    const line = controls.locked ? 'Playing: Escape frees the mouse.' : status;
    showPanel(panelState(looks, hair, line + composing + failure));
    const atStall = Math.hypot(player.player.body.x - STALL.x, player.player.body.y - STALL.y) <= STALL_REACH;
    showGear({ gear, atStall, nodesInReach: nodesInReach(player.player.body, RESOURCE_NODES, gear) });
    showArts(fighting.arts);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

start().catch((error: unknown) => {
  const message = error instanceof GpuUnavailable || error instanceof Error ? error.message : String(error);
  document.body.textContent = message;
  document.body.style.cssText = 'color:#ddd;padding:22px';
});
