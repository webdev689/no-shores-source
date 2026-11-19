// The story made from the game's own parts once they have loaded: the stage's drawers, voices, sounds and screen, the
// Brig's and Thule's Frigate's models beside the Sloop's, the islands the intro flies over, the storm's place off
// Saltmere, the player's look as kept, and the director that runs it all from the beat asked for. Thule's Frigate is
// drawn only from the sea fight on, so its view is made the first time a beat draws it: a player who has played the
// story through and sees only the intro never makes it.
import cast from '../../../../content/story/cast.json' with { type: 'json' };
import scenes from '../../../../content/story/prologue.json' with { type: 'json' };
import { Ambience } from '../../cinema/ambience.ts';
import { Birds } from '../../cinema/birds.ts';
import { Flames } from '../../cinema/flames.ts';
import { Lightning } from '../../cinema/lightning.ts';
import { Screen } from '../../cinema/screen.ts';
import type { FirstPerson } from '../../firstperson/firstPerson.ts';
import type { Gpu } from '../../gpu.ts';
import type { AccountLink } from '../../network/accounts.ts';
import type { Cards } from '../../player/cards.ts';
import type { Input } from '../../player/input.ts';
import type { Walker } from '../../player/walker.ts';
import type { MovementRules } from '../../rules/movementRules.ts';
import type { FoeType } from '../../rules/roster.ts';
import type { MarkView } from '../../ships/markView.ts';
import { loadShip, shipSails } from '../../ships/shipMesh.ts';
import { ShipView } from '../../ships/shipView.ts';
import { castOf, scenesOf } from '../../speech/cast.ts';
import { DialogueBox } from '../../speech/dialogue.ts';
import { Overheads } from '../../speech/overheads.ts';
import type { LandWorker } from '../../terrain/landClient.ts';
import type { TerrainData } from '../../terrain/terrainView.ts';
import type { FigureView } from '../figureView.ts';
import type { FootView } from '../footView.ts';
import type { Hud } from '../hud.ts';
import type { LandDrawers } from '../landDrawers.ts';
import { type Landmass, openLandmass } from '../landmass.ts';
import type { GameScene } from '../scene.ts';
import { worldOutput } from '../uiSounds.ts';
import type { WorldData } from '../worldData.ts';
import type { BeatName } from './beat.ts';
import { Brig } from './brig.ts';
import { Epilogue } from './epilogue.ts';
import { Islands } from './islands.ts';
import { FIRST_LOOK, armouredDress, keptLook, type Look } from './look.ts';
import { Nameplate } from './nameplate.ts';
import { Objective } from './objective.ts';
import { stormPlaces } from './places.ts';
import { Prologue } from './prologue.ts';
import { Sailing } from './sailing.ts';
import { Stage } from './stage.ts';

/** What the game hands the story. */
export interface StoryGame {
  readonly gpu: Gpu;
  readonly canvas: HTMLCanvasElement;
  readonly hudRoot: HTMLElement;
  readonly hud: Hud;
  readonly scene: GameScene;
  readonly figures: FigureView;
  readonly footView: FootView;
  readonly forge: Cards;
  readonly firstPerson: FirstPerson;
  readonly land: LandWorker;
  readonly world: WorldData;
  readonly rmbText: string | null;
  readonly movement: MovementRules;
  readonly walker: Walker;
  readonly input: Input;
  readonly roomModule: Promise<WebAssembly.Module>;
  readonly roster: readonly FoeType[];
  readonly marks: MarkView;
  readonly link: AccountLink | null;
  readonly sloop: ShipView;
  readonly home: { readonly landmass: Landmass; readonly drawers: LandDrawers };
  readonly drawersOn: (landmass: Landmass) => LandDrawers;
  readonly terrainFor: (landmass: Landmass) => TerrainData;
  readonly closeSource: (left: number, top: number, step: number, size: number) => ReturnType<LandWorker['ground']>;
}

/** The story and the epilogue it leaves for the game to play on foot. */
export interface Started {
  readonly prologue: Prologue;
  readonly epilogue: Epilogue;
  /** The look the player has made themselves, as it stands now. */
  look(): Look;
  /** The story's end: the stage gives the game back, and what the story alone drew with is let go on the GPU. */
  leave(): void;
}

export async function startStory(game: StoryGame, from: BeatName | null): Promise<Started> {
  const { gpu, scene, hudRoot } = game;
  const [brigMesh, frigateMesh] = await Promise.all([loadShip('brig'), loadShip('frigate')]);
  const brigView = new ShipView(gpu, brigMesh, shipSails('brig'));
  let frigateView: ShipView | null = null;
  const hulls = {
    brig: brigView,
    sloop: game.sloop,
    get frigate(): ShipView {
      frigateView ??= new ShipView(gpu, frigateMesh, shipSails('frigate'));
      return frigateView;
    },
  };
  const islands = new Islands({
    open: (id) => openLandmass(game.land, game.world, game.rmbText, id),
    scene,
    drawersOn: game.drawersOn,
    terrainFor: game.terrainFor,
    home: game.home,
  });
  const readCast = castOf(cast);
  const [birds, flames] = [new Birds(gpu), new Flames(gpu)];
  const screen = new Screen(hudRoot, game.canvas);
  const stage = new Stage({
    gpu,
    canvas: game.canvas,
    hudRoot,
    hud: game.hud,
    scene,
    figures: game.figures,
    footView: game.footView,
    forge: game.forge,
    firstPerson: game.firstPerson,
    hulls,
    birds,
    flames,
    screen,
    dialogue: new DialogueBox(hudRoot, worldOutput),
    overheads: new Overheads(hudRoot, worldOutput),
    ambience: new Ambience(worldOutput),
    objective: new Objective(hudRoot),
    cast: readCast,
    scenes: scenesOf(scenes, readCast),
    roster: game.roster,
    landDrawers: () => islands.drawers,
    landmass: () => islands.landmass,
    keepClose: (point) => scene.keepClose(point, game.closeSource, () => undefined),
  });
  const sailing = new Sailing({
    brig: { waterline: brigMesh.waterline, sails: shipSails('brig') },
    sloop: { waterline: game.sloop.waterline, sails: shipSails('sloop') },
    frigate: { waterline: frigateMesh.waterline, sails: shipSails('frigate') },
  });
  const places = stormPlaces(game.home.landmass, scene.land?.swell?.bearing ?? 0);
  const look = keptLook(localStorage) ?? FIRST_LOOK;
  const dress = armouredDress(look);
  const story = {
    stage,
    sailing,
    brig: new Brig(places.storm, places.heading),
    lightning: new Lightning(17, (distanceKm: number) => stage.parts.ambience.thunder(distanceKm)),
    places,
    land: game.land,
    movement: game.movement,
    walker: game.walker,
    firstPerson: game.firstPerson,
    input: game.input,
    roomModule: game.roomModule,
    marks: game.marks,
    link: game.link,
    look,
    dress,
  };
  game.walker.you.dress = dress;
  const wreckContext = {
    movement: game.movement,
    walker: game.walker,
    forge: game.forge,
    roomModule: game.roomModule,
    groundAt: (x: number, y: number) => scene.groundAt(x, y),
    gpu,
    hulls: { brig: brigMesh, frigate: frigateMesh },
  };
  let prologue: Prologue;
  try {
    prologue = new Prologue(story, islands, new Nameplate(hudRoot), wreckContext, from);
  } catch (error) {
    // A story that cannot begin gives the page back its touches and its canvas's ease for the game.
    screen.remove();
    throw error;
  }
  const leave = () => {
    stage.leave();
    prologue.leave();
    // The Sloop is the game's own, drawn after the story too; the rest was the story's alone.
    for (const view of [brigView, frigateView]) view?.destroy();
    birds.destroy();
    flames.destroy();
  };
  return { prologue, epilogue: new Epilogue(stage, game.forge), look: () => story.look, leave };
}
