// The story made from the game's own parts once they have loaded: the stage's drawers, voices, sounds and screen, the
// Brig's and Thule's Frigate's models beside the Sloop's, the storm's place off Saltmere, the player's look as kept, and the director that runs it all from the beat asked for. Thule's Frigate is
// drawn only from the sea fight on, so its view is made the first time a beat draws it: a player who has played the
// story through and sees only the intro never makes it.
import cast from '../../../../content/story/cast.json' with { type: 'json' };
import scenes from '../../../../content/story/prologue.json' with { type: 'json' };
import ships from '../../../../content/ships/ships.json' with { type: 'json' };
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
import { HULL_NAMES, hullPaint } from '../../ships/hulls.ts';
import { ShipView } from '../../ships/shipView.ts';
import { castOf, scenesOf } from '../../speech/cast.ts';
import { DialogueBox } from '../../speech/dialogue.ts';
import { Overheads } from '../../speech/overheads.ts';
import type { LandWorker } from '../../terrain/landClient.ts';
import type { FigureView } from '../figureView.ts';
import type { FootView } from '../footView.ts';
import type { Hud } from '../hud.ts';
import type { LandDrawers } from '../landDrawers.ts';
import type { Landmass } from '../landmass.ts';
import type { GameScene } from '../scene.ts';
import type { Ambience as WorldAmbience } from '../audio/ambience/ambience.ts';
import type { MusicDirector } from '../audio/music/director.ts';
import { worldOutput } from '../uiSounds.ts';
import type { BeatName } from './beat.ts';
import { Brig } from './brig.ts';
import { Epilogue } from './epilogue.ts';
import { FIRST_LOOK, armouredDress, keptLook, type Look } from './look.ts';
import { Nameplate } from './nameplate.ts';
import { Objective } from './objective.ts';
import { stormPlaces } from './places.ts';
import { Prologue } from './prologue.ts';
import { Sailing } from './sailing.ts';
import { Stage } from './stage.ts';
import { readWreck } from './wreckLayout.ts';
import type { WreckDrawn } from './wreckScenery.ts';
import { loadWreck } from './wreckView.ts';
import { takeOrGiveBack } from './takeOrGiveBack.ts';

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
  readonly movement: MovementRules;
  readonly walker: Walker;
  readonly input: Input;
  readonly roomModule: Promise<WebAssembly.Module>;
  readonly roster: readonly FoeType[];
  readonly marks: MarkView;
  readonly link: AccountLink | null;
  readonly sloop: ShipView;
  readonly home: { readonly landmass: Landmass; readonly drawers: LandDrawers };
  readonly closeSource: (left: number, top: number, step: number, size: number) => ReturnType<LandWorker['ground']>;
  readonly music: MusicDirector;
  /** The game's own soundscape. */
  readonly ambience: WorldAmbience;
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

/** The wreck's mesh and light, fetched once, the first time they are asked for. */
function onceFetched(): () => Promise<WreckDrawn> {
  let fetched: Promise<WreckDrawn> | null = null;
  return () => (fetched ??= loadWreck(ships.base, readWreck().drawn));
}

export async function startStory(game: StoryGame, from: BeatName | null): Promise<Started> {
  const { gpu, scene, hudRoot } = game;
  const wreckDrawn = onceFetched();
  // The story's own words are read, and refused if they do not hold, before it takes anything from the page.
  const readCast = castOf(cast);
  const readScenes = scenesOf(scenes, readCast);
  const [brigMesh, frigateMesh] = await Promise.all([loadShip('brig'), loadShip('frigate')]);
  // The ships' views open on the device's kit, so both are opened before the story takes them.
  const [brigView, frigateView] = await Promise.all([
    ShipView.open(gpu, brigMesh, shipSails('brig'), hullPaint(HULL_NAMES.indexOf('brig'))),
    ShipView.open(gpu, frigateMesh, shipSails('frigate'), hullPaint(HULL_NAMES.indexOf('frigate'))),
  ]);
  return takeOrGiveBack((took) => {
    took(() => {
      for (const view of [brigView, frigateView]) view.destroy();
    });
    const hulls = { brig: brigView, sloop: game.sloop, frigate: frigateView };
    const [birds, flames] = [new Birds(gpu), new Flames(gpu)];
    took(() => birds.destroy());
    took(() => flames.destroy());
    // The screen takes the page's touches and its canvas's ease for the game until it is removed.
    const screen = new Screen(hudRoot, game.canvas);
    took(() => screen.remove());
    const dialogue = new DialogueBox(hudRoot, worldOutput);
    took(() => dialogue.remove());
    const overheads = new Overheads(hudRoot, worldOutput);
    took(() => overheads.remove());
    const objective = new Objective(hudRoot);
    took(() => objective.remove());
    const nameplate = new Nameplate(hudRoot);
    took(() => nameplate.remove());
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
      dialogue,
      overheads,
      ambience: new Ambience(worldOutput),
      music: game.music,
      worldSound: game.ambience,
      objective,
      cast: readCast,
      scenes: readScenes,
      roster: game.roster,
      landDrawers: () => game.home.drawers,
      landmass: () => game.home.landmass,
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
      // Where the world's soundscape is heard, a strike's thunder is its own, as late as its distance makes it.
      lightning: new Lightning(
        17,
        (distanceKm: number) => stage.hearsTheWorld || stage.parts.ambience.thunder(distanceKm),
      ),
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
    // The player wears the story's look from its first beat; one that cannot begin leaves them as the game made them.
    const gameDress = game.walker.you.dress;
    game.walker.you.dress = dress;
    took(() => (game.walker.you.dress = gameDress));
    const wreckContext = {
      movement: game.movement,
      walker: game.walker,
      forge: game.forge,
      roomModule: game.roomModule,
      groundAt: (x: number, y: number) => scene.groundAt(x, y),
      gpu,
      drawn: wreckDrawn,
    };
    const prologue = new Prologue(story, nameplate, wreckContext, from);
    const leave = () => {
      stage.leave();
      prologue.leave();
      // The Sloop is the game's own, drawn after the story too; the rest was the story's alone.
      for (const view of [brigView, frigateView]) view?.destroy();
      birds.destroy();
      flames.destroy();
    };
    return { prologue, epilogue: new Epilogue(stage, game.forge), look: () => story.look, leave };
  });
}
