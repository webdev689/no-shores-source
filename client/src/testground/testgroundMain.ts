import { canvasSize } from '../canvasSize.ts';
import { FirstPerson } from '../firstperson/firstPerson.ts';
import { GpuUnavailable, startGpu } from '../gpu.ts';
import type { Colours } from '../forge/compose.ts';
import { type DyeTable, PaletteSnap } from '../forge/dyes.ts';
import type { ForgeLooks } from '../forge/looks.ts';
import type { HairColours, RaceSkins } from '../forge/skins.ts';
import { ForgeStore } from '../forge/store.ts';
import type { Action } from '../rules/fighters.ts';
import { FIGHT_TICKS, fightOf, foeDoing } from './fightMoves.ts';
import { foeKind } from './foeKinds.ts';
import { Glides } from './glide.ts';
import { type TelegraphMark, marksMesh } from '../combat/marks.ts';
import { Fighting } from '../combat/fighting.ts';
import { crosshairPoint } from './crosshair.ts';
import { Flashes } from '../combat/flashes.ts';
import { Sparks } from '../combat/sparks.ts';
import { IMPACT_SPARKS, Tracers, figureMuzzle, othersArrows, screenMuzzle } from './tracers.ts';
import { Hud } from '../combat/hud.ts';
import { LocalRoom } from '../network/localRoom.ts';
import type { PlayerDress } from '../network/messages.ts';
import { roomAddress } from '../network/roomAddress.ts';
import { RoomConnection, type Snapshot } from '../network/roomConnection.ts';
import { startCombatRules } from '../rules/combatRules.ts';
import { startMovementRules } from '../rules/movementRules.ts';
import { TestgroundBlood } from './blood.ts';
import { type CardAt, Cards } from '../player/cards.ts';
import { COURSE, START } from './course.ts';
import { type Dress, dressFrom, plainDress } from '../player/dressing.ts';
import { type Placed, cardStand, eyeOf, frameAt, viewOf } from '../player/figures.ts';
import { cameraOf, viewProjection } from '../editor/orbit.ts';
import { Input } from '../player/input.ts';
import { CAST_SECONDS, newPlayer, playerCamera, shownBody, updatePlayer } from '../player/player.ts';
import { RUNNING, showOther } from '../player/others.ts';
import { likelyMoves, shownMove } from '../player/playerMoves.ts';
import { startPanel } from './panel.ts';
import { SceneView } from './sceneView.ts';

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
/** The weapons that shoot: their button draws or fires, as the fight's rules take a shot. */
const SHOOTERS = /^(bow|crossbow|pistolet|thunderlock)(_|$)/;
/** The first person's guard, a weapon's own stroke frame held upright across the middle of the view, and a parry's
 *  deflect, the next stroke's middle frames played through. */
const GUARD_POSE = { record: 3, frame: 2 } as const;
const PARRY_RECORD = 4;
const guardPose = (action: Action) => {
  if (action.kind === 'guard') return GUARD_POSE;
  if (action.kind !== 'parry') return null;
  return { record: PARRY_RECORD, frame: 1 + Math.min(2, Math.floor((action.elapsed / FIGHT_TICKS.parry) * 3)) };
};
/** What the fight holds the player to, when their weapon neither swings nor shoots. */
const HELD = new Set(['flinch', 'staggered', 'down', 'dead', 'dodge', 'guard', 'parry', 'telegraph', 'overreach']);

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
    fight: (kind) => fight?.ask(kind),
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
  const others = new Map<number, Placed>();
  const dresses = new Map<number, Dress>();
  // Another player's dress is used only when it is one: a broken or hostile one keeps the dress they had.
  const takeDresses = (dressed: readonly PlayerDress[]) => {
    for (const { player: number, dress } of dressed) {
      const taken = dressFrom(dress);
      if (!taken) continue;
      dresses.set(number, taken);
      const placed = others.get(number);
      if (placed) placed.dress = taken;
    }
  };
  const received = (snapshot: Snapshot) => {
    takeDresses(snapshot.dressed);
    fight?.receive(snapshot);
    const present = new Set<number>();
    for (const seen of snapshot.players) {
      const { player: number, body } = seen;
      if (number === fight?.player) continue;
      present.add(number);
      const dress = dresses.get(number) ?? plainDress('human', 0.6);
      const placed = others.get(number) ?? place(dress, body.x, body.y, body.facing);
      others.set(number, placed);
      showOther(placed, seen, (anim) => forge.draws(placed.dress.body, anim, null));
    }
    for (const [number, placed] of others) {
      if (present.has(number)) continue;
      figures.splice(figures.indexOf(placed), 1);
      others.delete(number);
      if (chosen === placed) chosen = you;
    }
  };
  const link = roomUrl
    ? await RoomConnection.open(roomUrl, received)
    : LocalRoom.open(roomModule, START, COURSE, received);
  fight = new Fighting(combatRules, link);
  takeDresses(link.dressed);
  const steps = fight.steps(movement);
  if (roomUrl) status = `Click the view to play. In the room as player ${link.player}.`;
  const hud = new Hud(element<HTMLElement>('#hud'));
  const flashes = new Flashes();
  const sparks = new Sparks();
  const tracers = new Tracers();
  /** The foes' figures, by the room's number for each, apart from the panel's figures; they and other players are
   *  drawn gliding between the room's snapshots. */
  const foeFigures = new Map<number, Placed>();
  const foeGlides = new Glides();
  const otherGlides = new Glides();
  let foeId = -1;
  let armsKey = '';

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
    // The fight's buttons for this frame's ticks: a swing or a shot only with the weapon already out, on foot, the
    // hands free; a guard on foot; a dodge whenever pressed (the rules refuse one in the air or the saddle).
    const free = player.body.mode === 'ground' || player.body.mode === 'air';
    const armed = controls.locked && wasDrawn && free && !player.mounted;
    const shooter = SHOOTERS.test(you.dress.outfit.right ?? '');
    // A bow, a crossbow or a gun drawn: the right button aims it, laying its shot on the crosshair's point, and the
    // left fires it; no guard rises behind it.
    const ranged = armed && shooter;
    const aiming = ranged && controls.held('swing');
    const guards = controls.locked && free && !player.mounted && !ranged;
    const bodies = [...foeFigures.values(), ...others.values()].map(
      (placed) => [placed.x, placed.y, placed.z] as const,
    );
    const aspect = canvas.width / Math.max(1, canvas.height);
    const mark = aiming ? crosshairPoint(playerCamera(player, movement, COURSE), aspect, COURSE, bodies) : null;
    // Each press is the fight's even when let go within the frame; one of the guard's two keys pressed while the
    // other is held is a fresh press.
    fight.press({
      swing: armed && !shooter && controls.held('swing'),
      shoot: ranged && controls.held('guard'),
      guard: guards && controls.held('guard'),
      dodge: controls.locked && controls.pressed('dodge'),
      pitch: -player.pitch,
      aim: aiming,
      mark,
      swingPressed: armed && !shooter && controls.pressed('swing'),
      shootPressed: ranged && controls.pressed('guard'),
      guardPressed: guards && controls.pressed('guard'),
    });
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
    // Alone, the room in the page waits while the pointer is free: Escape pauses the fight.
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
    const youDress: Dress = holding ? you.dress : { ...you.dress, outfit: { ...you.dress.outfit, drawn: false } };
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
              attackHeld: controls.held('guard'),
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
      aim: player.aim,
    });
    const swing = firstPerson.swing;
    // A swing begins where there was none, or where the last one ended and the next began within the frame.
    if (swing && (swingWas === null || swing.progress < swingWas)) strokes += 1;
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
        // A bow's draw plays with the first person's.
        fight: ownFight?.kind === 'draw' ? null : ownFight,
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
    drawn.push(...drawFoes(eye, frameTicks));
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
    tracers.seen(fight.shots, fight.player);
    for (const impact of tracers.update(seconds, COURSE, bodies)) sparks.burst(impact.at, impact.back, IMPACT_SPARKS);
    const traced = tracers.mesh(cameraOf(camera).eye, fight.shots, fight.player);
    scene.setMarks(marksMesh(telegraphs, othersArrows(fight.shots, fight.player), sparks.flying, traced));
    blood.frame(seconds, events, fight, camera, canvas.width / Math.max(1, canvas.height));
    scene.draw(camera, canvas.width, canvas.height, drawn, chosen === you ? null : chosen, (encoder, view) => {
      if (inFirstPerson) firstPerson.draw(encoder, view, canvas.width, canvas.height);
    });
    const where = (id: number): [number, number, number] | null => {
      if (id === fight.player && own) return [own.x, own.y, own.z];
      const figure = foeFigures.get(id) ?? others.get(id);
      return figure ? [figure.x, figure.y, figure.z] : null;
    };
    // Each foe marked where its figure is drawn.
    const foesMarked = [...fight.foes.values()].map((kept) => {
      const figure = foeFigures.get(kept.id);
      const view = figure ? { ...kept.view, x: figure.x, y: figure.y, z: figure.z } : kept.view;
      return { id: kept.id, name: foeKind(kept.kind)?.name ?? 'Foe', view };
    });
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
    requestAnimationFrame(frame);
  };

  /** Every foe's figure, gliding toward where the room last saw it (`frameTicks` the frame's share of ticks) and showing
   *  the move its fight holds it to. */
  const drawFoes = (eye: { x: number; y: number }, frameTicks: number): CardAt[] => {
    const cards: CardAt[] = [];
    for (const kept of fight.foes.values()) {
      const kind = foeKind(kept.kind);
      if (!kind) continue;
      let placed = foeFigures.get(kept.id);
      if (!placed) {
        placed = {
          id: foeId--,
          x: kept.view.x,
          y: kept.view.y,
          z: 0,
          facing: 0,
          dress: kind.dress,
          anim: 'idle',
          frame: null,
          spin: false,
        };
        foeFigures.set(kept.id, placed);
      }
      const { view } = kept;
      const doing = foeDoing(view, kept.before, kind.dress, kept.ticks * movement.tickSeconds);
      const move = shownMove(
        doing,
        (anim) => forge.frames(kind.dress.body, anim),
        (anim, held) => forge.draws(kind.dress.body, anim, held),
      );
      const moveFrames = forge.frames(kind.dress.body, move.anim);
      const frameShown = move.frame ?? Math.floor(clock / Math.max(move.frameSeconds, 0.01)) % moveFrames;
      const [x, y, z] = foeGlides.follow(kept.id, [view.x, view.y, view.z], fight.roomTick, frameTicks);
      Object.assign(placed, {
        x,
        y,
        z,
        facing: view.facing,
        anim: move.anim,
        frame: frameShown,
      });
      forge.warm(kind.dress, ['idle', 'walk', 'run', 'thrust', 'chop', 'swing2h', 'parry', 'hurt', 'death', 'jump']);
      const { view: side, flip } = viewOf(placed.facing, placed.x, placed.y, eye.x, eye.y);
      const card = forge.card(placed.id, kind.dress, move.anim, side, frameShown, flip);
      const flash = { share: flashes.shareOf(kept.id), red: false };
      if (card) cards.push({ card, ...cardStand(placed.x, placed.y, eye.x, eye.y), z: placed.z, flip, flash });
    }
    for (const id of foeFigures.keys()) if (!fight.foes.has(id)) foeFigures.delete(id);
    foeGlides.keep(new Set(fight.foes.keys()));
    return cards;
  };
  requestAnimationFrame(frame);
}

start().catch((error: unknown) => {
  const message = error instanceof GpuUnavailable || error instanceof Error ? error.message : String(error);
  document.body.textContent = message;
  document.body.style.cssText = 'color:#ddd;font:16px system-ui;padding:24px';
});
