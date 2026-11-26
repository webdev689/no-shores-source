// What the game's frames draw with (`gameFrame.ts`): the page's views and pieces, made once, and the travel they may
// call on.
import type { FirstPerson } from '../firstperson/firstPerson.ts';
import type { Gpu } from '../gpu.ts';
import type { Input } from '../player/input.ts';
import type { Walker } from '../player/walker.ts';
import type { ShipModels } from '../ships/shipModels.ts';
import type { Stack } from '../ui/stack.ts';
import type { seaWeatherOn } from '../water/seaWeather.ts';
import type { Ambience } from './audio/ambience/ambience.ts';
import type { MusicDirector } from './audio/music/director.ts';
import type { Charting } from './charting.ts';
import type { Berthed } from './docking.ts';
import type { Drain } from './drain.ts';
import type { DrawnInterface } from './drawnInterface.ts';
import type { DungeonDrawers } from './dungeonDrawers.ts';
import type { EventPropsDraw } from './eventPropsDraw.ts';
import type { FigureView } from './figureView.ts';
import type { Happening } from './flow.ts';
import type { Foot } from './foot.ts';
import type { FootView } from './footView.ts';
import type { FriendlyTraffic, FriendlyWater } from './friendlyShips.ts';
import type { Hud } from './hud.ts';
import type { Landmass } from './landmass.ts';
import type { PassageGame } from './passages/passageGame.ts';
import type { StoryHost } from './prologue/host.ts';
import type { Drawer, GameScene } from './scene.ts';
import type { showSeaHud } from './seaHud.ts';
import type { ShipPeople } from './shipPeople.ts';
import type { HullBuild } from './shipPanel.ts';
import type { NodeInfo } from './worldData.ts';
import type { WorldShown } from './worldShown.ts';

/** What the frames draw with: the page's views and pieces, made once, and the travel they may call on. */
export interface FrameParts {
  readonly gpu: Gpu;
  readonly canvas: HTMLCanvasElement;
  readonly hud: Hud;
  /** The interface the game draws, its layers, and death's grey drawn under it. */
  readonly ui: DrawnInterface;
  readonly stack: Stack;
  readonly drain: Drain;
  readonly input: Input;
  readonly scene: GameScene;
  readonly walker: Walker;
  readonly firstPerson: FirstPerson;
  readonly footView: FootView;
  readonly shipModels: ShipModels;
  readonly figureView: FigureView;
  /** The public events' props, set from the event's view each frame on foot and emptied at sea. */
  readonly eventProps: EventPropsDraw;
  readonly traffic: FriendlyTraffic;
  /** The people aboard every other ship drawn, at sea and seen from land. */
  readonly crews: ShipPeople;
  readonly shown: WorldShown;
  readonly charting: Charting<Landmass>;
  readonly seaWeather: ReturnType<typeof seaWeatherOn>;
  readonly seaView: { reachM: number };
  /** The waterline and the build of the hull the player sails. */
  readonly waterline: () => Parameters<typeof showSeaHud>[3]['waterline'];
  readonly builtShip: () => HullBuild | null;
  /** Where the player's ship lies docked, if it does (`docking.ts`), drawn there while they are on that island. */
  readonly docked: () => Berthed | null;
  readonly closeSource: Parameters<GameScene['keepClose']>[1];
  readonly waterHere: () => FriendlyWater;
  /** The leave held through: back to the ship on the room's yes, or told why not. */
  readonly leave: () => void;
  readonly travel: (happening: Happening, work: () => Promise<void>) => void;
  readonly goFoot: (node: NodeInfo, facing: number) => Promise<void>;
  /** The story that opens the game, if it does, and the arrival at the first node it hands the player to: `resuming`,
   *  where they last left the overworld or a social space (`relog.ts`). */
  readonly story: StoryHost | null;
  readonly arrive: (resuming?: boolean) => void;
  /** The sea's islands kept, shown and walked ashore on, each frame; their drawer; and the ground the camera keeps
   *  over, the islands' with the land's. */
  readonly isleFrame: () => void;
  readonly isles: Drawer;
  readonly groundAt: (x: number, y: number) => number | null;
  /** The world the music hears a node of, the music and the ambience that play as the game goes. */
  readonly world: Parameters<MusicDirector['onFoot']>[0];
  readonly music: MusicDirector;
  readonly ambience: Ambience;
  /** A patrol's dungeon entrances among the land's drawers, and a dungeon drawn as its own scene. */
  readonly dungeons: DungeonDrawers;
  /** What a frame on foot heeds first (`startActivities`): true when the room's gate sent the player away, and nothing
   *  more of the place is drawn. */
  readonly heed: (here: Foot) => boolean;
  /** The passages as played (`passages/passageGame.ts`), and their pieces in a zone, drawn under the figures. */
  readonly passages: PassageGame;
  readonly pieces: Drawer;
}
