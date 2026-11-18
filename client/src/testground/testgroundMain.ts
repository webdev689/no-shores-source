import { canvasSize } from '../canvasSize.ts';
import { FirstPerson } from '../firstperson/firstPerson.ts';
import { GpuUnavailable, startGpu } from '../gpu.ts';
import type { Colours } from '../forge/compose.ts';
import { type DyeTable, PaletteSnap } from '../forge/dyes.ts';
import type { ForgeLooks } from '../forge/looks.ts';
import type { HairColours, RaceSkins } from '../forge/skins.ts';
import { ForgeStore } from '../forge/store.ts';
import { FIGHT_TICKS, HELD, fightButtons, fightHands, fightOf, guardPose } from '../player/fightMoves.ts';
import { FoeFigures } from '../player/foeFigures.ts';
import { Glides } from '../player/glide.ts';
import { type TelegraphMark, marksMesh } from '../combat/marks.ts';
import { Fighting } from '../combat/fighting.ts';
import { crosshairPoint, screenMuzzle, shotStop } from '../player/crosshair.ts';
import { Flashes } from '../combat/flashes.ts';
import { Sparks } from '../combat/sparks.ts';
import { IMPACT_SPARKS, type ShotStops, Tracers, figureMuzzle, othersArrows } from '../combat/tracers.ts';
import { Hud } from '../combat/hud.ts';
import { LocalRoom } from '../network/localRoom.ts';
import { roomAddress } from '../network/roomAddress.ts';
import { type GearMessage, RoomConnection, type Snapshot } from '../network/roomConnection.ts';
import { startCombatRules } from '../rules/combatRules.ts';
import { startMovementRules } from '../rules/movementRules.ts';
import { TestgroundBlood } from './blood.ts';
import { type CardAt, Cards } from '../player/cards.ts';
import { COURSE, RESOURCE_NODES, STALL, START } from './course.ts';
import { STALL_REACH, gearRings, nodesInReach } from './gearGround.ts';
import { startGearPanel } from './gearPanel.ts';
import type { GearState } from '../network/gearMessages.ts';
import { SLOTS, worn } from '../player/gear.ts';
import { gearOutfit } from '../player/gearLooks.ts';
import { type Dress, plainDress, wardrobeOf } from '../player/dressing.ts';
import { type Placed, cardStand, eyeOf, frameAt, viewOf } from '../player/figures.ts';
import { cameraOf, viewProjection } from '../editor/orbit.ts';
import { Input } from '../player/input.ts';
import { CAST_SECONDS, newPlayer, playerCamera, shownBody, updatePlayer } from '../player/player.ts';
import { OtherPlayers, RUNNING } from '../player/others.ts';
import { GALLOP, HIDE_FIGURE_M, STILL, shownDress, strokesAfter } from '../player/walker.ts';
import { likelyMoves, shownMove } from '../player/playerMoves.ts';
import { startPanel } from './panel.ts';
import { SceneView } from './sceneView.ts';

/** How fast a figure set turning round turns, in radians a second: a full turn in 8 seconds. */
const SPIN = (2 * Math.PI) / 8;
/** The player's own figure, listed first in the panel. */
const PLAYER_ID = 1;
/** How long each frame of a move chosen in the panel plays on the player. */
const ACT_FRAME = 0.2;

function element<T extends Element>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`the page has no ${selector}`);
  return found;
}

async function start(): Promise<void> {
  const canvas = element<HTMLCanvasElement>('#ground');
  const gpu = await startGpu(canvas);
  const scene = new SceneView(gpu);
  scene.setBlocks(COURSE);
  const blood = new TestgroundBlood(gpu, COURSE, location.search);
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
  const input = new Input(canvas);
  let status = 'Reading the forge…';
  let fps = 6;
  let player = newPlayer(movement, START.x, START.y);
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
  const showPanel = startPanel(element<HTMLElement>('#panel'), {
    add: () => {
      const ahead = 3;
      const x = player.body.x + Math.sin(player.yaw) * ahead;
      const y = player.body.y - Math.cos(player.yaw) * ahead;
      chosen = place(plainDress('human', 0.6), x, y, player.yaw + Math.PI);
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
      const seconds = (cards?.frames(you.dress.body, anim) ?? 1) * ACT_FRAME;
      player = { ...player, act: { anim, elapsed: 0, seconds } };
    },
    fight: (kind, level) => fight?.askFoe(kind, level),
  });
  // The player's gear, as the room last sent it, and the panel that shows it and asks of it.
  let gear: GearState | null = null;
  const showGear = startGearPanel(element<HTMLElement>('#gear-panel'), (ask) => fight?.askGear(ask));
  const panelState = (looks: ForgeLooks, hair: HairColours, line: string) => ({
    looks,
    hair,
    figures,
    remote: new Set(others.values()),
    chosen,
    fps,
    playerId: PLAYER_ID,
    playing: input.locked,
    status: line,
  });
  showPanel(panelState({ bodies: {} }, { bodies: {} }, status));
  const store = await ForgeStore.open();
  const [looks, skins, hair, dyes] = await Promise.all([
    store.table<ForgeLooks>('looks'),
    store.table<RaceSkins>('skins'),
    store.table<HairColours>('hair'),
    store.table<DyeTable>('dyes'),
  ]);
  const colours: Colours = { skins, hair, snap: new PaletteSnap(dyes.palette) };
  const forge = new Cards(scene, store, looks, colours, dyes);
  cards = forge;
  // The first person swings in the direction the fight's rules began the swing with.
  const strokeShare = () => {
    const action = fight?.own?.action;
    const stroke = action?.kind === 'attack' ? action.stroke : (fight?.stroke ?? 1);
    return (stroke - 0.5) / 6;
  };
  const firstPerson = await FirstPerson.open(gpu, store, strokeShare);
  status = 'Click the view to play.';
  canvas.addEventListener('click', () => {
    if (!input.locked) input.lock();
  });

  // With ?room=<name> (or a whole ws:// address), the Test Ground joins that room on a server; without one it plays in
  // a room in the page. Either way the player's fighter is predicted here and set by the room's word, each tick's
  // intent goes to the room, and every other player and foe stands where the room last saw them.
  const given = new URLSearchParams(location.search).get('room');
  const roomUrl = given === null ? null : roomAddress(given);
  if (given !== null && !roomUrl)
    throw new Error(`"${given}" is not a room: a room's name is letters, digits and hyphens`);
  const received = (snapshot: Snapshot) => {
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
  fight = new Fighting(combatRules, link);
  // The room in the page runs one tick at once, so the player's fighter and gear are known before they first play.
  if (!roomUrl) link.pump(movement.tickSeconds);
  otherPlayers.takeDresses(link.dressed);
  const steps = fight.steps(movement);
  if (roomUrl) status = `Click the view to play. In the room as player ${link.player}.`;
  const hud = new Hud(element<HTMLElement>('#hud'));
  const flashes = new Flashes();
  const sparks = new Sparks();
  const tracers = new Tracers();
  /** The foes' figures, by the room's number for each, apart from the panel's figures; they and other players are
   *  drawn gliding between the room's snapshots. */
  const foeFigures = new FoeFigures(forge);
  const otherGlides = new Glides();
  let armsKey = '';
  let gearWornKey = '';

  let last = performance.now();
  let clock = 0;
  // How far the player has walked, for the first person's bob and stride; and the swings struck, each the other stroke.
  let stride = 0;
  let strokes = 0;
  let swingWas: number | null = null;
  const frame = (now: number) => {
    const seconds = Math.min(0.1, (now - last) / 1000);
    last = now;
    clock += seconds;
    const controls = input.frame();
    // The figure wears what the gear wears, and the hands hold it: the room takes no other arms.
    const ownGear = gear;
    const gearWorn =
      ownGear && JSON.stringify([you.dress.body, ...SLOTS.map((unused, slot) => worn(ownGear, slot) ?? 0)]);
    const bodyLayers = looks.bodies[you.dress.body]?.layers;
    if (ownGear && gearWorn && gearWorn !== gearWornKey && bodyLayers) {
      gearWornKey = gearWorn;
      you.dress = {
        ...you.dress,
        outfit: gearOutfit(ownGear, wardrobeOf(you.dress.body, bodyLayers), you.dress.outfit),
      };
    }
    const wasDrawn = you.dress.outfit.drawn;
    const fightHanded = fightHands(controls, player, wasDrawn, you.dress.outfit.right);
    const { armed, shooter, ranged, aiming } = fightHanded;
    const bodies = [...foeFigures.placed.values(), ...others.values()].map(
      (placed) => [placed.x, placed.y, placed.z] as const,
    );
    const aspect = canvas.width / Math.max(1, canvas.height);
    // A bow, a crossbow or a gun drawn: the right button aims it, laying its shot on the crosshair's point.
    const mark = aiming ? crosshairPoint(playerCamera(player, movement, COURSE), aspect, COURSE, bodies) : null;
    fight.press(fightButtons(controls, fightHanded, player.pitch, mark));
    if (controls.locked) {
      const foe = fight.targetAt;
      const toward = foe && Math.atan2(foe.x - player.body.x, -(foe.y - player.body.y));
      player = updatePlayer(
        { ...player, drawn: wasDrawn },
        controls,
        steps,
        seconds,
        firstPerson.swing !== null,
        toward,
        aiming,
      );
      if (player.drawn !== wasDrawn) you.dress = { ...you.dress, outfit: { ...you.dress.outfit, drawn: player.drawn } };
    }
    // Alone, the room in the page waits while the pointer is free: Escape pauses the fight. An ask made from the
    // panel meanwhile still goes, carried by a tick of the player standing still.
    if (!controls.locked && fight.asking) {
      const still = { forward: 0, sideways: 0, yaw: player.yaw, run: false, jump: false, crouch: false };
      player = { ...player, body: steps.step(player.body, { ...still, mounted: player.mounted }) };
      if (!roomUrl) fight.pump(movement.tickSeconds);
    }
    if (roomUrl || controls.locked) fight.pump(seconds);
    const own = fight.own;
    const events = fight.takeEvents();
    flashes.update(events, seconds);
    sparks.update(seconds);
    sparks.struck(events, (id) => {
      const fighter = id === fight.player ? fight.own : (fight.foes.get(id)?.view ?? fight.others.get(id)?.body);
      return fighter ? [fighter.x, fighter.y, fighter.z] : null;
    });
    const frameTicks = seconds / movement.tickSeconds;
    const body = shownBody(player);
    // Fighting, the figure faces where its arms point.
    const fighting = own && own.action.kind !== 'idle' && own.action.kind !== 'dead';
    Object.assign(you, { x: body.x, y: body.y, facing: fighting ? own.aim : player.facing });
    const size = canvasSize(canvas.clientWidth, canvas.clientHeight, window.devicePixelRatio);
    if (canvas.width !== size.width || canvas.height !== size.height) Object.assign(canvas, size);
    const camera = playerCamera(player, movement, COURSE);
    const eye = eyeOf(camera);

    const drawn: CardAt[] = [];
    // On a wall or a ledge the hands hold on: the weapon is worn, not held.
    const holding = player.mounted || body.mode === 'ground' || body.mode === 'air';
    const youDress = shownDress(you.dress, holding);
    const { outfit } = youDress;
    const handsKey = `${outfit.right}|${outfit.left}|${outfit.drawn}`;
    if (handsKey !== armsKey) {
      armsKey = handsKey;
      fight.arms = combatRules.armsCode(outfit.right, outfit.left, outfit.drawn);
    }
    const speed = Math.hypot(body.vx, body.vy);
    if (body.moving && body.mode === 'ground') stride += speed * seconds;
    // The first person follows the fight's rules: a swing as the rules begin one, a shot while they let one go.
    const swings = controls.locked && wasDrawn && outfit.drawn && holding && !player.mounted;
    const held = own && HELD.has(own.action.kind);
    const begun = fight.swingsBegun > 0;
    fight.swingsBegun = 0;
    // A swing the rules end early (a dodge, a flinch, a guard) ends in the first person too, as does a bow's draw let
    // go too soon to shoot.
    if ((own && !shooter && own.action.kind !== 'attack') || (shooter && fight.drawsDropped > 0)) firstPerson.cancel();
    fight.drawsDropped = 0;
    const button =
      !swings || held
        ? STILL
        : shooter
          ? {
              // Aiming, the rules fire only on a fresh pull: a trigger held through a reload fires nothing.
              attackHeld: !aiming && controls.held('guard'),
              attackPressed: controls.pressed('guard'),
              attackReleased: controls.released('guard'),
              aimHeld: aiming,
            }
          : { attackHeld: false, attackPressed: begun, attackReleased: false };
    firstPerson.update(seconds, button, {
      right: outfit.right,
      left: outfit.left,
      armour: { gauntlets: outfit.armour.gauntlets, boots: outfit.armour.boots },
      drawn: outfit.drawn,
      moving: body.moving,
      running: speed > (player.mounted ? GALLOP : RUNNING),
      stride,
      casting: player.cast !== null,
      climbing: holding ? 0 : 1,
      mounted: player.mounted,
      yaw: player.yaw,
      blocking: own?.action.kind === 'guard' || own?.action.kind === 'parry',
      pose: own ? guardPose(own.action) : null,
    });
    const swing = firstPerson.swing;
    strokes = strokesAfter(strokes, swingWas, swing?.progress ?? null);
    swingWas = swing?.progress ?? null;
    const ownFight = own ? fightOf(own) : null;
    const shown = shownMove(
      {
        mode: body.mode,
        moving: body.moving,
        running: speed > RUNNING,
        crouched: body.crouched,
        mounted: player.mounted,
        speed,
        vz: body.vz,
        over: body.over?.progress ?? 0,
        drawn: outfit.drawn,
        right: outfit.right,
        left: outfit.left,
        blow: swing && {
          direction: swing.direction,
          reload: swing.reload,
          // A pair's blows are its two hands' strokes; one weapon's alternate.
          second: swing.paired ? swing.hand === 'left' : strokes % 2 === 0,
          progress: swing.progress,
          lands: swing.lands,
        },
        cast: player.cast === null ? null : player.cast / CAST_SECONDS,
        act: player.act && { anim: player.act.anim, progress: player.act.elapsed / player.act.seconds },
        // A bow's draw plays with the first person's, and a shot's frames over a gun's aim pose.
        fight: ownFight?.kind === 'draw' && (outfit.right?.startsWith('bow') || swing) ? null : ownFight,
      },
      (anim) => forge.frames(youDress.body, anim),
      (anim, held) => forge.draws(youDress.body, anim, held),
    );
    const hands = outfit.drawn ? [outfit.right, outfit.left] : [null, null];
    forge.warm(
      youDress,
      likelyMoves(hands[0] ?? null, hands[1] ?? null, (anim, held) => forge.draws(youDress.body, anim, held)),
    );
    forge.pump();
    const frames = forge.frames(youDress.body, shown.anim);
    const index = shown.frame ?? Math.floor(clock / Math.max(shown.frameSeconds, 0.01)) % frames;
    fight.look = { anim: shown.anim, frame: index, facing: you.facing };
    fight.dress = JSON.stringify(youDress);
    if (player.view.shown > HIDE_FIGURE_M) {
      const { view, flip } = viewOf(you.facing, body.x, body.y, eye.x, eye.y);
      const card = forge.card(you.id, youDress, shown.anim, view, index, flip);
      const flash = { share: flashes.shareOf(fight.player), red: true };
      if (card) drawn.push({ card, ...cardStand(body.x, body.y, eye.x, eye.y), z: body.z, flip, flash });
    }
    for (const [number, placed] of others) {
      const body = fight.others.get(number)?.body;
      if (body)
        [placed.x, placed.y, placed.z] = otherGlides.follow(
          number,
          [body.x, body.y, body.z],
          fight.roomTick,
          frameTicks,
        );
    }
    otherGlides.keep(new Set(others.keys()));
    const numberOf = new Map([...others].map(([number, placed]) => [placed, number]));
    for (const placed of figures) {
      if (placed === you) continue;
      if (placed.spin) placed.facing = (placed.facing + SPIN * seconds) % (2 * Math.PI);
      const { view, flip } = viewOf(placed.facing, placed.x, placed.y, eye.x, eye.y);
      const moveFrames = forge.frames(placed.dress.body, placed.anim);
      const shownFrame =
        placed.frame === null ? frameAt(clock, moveFrames, fps) : Math.min(placed.frame, moveFrames - 1);
      const card = forge.card(placed.id, placed.dress, placed.anim, view, shownFrame, flip);
      const flash = { share: flashes.shareOf(numberOf.get(placed) ?? -1), red: false };
      if (card) drawn.push({ card, ...cardStand(placed.x, placed.y, eye.x, eye.y), z: placed.z, flip, flash });
    }
    const time = { clock, roomTick: fight.roomTick, frameTicks, tickSeconds: movement.tickSeconds };
    drawn.push(...foeFigures.cards(fight.foes.values(), eye, time, (id) => flashes.shareOf(id)));
    const telegraphs = [...fight.foes.values()].flatMap((kept): TelegraphMark[] =>
      kept.view.action.kind === 'telegraph' ? [kept.view.action] : [],
    );
    const inFirstPerson = player.view.shown <= HIDE_FIGURE_M;
    // The player's own shots leave the weapon as drawn: the first person's muzzle, or the figure's along its shot.
    const fpMuzzle = inFirstPerson ? firstPerson.muzzle : null;
    tracers.fired(fight.fired.splice(0), (shot) =>
      fpMuzzle
        ? screenMuzzle(camera, aspect, fpMuzzle)
        : figureMuzzle([body.x, body.y, body.z], Math.atan2(shot.velocity[0], -shot.velocity[1])),
    );
    tracers.seen(fight.takeShots(), fight.player);
    const stops: ShotStops = (from, along) => shotStop(from, along, COURSE, bodies);
    for (const impact of tracers.update(seconds, stops)) sparks.burst(impact.at, impact.back, IMPACT_SPARKS);
    const traced = tracers.mesh(cameraOf(camera).eye, fight.shots, fight.player);
    const rings = gearRings(STALL, RESOURCE_NODES, gear, clock);
    scene.setMarks(
      marksMesh(telegraphs, othersArrows(fight.shots, fight.player), sparks.flying, [...traced, ...rings]),
    );
    blood.frame(seconds, events, fight, camera, canvas.width / Math.max(1, canvas.height));
    scene.draw(camera, canvas.width, canvas.height, drawn, chosen === you ? null : chosen, (encoder, view) => {
      if (inFirstPerson) firstPerson.draw(encoder, view, canvas.width, canvas.height);
    });
    const where = (id: number): [number, number, number] | null => {
      if (id === fight.player && own) return [own.x, own.y, own.z];
      const figure = foeFigures.placed.get(id) ?? others.get(id);
      return figure ? [figure.x, figure.y, figure.z] : null;
    };
    // Each foe marked where its figure is drawn.
    const foesMarked = foeFigures.marked(fight.foes.values());
    const matrix = viewProjection(camera, canvas.width / Math.max(1, canvas.height));
    hud.update(
      {
        own,
        foes: foesMarked,
        where,
        matrix,
        width: canvas.clientWidth,
        height: canvas.clientHeight,
        events,
        player: fight.player,
        firstPerson: inFirstPerson,
        pressed: (armed && !shooter && controls.pressed('swing')) || (controls.locked && controls.pressed('dodge')),
        lost: link.lost,
        parryOpen: fight.parryOpen,
        crosshair:
          aiming || (ranged && inFirstPerson)
            ? {
                charge:
                  you.dress.outfit.right?.startsWith('bow') && own?.action.kind === 'draw'
                    ? Math.min(1, own.action.elapsed / FIGHT_TICKS.drawFull)
                    : null,
              }
            : null,
      },
      seconds,
    );
    const composing = forge.pending > 0 ? ` Composing ${forge.pending} frame${forge.pending === 1 ? '' : 's'}…` : '';
    const failure = forge.failure ? ` A strip did not load: ${forge.failure}` : '';
    const line = controls.locked ? 'Playing: Escape frees the mouse.' : status;
    showPanel(panelState(looks, hair, line + composing + failure));
    const atStall = Math.hypot(player.body.x - STALL.x, player.body.y - STALL.y) <= STALL_REACH;
    showGear({ gear, atStall, nodesInReach: nodesInReach(player.body, RESOURCE_NODES, gear) });
    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);
}

start().catch((error: unknown) => {
  const message = error instanceof GpuUnavailable || error instanceof Error ? error.message : String(error);
  document.body.textContent = message;
  document.body.style.cssText = 'color:#ddd;font:16px system-ui;padding:24px';
});
