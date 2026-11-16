import { canvasSize } from '../canvasSize.ts';
import { FirstPerson } from '../firstperson/firstPerson.ts';
import { GpuUnavailable, startGpu } from '../gpu.ts';
import type { Colours } from '../forge/compose.ts';
import { type DyeTable, PaletteSnap } from '../forge/dyes.ts';
import type { ForgeLooks } from '../forge/looks.ts';
import type { HairColours, RaceSkins } from '../forge/skins.ts';
import { ForgeStore } from '../forge/store.ts';
import { Prediction } from '../network/prediction.ts';
import { roomAddress } from '../network/roomAddress.ts';
import { RoomConnection } from '../network/roomConnection.ts';
import { type MovementRules, startMovementRules } from '../rules/movementRules.ts';
import { Cards } from './cards.ts';
import { COURSE, START } from './course.ts';
import type { Dress } from './dressing.ts';
import { type Placed, cardStand, eyeOf, frameAt, viewOf } from './figures.ts';
import { Input } from './input.ts';
import { CAST_SECONDS, newPlayer, playerCamera, shownBody, updatePlayer } from './player.ts';
import { RUNNING, showOther } from './others.ts';
import { likelyMoves, shownMove } from './playerMoves.ts';
import { startPanel } from './panel.ts';
import { type CardAt, SceneView } from './sceneView.ts';

/** How fast a figure set turning round turns, in radians a second: a full turn in 8 seconds. */
const SPIN = (2 * Math.PI) / 8;
/** The player's own figure, listed first in the panel. */
const PLAYER_ID = 1;
/** How long each frame of a move chosen in the panel plays on the player. */
const ACT_FRAME = 0.2;
/** Nearer than this, the third-person camera is inside the figure, so it is not drawn. */
const HIDE_FIGURE_M = 0.6;
/** Faster than a horse's walk is a gallop. */
const GALLOP = 10;
/** The weapon's button, untouched: what the first person's weapon gets while it may not swing. */
const STILL = { attackHeld: false, attackPressed: false, attackReleased: false };

function element<T extends Element>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`the page has no ${selector}`);
  return found;
}

const plainDress = (race: Dress['race'], tone: number): Dress => ({
  body: 'male',
  race,
  tone,
  outfit: {
    armour: {},
    garments: ['shirt_long_v', 'breeches', 'boots'],
    dyes: { shirt_long_v: 'White', breeches: 'DarkBrown', boots: 'DarkBrown' },
    right: 'sword_iron',
    left: null,
    drawn: false,
    hair: { style: 'crop', colour: 'brown' },
  },
});

async function start(): Promise<void> {
  const canvas = element<HTMLCanvasElement>('#ground');
  const gpu = await startGpu(canvas);
  const scene = new SceneView(gpu);
  scene.setBlocks(COURSE);
  // The body moves by the Rust movement rules, run in WebAssembly.
  const movement = await startMovementRules(
    await (await fetch(`${import.meta.env.BASE_URL}movement.wasm`)).arrayBuffer(),
  );
  movement.setCourse(COURSE);
  const input = new Input(canvas);
  let status = 'Reading the forge…';
  let fps = 6;
  let player = newPlayer(movement, START.x, START.y);
  let nextId = PLAYER_ID;
  const figures: Placed[] = [];
  const place = (dress: Dress, x: number, y: number, facing: number): Placed => {
    const placed: Placed = { id: nextId++, x, y, z: 0, facing, dress, anim: 'idle', spin: false };
    figures.push(placed);
    return placed;
  };
  const you = place(plainDress('human', 0.3), START.x, START.y, 0);
  let chosen: Placed = you;
  let cards: Cards | null = null;
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
  });
  const panelState = (looks: ForgeLooks, hair: HairColours, line: string) => ({
    looks,
    hair,
    figures,
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
  const firstPerson = await FirstPerson.open(gpu, store);
  status = 'Click the view to play.';
  canvas.addEventListener('click', () => {
    if (!input.locked) input.lock();
  });

  // With ?room=<name> (or a whole ws:// address), the Test Ground joins that room: the player is predicted here and
  // corrected by the room's word, each tick's controls go to the room, and every other player stands where the room
  // last saw them.
  let steps: MovementRules = movement;
  const given = new URLSearchParams(location.search).get('room');
  const roomUrl = given === null ? null : roomAddress(given);
  if (given !== null && !roomUrl)
    throw new Error(`"${given}" is not a room: a room's name is letters, digits and hyphens`);
  if (roomUrl) {
    const prediction = new Prediction();
    const others = new Map<number, Placed>();
    let own = 0;
    const connection = await RoomConnection.open(roomUrl, (snapshot) => {
      const present = new Set<number>();
      for (const { player: number, acknowledged, body } of snapshot.players) {
        present.add(number);
        if (number === own) {
          player = {
            ...player,
            body: prediction.corrected(body, acknowledged, (from, ask) => movement.step(from, ask)),
          };
          continue;
        }
        const placed = others.get(number) ?? place(plainDress('human', 0.6), body.x, body.y, body.facing);
        others.set(number, placed);
        showOther(placed, body);
      }
      for (const [number, placed] of others) {
        if (present.has(number)) continue;
        figures.splice(figures.indexOf(placed), 1);
        others.delete(number);
        if (chosen === placed) chosen = you;
      }
    });
    own = connection.player;
    steps = {
      ...movement,
      step: (body, controls) => {
        connection.send(prediction.next(controls), controls);
        return movement.step(body, controls);
      },
    };
    status = `Click the view to play. In the room as player ${own}.`;
  }

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
    const wasDrawn = you.dress.outfit.drawn;
    if (controls.locked) {
      player = updatePlayer({ ...player, drawn: wasDrawn }, controls, steps, seconds, firstPerson.swing !== null);
      if (player.drawn !== wasDrawn) you.dress = { ...you.dress, outfit: { ...you.dress.outfit, drawn: player.drawn } };
    }
    const body = shownBody(player);
    Object.assign(you, { x: body.x, y: body.y, facing: player.facing });
    const size = canvasSize(canvas.clientWidth, canvas.clientHeight, window.devicePixelRatio);
    if (canvas.width !== size.width || canvas.height !== size.height) Object.assign(canvas, size);
    const camera = playerCamera(player, movement, COURSE);
    const eye = eyeOf(camera);

    const drawn: CardAt[] = [];
    // On a wall or a ledge the hands hold on: the weapon is worn, not held.
    const holding = player.mounted || body.mode === 'ground' || body.mode === 'air';
    const youDress: Dress = holding ? you.dress : { ...you.dress, outfit: { ...you.dress.outfit, drawn: false } };
    const { outfit } = youDress;
    const speed = Math.hypot(body.vx, body.vy);
    if (body.moving && body.mode === 'ground') stride += speed * seconds;
    // The weapon swings only once it is out, on foot, with the hands free; the click that readies it does not swing.
    const swings = controls.locked && wasDrawn && outfit.drawn && holding && !player.mounted;
    const button = swings
      ? {
          attackHeld: controls.held('swing'),
          attackPressed: controls.pressed('swing'),
          attackReleased: controls.released('swing'),
        }
      : STILL;
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
    });
    const swing = firstPerson.swing;
    // A swing begins where there was none, or where the last one ended and the next began within the frame.
    if (swing && (swingWas === null || swing.progress < swingWas)) strokes += 1;
    swingWas = swing?.progress ?? null;
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
        },
        cast: player.cast === null ? null : player.cast / CAST_SECONDS,
        act: player.act && { anim: player.act.anim, progress: player.act.elapsed / player.act.seconds },
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
    if (player.view.shown > HIDE_FIGURE_M) {
      const { view, flip } = viewOf(player.facing, body.x, body.y, eye.x, eye.y);
      const frames = forge.frames(youDress.body, shown.anim);
      const index = shown.frame ?? Math.floor(clock / Math.max(shown.frameSeconds, 0.01)) % frames;
      const card = forge.card(you.id, youDress, shown.anim, view, index, flip);
      if (card) drawn.push({ card, ...cardStand(body.x, body.y, eye.x, eye.y), z: body.z, flip });
    }
    for (const placed of figures) {
      if (placed === you) continue;
      if (placed.spin) placed.facing = (placed.facing + SPIN * seconds) % (2 * Math.PI);
      const { view, flip } = viewOf(placed.facing, placed.x, placed.y, eye.x, eye.y);
      const index = frameAt(clock, forge.frames(placed.dress.body, placed.anim), fps);
      const card = forge.card(placed.id, placed.dress, placed.anim, view, index, flip);
      if (card) drawn.push({ card, ...cardStand(placed.x, placed.y, eye.x, eye.y), z: placed.z, flip });
    }
    const inFirstPerson = player.view.shown <= HIDE_FIGURE_M;
    scene.draw(camera, canvas.width, canvas.height, drawn, chosen === you ? null : chosen, (encoder, view) => {
      if (inFirstPerson) firstPerson.draw(encoder, view, canvas.width, canvas.height);
    });
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
