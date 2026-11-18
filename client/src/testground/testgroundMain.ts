import { canvasSize } from '../canvasSize.ts';
import { FirstPerson } from '../firstperson/firstPerson.ts';
import { GpuUnavailable, startGpu } from '../gpu.ts';
import type { ForgeLooks } from '../forge/looks.ts';
import type { HairColours } from '../forge/skins.ts';
import { FIGHT_TICKS } from '../player/fightMoves.ts';
import { rosterOf } from '../rules/roster.ts';
import { Glides } from '../player/glide.ts';
import { Fighting } from '../combat/fighting.ts';
import { FightEffects } from '../combat/fightEffects.ts';
import { FoeFigures } from '../combat/foeFigures.ts';
import { PlayerFight } from '../combat/playerFight.ts';
import { crosshairPoint } from '../player/crosshair.ts';
import { figureMuzzle, screenMuzzle } from '../combat/tracers.ts';
import { Hud } from '../combat/hud.ts';
import { LocalRoom } from '../network/localRoom.ts';
import { roomAddress } from '../network/roomAddress.ts';
import { RoomConnection, type Snapshot } from '../network/roomConnection.ts';
import { startCombatRules } from '../rules/combatRules.ts';
import { startMovementRules } from '../rules/movementRules.ts';
import { FightBlood, surfacesOf } from '../combat/fightBlood.ts';
import { type CardAt, type Cards, openCards } from '../player/cards.ts';
import { COURSE, START } from './course.ts';
import { type Dress, plainDress } from '../player/dressing.ts';
import { type Placed, cardStand, eyeOf, frameAt, viewOf } from '../player/figures.ts';
import { type Orbit, cameraOf, viewProjection } from '../editor/orbit.ts';
import { Input } from '../player/input.ts';
import { type Player, newPlayer, playerCamera, shownBody } from '../player/player.ts';
import { AIM, type AimPlace } from '../player/playerCamera.ts';
import { OtherPlayers } from '../player/others.ts';
import { Walker } from '../player/walker.ts';
import { startAimPanel } from './aimPanel.ts';
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

/** The blood's camera for an orbit: the Test Ground's world is near its origin, so the blood keeps it as it is. */
function bloodCamera(orbit: Orbit, aspect: number) {
  const { eye, right } = cameraOf(orbit);
  const focus = [orbit.targetX, orbit.targetY, orbit.targetZ] as const;
  return { viewProjection: viewProjection(orbit, aspect), focus, eye, right };
}

async function start(): Promise<void> {
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
    fight: (foe) => fight?.ask(foe),
  });
  // Third person's aiming view where the panel places it; held there while the box is ticked, to place it by eye.
  let aimPlace: AimPlace = AIM;
  let aimHeld = false;
  startAimPanel(element<HTMLElement>('#panel'), (place, held) => {
    [aimPlace, aimHeld] = [place, held];
  });
  // The camera the player's frame is drawn from, and an aimed shot laid on its crosshair.
  const aimView = (shown: Player) => playerCamera(aimHeld ? { ...shown, aim: 1 } : shown, movement, COURSE, aimPlace);
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
  // A link that joined the room again brings every dress there with its welcome.
  let joins = 1;
  const received = (snapshot: Snapshot) => {
    if (link.joins !== joins) {
      joins = link.joins;
      otherPlayers.takeDresses(link.dressed);
      status = `Click the view to play. In the room as player ${link.player}.`;
    }
    otherPlayers.takeDresses(snapshot.dressed);
    fight?.receive(snapshot);
    otherPlayers.seen(snapshot.players, fight?.player ?? null, forge);
  };
  const link = roomUrl
    ? await RoomConnection.open(roomUrl, received)
    : LocalRoom.open(roomModule, START, COURSE, received);
  const fighting = new Fighting(combatRules, link);
  fight = fighting;
  otherPlayers.takeDresses(link.dressed);
  const steps = fighting.steps(movement);
  const playerFight = new PlayerFight(fighting, combatRules, player);
  if (roomUrl) status = `Click the view to play. In the room as player ${link.player}.`;
  const hud = new Hud(element<HTMLElement>('#hud'));
  const effects = new FightEffects();
  // The foes' figures, apart from the panel's figures; they and other players are drawn gliding between the room's
  // snapshots.
  const foes = new FoeFigures(roster);
  const otherGlides = new Glides();

  let last = performance.now();
  let clock = 0;
  const frame = (now: number) => {
    const seconds = Math.min(0.1, (now - last) / 1000);
    last = now;
    clock += seconds;
    const controls = input.frame();
    const bodies = [...foes.placed.values(), ...others.values()].map(
      (placed) => [placed.x, placed.y, placed.z] as const,
    );
    const aspect = canvas.width / Math.max(1, canvas.height);
    // Alone, the room in the page waits while the pointer is free: Escape pauses the fight.
    const running = roomUrl !== null || controls.locked;
    const shown = playerFight.frame(controls, steps, seconds, clock, {
      running,
      hands: controls.locked,
      markOf: () => crosshairPoint(aimView(player.player), aspect, COURSE, bodies),
      zoomOf: () => aimView(player.player).zoom ?? 1,
    });
    const own = fighting.own;
    const events = effects.events(fighting, seconds);
    const frameTicks = seconds / movement.tickSeconds;
    const body = shownBody(player.player);
    const size = canvasSize(canvas.clientWidth, canvas.clientHeight, window.devicePixelRatio);
    if (canvas.width !== size.width || canvas.height !== size.height) Object.assign(canvas, size);
    const camera = aimView(player.player);
    const eye = eyeOf(camera);

    const drawn: CardAt[] = [];
    const ownCard = player.figure(eye.x, eye.y, { share: effects.flashes.shareOf(fighting.player), red: true });
    if (ownCard) drawn.push(ownCard);
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
    for (const placed of figures) {
      if (placed === you) continue;
      if (placed.spin) placed.facing = (placed.facing + SPIN * seconds) % (2 * Math.PI);
      const { view, flip } = viewOf(placed.facing, placed.x, placed.y, eye.x, eye.y);
      const moveFrames = forge.frames(placed.dress.body, placed.anim);
      const shownFrame =
        placed.frame === null ? frameAt(clock, moveFrames, fps) : Math.min(placed.frame, moveFrames - 1);
      const card = forge.card(placed.id, placed.dress, placed.anim, view, shownFrame, flip);
      const flash = { share: effects.flashes.shareOf(numberOf.get(placed) ?? -1), red: false };
      if (card) drawn.push({ card, ...cardStand(placed.x, placed.y, eye.x, eye.y), z: placed.z, flip, flash });
    }
    drawn.push(...foes.cards(fighting, forge, eye, clock, frameTicks, movement.tickSeconds, effects.flashes));
    const inFirstPerson = player.inFirstPerson;
    // The player's own shots leave the weapon as drawn: the first person's muzzle, or the figure's along its shot.
    const fpMuzzle = inFirstPerson ? firstPerson.muzzle : null;
    const marks = effects.marks(fighting, running ? seconds : 0, {
      eye: cameraOf(camera).eye,
      blocks: COURSE,
      bodies,
      muzzleOf: (shot) =>
        fpMuzzle
          ? screenMuzzle(camera, aspect, fpMuzzle)
          : figureMuzzle([body.x, body.y, body.z], Math.atan2(shot.velocity[0], -shot.velocity[1])),
    });
    scene.setMarks(marks);
    blood.frame(seconds, events, fighting, bloodCamera(camera, aspect));
    scene.draw(camera, canvas.width, canvas.height, drawn, chosen === you ? null : chosen, (encoder, view) => {
      if (inFirstPerson) firstPerson.draw(encoder, view, canvas.width, canvas.height);
    });
    const where = (id: number): [number, number, number] | null => {
      if (id === fighting.player && own) return [own.x, own.y, own.z];
      const figure = foes.placed.get(id) ?? others.get(id);
      return figure ? [figure.x, figure.y, figure.z] : null;
    };
    const bow = you.dress.outfit.right?.startsWith('bow') && own?.action.kind === 'draw';
    hud.update(
      {
        own,
        foes: foes.marked(fighting),
        where,
        matrix: viewProjection(camera, aspect),
        width: canvas.clientWidth,
        height: canvas.clientHeight,
        events,
        player: fighting.player,
        firstPerson: inFirstPerson,
        pressed: shown.pressed,
        lost: link.lost,
        rejoining: link.rejoining,
        parryOpen: fighting.parryOpen,
        crosshair:
          shown.aiming || aimHeld || (shown.ranged && inFirstPerson)
            ? { charge: bow ? Math.min(1, own.action.elapsed / FIGHT_TICKS.drawFull) : null }
            : null,
      },
      seconds,
    );
    const composing = forge.pending > 0 ? ` Composing ${forge.pending} frame${forge.pending === 1 ? '' : 's'}…` : '';
    const failure = forge.failure ? ` A strip did not load: ${forge.failure}` : '';
    const line = controls.locked ? 'Playing: Escape frees the mouse.' : status;
    showPanel(panelState(looks, hair, line + composing + failure));
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

start().catch((error: unknown) => {
  const message = error instanceof GpuUnavailable || error instanceof Error ? error.message : String(error);
  document.body.textContent = message;
  document.body.style.cssText = 'color:#ddd;font:16px system-ui;padding:24px';
});
