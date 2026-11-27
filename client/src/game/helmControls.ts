// What the helm's and the map's controls do, from the HUD's presses and the keys: the map raised at the helm or over
// the land, Manage, the helm left and taken again, the voyage stopped or resumed, and a mark chosen at sea.
import { DUNGEON_MAP } from './dungeonMap/dungeonMap.ts';
import type { Playing } from './gameFrame.ts';
import { gearScreenOpen } from './gearWindow.ts';
import { landSheetOf } from './landMap.ts';
import type { LandSheet } from '../heldmap/landSheet.ts';
import type { NodeInfo } from './worldData.ts';

/** What the controls ask of the game: a mark at sea chosen (`seaLandings.ts`), the ground under a point, the web's
 *  map where the player stands in a passage zone (none elsewhere), and the runs whose sealed doors are a patrol zone's
 *  passage gates. */
interface HelmGame {
  readonly mark: (id: string) => void;
  readonly groundAt: (x: number, y: number) => number | null;
  readonly passageMap: () => LandSheet | null;
  readonly mouthRuns: (node: NodeInfo) => readonly string[];
}

/** The helm's and the map's controls over `playing`, the pointer `input` locked to walk the deck. */
export function helmControls(playing: Playing, input: { lock(): void }, game: HelmGame) {
  const { groundAt } = game;
  /** Takes the view down to the ship's helm, where the map is raised; on foot, raises the map of the land there, the
   *  pointer let go to pan it, or in a passage zone the web's, under ground too; none in a dungeon or a Breach's run,
   *  under no land. */
  const openMap = () => {
    const { flow, sea, foot } = playing;
    if (flow.mode === 'sea' && sea) playing.helmMap.open(sea);
    else if (flow.mode === 'foot' && !gearScreenOpen() && foot && !foot.fallen) {
      // Read each time it is raised, off the ground as the camera keeps it (an island's, or the land's exact round the
      // player): the ground drawn by then is the truest.
      const passage = game.passageMap();
      // In a dungeon the same key opens its own map; in a passage zone, under ground or not, the web's.
      if (!passage && foot.dungeon) DUNGEON_MAP.toggle();
      else if (passage || !foot.mapless)
        playing.helmMap.openLand(
          passage ?? landSheetOf(foot.node, playing.landmass, groundAt, game.mouthRuns(foot.node)),
        );
      else return;
      document.exitPointerLock();
    }
  };

  /** Opens Manage over its deck, or closes it. */
  const manage = () => {
    if (playing.flow.mode === 'sea' && !playing.sea?.aboard.walking) playing.sea?.manage();
  };

  /** The player leaves the helm to walk its deck, the pointer held to look round as on foot. */
  const leaveHelm = () => {
    if (playing.flow.mode === 'sea' && playing.sea?.leaveHelm()) input.lock();
  };

  /** Takes the helm again, at its wheel. */
  const takeHelm = () => {
    if (playing.flow.mode === 'sea') playing.sea?.takeHelm();
  };

  /** Stops the voyage under way, or resumes the one stopped. */
  const stopOrResume = () => {
    if (playing.flow.mode !== 'sea' || !playing.sea || playing.sea.aboard.active) return;
    if (playing.sea.resumable) playing.sea.resume();
    else playing.sea.stop();
  };

  /** A mark clicked on the HUD: at sea, a port's or a hostile ship's; the island's tiles hold the landings. */
  const choose = (id: string) => {
    if (playing.flow.mode === 'sea') game.mark(id);
  };

  return { openMap, manage, leaveHelm, takeHelm, stopOrResume, choose };
}
